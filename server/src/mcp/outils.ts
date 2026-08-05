/**
 * Outils exposés au connecteur MCP.
 * ---------------------------------------------------------------------------
 * Les treize outils de l'Edge Function `mcp-connector`, en SQL direct.
 *
 * Tous sont en LECTURE SEULE, et cela n'est pas un hasard de portage : un
 * assistant branché sur le CRM d'un cabinet comptable ne doit pas pouvoir
 * modifier un dossier client. Si une écriture devient nécessaire un jour, ce
 * sera une décision à prendre explicitement, pas un effet de bord.
 *
 * Le filtre `cabinet_id` de l'original disparaît : une instance est à un seul
 * cabinet. Cela retire au passage un risque réel de l'original — les jointures
 * `client.cabinet_id` de PostgREST étaient faciles à oublier, et une seule
 * oubliée exposait les clients d'un autre cabinet.
 */

import { requete, requeteUne } from '../db.js';

export interface Outil {
  nom: string;
  titre: string;
  description: string;
  /** Schéma JSON des paramètres, tel que le protocole MCP l'attend. */
  parametres: {
    type: 'object';
    properties: Record<string, unknown>;
    required?: string[];
  };
  executer: (args: Record<string, unknown>) => Promise<unknown>;
}

/** Borne la pagination : un assistant qui demande 100 000 lignes est une erreur. */
function borne(v: unknown, defaut: number, max = 200): number {
  const n = typeof v === 'number' ? v : Number.parseInt(String(v ?? ''), 10);
  if (!Number.isFinite(n) || n <= 0) return defaut;
  return Math.min(n, max);
}

function decalage(v: unknown): number {
  const n = typeof v === 'number' ? v : Number.parseInt(String(v ?? ''), 10);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

function texte(v: unknown): string | null {
  return typeof v === 'string' && v.trim() !== '' ? v.trim() : null;
}

const PAGINATION = {
  limit: { type: 'number', description: 'Nombre maximum de resultats' },
  offset: { type: 'number', description: 'Decalage pour la pagination' },
};

export const OUTILS: Outil[] = [
  {
    nom: 'list_clients',
    titre: 'Lister les clients',
    description: 'Liste les clients du cabinet, avec recherche optionnelle par nom, SIREN, SIRET ou contact.',
    parametres: {
      type: 'object',
      properties: {
        search: { type: 'string', description: 'Recherche par nom, SIREN, SIRET ou contact' },
        ...PAGINATION,
      },
    },
    executer: async (a) => {
      const recherche = texte(a.search);
      // `ILIKE ANY` sur un seul motif : une seule expression pour quatre
      // colonnes, et le motif reste un paramètre — donc pas d'injection
      // possible, contrairement à la concaténation `.or()` de l'original.
      return requete(
        `SELECT id, nom_entreprise, siren, siret, email, telephone, forme_juridique,
                regime_fiscal, adresse, contact_principal, statut, numero_dossier, created_at
           FROM clients
          WHERE ($1::text IS NULL
                 OR nom_entreprise ILIKE '%' || $1 || '%'
                 OR contact_principal ILIKE '%' || $1 || '%'
                 OR siren ILIKE '%' || $1 || '%'
                 OR siret ILIKE '%' || $1 || '%')
          ORDER BY nom_entreprise
          LIMIT $2 OFFSET $3`,
        [recherche, borne(a.limit, 50), decalage(a.offset)]
      );
    },
  },

  {
    nom: 'get_client',
    titre: 'Detail client',
    description: "Detail complet d'un client, avec optionnellement ses dirigeants en fonction.",
    parametres: {
      type: 'object',
      properties: {
        client_id: { type: 'string', description: 'UUID du client' },
        include_officers: { type: 'boolean', description: 'Inclure les mandats actifs' },
      },
      required: ['client_id'],
    },
    executer: async (a) => {
      const client = await requeteUne('SELECT * FROM clients WHERE id = $1', [a.client_id]);
      if (!client) return { erreur: 'Client introuvable.' };
      if (a.include_officers !== true) return client;

      const dirigeants = await requete(
        `SELECT oc.id, oc.role, oc.role_type, oc.start_date, oc.end_date,
                oc.is_active, oc.power_type, oc.notes,
                to_jsonb(co.*) - 'created_at' - 'updated_at' AS officer
           FROM officer_companies oc
           JOIN company_officers co ON co.id = oc.officer_id
          WHERE oc.client_id = $1 AND oc.is_active
          ORDER BY oc.role`,
        [a.client_id]
      );
      return { ...client, officers: dirigeants };
    },
  },

  {
    nom: 'list_tasks',
    titre: 'Lister les taches',
    description: 'Liste les taches du cabinet, avec filtre optionnel par statut.',
    parametres: {
      type: 'object',
      properties: {
        status: { type: 'string', description: 'todo, in_progress, done ou archived' },
        ...PAGINATION,
      },
    },
    executer: async (a) =>
      requete(
        `SELECT id, title, description, status, priority, due_date, assigned_to,
                category_id, client_id, created_at
           FROM tasks
          WHERE ($1::text IS NULL OR status = $1)
          ORDER BY created_at DESC
          LIMIT $2 OFFSET $3`,
        [texte(a.status), borne(a.limit, 50), decalage(a.offset)]
      ),
  },

  {
    nom: 'get_task',
    titre: 'Detail tache',
    description: "Detail complet d'une tache.",
    parametres: {
      type: 'object',
      properties: { task_id: { type: 'string', description: 'UUID de la tache' } },
      required: ['task_id'],
    },
    executer: async (a) =>
      (await requeteUne('SELECT * FROM tasks WHERE id = $1', [a.task_id])) ?? {
        erreur: 'Tache introuvable.',
      },
  },

  {
    nom: 'list_fiscal_deadlines',
    titre: 'Lister les echeances fiscales',
    description: 'Cartes du tableau des echeances fiscales, par date d\'echeance.',
    parametres: { type: 'object', properties: PAGINATION },
    executer: async (a) =>
      requete(
        `SELECT id, client_id, column_id, notes, due_date, assigned_to, position, created_at
           FROM fiscal_deadline_cards
          ORDER BY due_date NULLS LAST
          LIMIT $1 OFFSET $2`,
        [borne(a.limit, 50), decalage(a.offset)]
      ),
  },

  {
    nom: 'list_balance_sheets',
    titre: 'Lister les bilans',
    description: 'Cartes du tableau des bilans.',
    parametres: { type: 'object', properties: PAGINATION },
    executer: async (a) =>
      requete(
        `SELECT id, client_id, column_id, notes, exercice_end, assigned_to, position, created_at
           FROM bilan_cards
          ORDER BY created_at DESC
          LIMIT $1 OFFSET $2`,
        [borne(a.limit, 50), decalage(a.offset)]
      ),
  },

  {
    nom: 'list_opportunities',
    titre: 'Lister les opportunites',
    description: 'Cartes du tableau commercial.',
    parametres: { type: 'object', properties: PAGINATION },
    executer: async (a) =>
      requete(
        `SELECT id, prospect_name, column_id, notes, amount, probability,
                assigned_to, position, created_at
           FROM opportunity_cards
          ORDER BY created_at DESC
          LIMIT $1 OFFSET $2`,
        [borne(a.limit, 50), decalage(a.offset)]
      ),
  },

  {
    nom: 'list_collaborators',
    titre: 'Lister les collaborateurs',
    description: 'Collaborateurs du cabinet.',
    parametres: { type: 'object', properties: {} },
    executer: async () =>
      requete(
        `SELECT id, prenom, nom, email, role, job_role, is_active, created_at
           FROM profiles
          ORDER BY nom`
      ),
  },

  {
    nom: 'list_software',
    titre: 'Lister les logiciels',
    description: 'Logiciels recenses par le cabinet.',
    parametres: { type: 'object', properties: {} },
    executer: async () =>
      requete(
        `SELECT id, name, category, license_type, notes, is_active, created_at
           FROM software
          ORDER BY name`
      ),
  },

  {
    nom: 'list_meeting_notes',
    titre: 'Lister les comptes rendus',
    description: 'Comptes rendus de rendez-vous client, du plus recent au plus ancien.',
    parametres: {
      type: 'object',
      properties: {
        client_id: { type: 'string', description: 'Filtrer par UUID du client' },
        ...PAGINATION,
      },
    },
    executer: async (a) =>
      requete(
        `SELECT id, client_id, title, content, type_rdv, meeting_date, created_by, created_at
           FROM client_meeting_notes
          WHERE ($1::uuid IS NULL OR client_id = $1::uuid)
          ORDER BY meeting_date DESC NULLS LAST
          LIMIT $2 OFFSET $3`,
        [texte(a.client_id), borne(a.limit, 30), decalage(a.offset)]
      ),
  },

  {
    nom: 'list_officers',
    titre: 'Lister les dirigeants',
    description: 'Mandats de dirigeants, avec filtres par client, type de role et activite.',
    parametres: {
      type: 'object',
      properties: {
        client_id: { type: 'string', description: 'Filtrer par UUID du client' },
        role_type: {
          type: 'string',
          description: 'dirigeant, administrateur, commissaire, associe ou autre',
        },
        active_only: { type: 'boolean', description: 'Uniquement les mandats en cours (defaut : oui)' },
        ...PAGINATION,
      },
    },
    executer: async (a) =>
      requete(
        `SELECT oc.id, oc.role, oc.role_type, oc.start_date, oc.end_date,
                oc.is_active, oc.power_type, oc.notes,
                to_jsonb(co.*) - 'created_at' - 'updated_at' AS officer,
                jsonb_build_object('id', c.id, 'nom_entreprise', c.nom_entreprise,
                                   'siren', c.siren) AS client
           FROM officer_companies oc
           JOIN company_officers co ON co.id = oc.officer_id
           JOIN clients c ON c.id = oc.client_id
          WHERE ($1::uuid IS NULL OR oc.client_id = $1::uuid)
            AND ($2::text IS NULL OR oc.role_type = $2)
            AND ($3::boolean IS DISTINCT FROM true OR oc.is_active)
          ORDER BY oc.is_active DESC, c.nom_entreprise
          LIMIT $4 OFFSET $5`,
        [
          texte(a.client_id),
          texte(a.role_type),
          // Actifs seulement par défaut, comme dans l'original : passer
          // explicitement false élargit aux mandats terminés.
          a.active_only !== false,
          borne(a.limit, 50),
          decalage(a.offset),
        ]
      ),
  },

  {
    nom: 'get_officer',
    titre: 'Detail dirigeant',
    description: "Detail d'un dirigeant et de tous ses mandats, en cours et termines.",
    parametres: {
      type: 'object',
      properties: {
        officer_id: { type: 'string', description: 'UUID du dirigeant' },
      },
      required: ['officer_id'],
    },
    executer: async (a) => {
      const dirigeant = await requeteUne('SELECT * FROM company_officers WHERE id = $1', [
        a.officer_id,
      ]);
      if (!dirigeant) return { erreur: 'Dirigeant introuvable.' };

      const mandats = await requete(
        `SELECT oc.id, oc.role, oc.role_type, oc.start_date, oc.end_date,
                oc.is_active, oc.power_type, oc.notes,
                jsonb_build_object('id', c.id, 'nom_entreprise', c.nom_entreprise,
                                   'siren', c.siren) AS client
           FROM officer_companies oc
           JOIN clients c ON c.id = oc.client_id
          WHERE oc.officer_id = $1
          ORDER BY oc.is_active DESC, oc.start_date DESC NULLS LAST`,
        [a.officer_id]
      );
      return { ...dirigeant, mandates: mandats };
    },
  },

  {
    nom: 'search',
    titre: 'Recherche globale',
    description: 'Recherche simultanee dans les clients, taches, comptes rendus et dirigeants.',
    parametres: {
      type: 'object',
      properties: { query: { type: 'string', description: 'Terme recherche' } },
      required: ['query'],
    },
    executer: async (a) => {
      const q = texte(a.query);
      if (!q) return { erreur: 'query manquant.' };

      // Quatre requêtes en parallèle : elles portent sur des tables distinctes,
      // et les enchaîner tripleraient le temps de réponse pour rien.
      const [clients, taches, comptesRendus, dirigeants] = await Promise.all([
        requete(
          `SELECT id, nom_entreprise, siren, siret, email, contact_principal
             FROM clients
            WHERE nom_entreprise ILIKE '%' || $1 || '%'
               OR contact_principal ILIKE '%' || $1 || '%'
               OR siren ILIKE '%' || $1 || '%'
               OR email ILIKE '%' || $1 || '%'
            ORDER BY nom_entreprise
            LIMIT 10`,
          [q]
        ),
        requete(
          `SELECT id, title, description, status
             FROM tasks
            WHERE title ILIKE '%' || $1 || '%' OR description ILIKE '%' || $1 || '%'
            ORDER BY created_at DESC
            LIMIT 10`,
          [q]
        ),
        requete(
          `SELECT id, title, content, client_id, meeting_date
             FROM client_meeting_notes
            WHERE title ILIKE '%' || $1 || '%' OR content ILIKE '%' || $1 || '%'
            ORDER BY meeting_date DESC NULLS LAST
            LIMIT 10`,
          [q]
        ),
        requete(
          `SELECT DISTINCT co.id, co.full_name, co.person_type, co.denomination
             FROM company_officers co
             JOIN officer_companies oc ON oc.officer_id = co.id
            WHERE co.full_name ILIKE '%' || $1 || '%'
               OR co.denomination ILIKE '%' || $1 || '%'
            ORDER BY co.full_name
            LIMIT 10`,
          [q]
        ),
      ]);

      return { clients, tasks: taches, meeting_notes: comptesRendus, officers: dirigeants };
    },
  },
];

export const OUTILS_PAR_NOM = new Map(OUTILS.map((o) => [o.nom, o]));
