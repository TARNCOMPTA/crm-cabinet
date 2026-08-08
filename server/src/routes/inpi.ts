/**
 * Routes INPI.
 * ---------------------------------------------------------------------------
 * Remplacent les Edge Functions `inpi-api` et `inpi-sync`. Les deux chemins
 * `/api/inpi-api` et `/api/inpi-sync` sont conservés, avec les mêmes noms
 * d'actions et les mêmes formes de réponse : le front en compte dix appels, et
 * changer le contrat aurait obligé à réécrire `inpiService.ts` en entier pour
 * aucun gain.
 *
 * Ce qui change sous le capot : plus de jeton INPI reconstruit à chaque appel
 * (voir inpi/client.ts), plus de contrôle `cabinet_id` — il n'y a qu'un cabinet.
 *
 * Un défaut de l'original est corrigé au passage, signalé là où il se trouve :
 * `auto-sync-cabinet` récupérait les données de l'INPI puis les jetait.
 */

import type { FastifyBaseLogger, FastifyInstance } from 'fastify';
import { requete, requeteUne } from '../db.js';
import { exigerSession, exigerAdmin } from '../gardes.js';
import { ErreurInpi, tester as testerInpi } from '../inpi/client.js';
import { convertirJJMMEnDate } from '../inpi/dates.js';
import { choisirStatuts } from '../inpi/statuts.js';
import {
  chercherParNom,
  chercherParSiren,
  listerPieces,
  telechargerPiece,
} from '../inpi/service.js';

interface CorpsInpi {
  action?: string;
  siret?: string;
  siren?: string;
  query?: string;
  documentId?: string;
  clientId?: string;
  intervalDays?: number;
}

/**
 * Champs de `clients` que la synchronisation a le droit d'écraser.
 *
 * Liste explicite, et non `UPDATE ... SET tout ce que renvoie l'INPI` : le
 * registre ne connaît ni le numéro de dossier, ni le collaborateur affecté, ni
 * les dates d'entrée au cabinet. Une écriture large effacerait le travail de
 * saisie du cabinet à chaque synchronisation.
 */
const CHAMPS_SYNCHRONISABLES = [
  'nom_entreprise',
  'forme_juridique',
  // `adresse` N'EST PLUS SYNCHRONISEE : elle est recomposee par le declencheur
  // `clients_composer_adresse` a partir des six colonnes ci-dessous. L'y laisser
  // ferait combattre la synchronisation et le declencheur.
  'adresse_ligne1',
  'adresse_complement',
  'code_postal',
  'ville',
  'pays',
  'code_insee',
  'code_ape',
  'capital_social',
  'dirigeant',
  'date_creation_entreprise',
  'date_cloture_exercice_social',
  // Les trois que SEUL le navigateur ecrivait, et qu'il ecrivait SANS garde sur
  // le vide : synchroniser un entrepreneur individuel les VIDAIT. Elles
  // arrivent ici avec la garde anti-vide, ce qui corrige le defaut au passage.
  'date_cloture',
  'date_premiere_cloture',
  'description_activite',
  'siren',
  // Identite des personnes physiques. `nom_entreprise` reste dans la liste mais
  // n'est plus alimentee pour elles : l'extraction ne rend plus de
  // `denomination`, et le declencheur recompose « NOM Prenom ».
  'type_personne',
  'nom',
  'prenom',
  'prenoms',
  // ⚠️ `civilite` N'Y EST PAS : l'INPI ne la publie pas, et l'inscrire dans cette
  // liste blanche autoriserait une synchronisation a effacer une saisie du
  // cabinet. `tva_intracom` non plus : elle est derivee par declencheur.
  'nom_commercial',
  'etat_administratif',
] as const;

/** Correspondance entre les clés rendues par l'extraction et les colonnes. */
const CORRESPONDANCE: Record<string, (typeof CHAMPS_SYNCHRONISABLES)[number]> = {
  denomination: 'nom_entreprise',
  /*
   * ⚠️ `codeAPE` ET NON `codeApe`.
   *
   * La cle etait ecrite `codeApe` alors que l'extraction produit `codeAPE`. La
   * garde anti-vide plus bas ecartait donc l'`undefined` sans broncher, et LE
   * CHEMIN SERVEUR N'A JAMAIS ECRIT `code_ape` — ni la synchronisation d'une
   * fiche, ni `legal-sync-all`, ni `auto-sync-cabinet`, ni le cron nocturne.
   * Seul le chemin navigateur l'ecrivait, ce qui masquait le defaut.
   *
   * Un test de `extraction.ts` fige desormais la cle de sortie.
   */
  codeAPE: 'code_ape',
  capitalSocial: 'capital_social',
  dirigeant: 'dirigeant',
  dateCreation: 'date_creation_entreprise',
  dateClotureExerciceSocial: 'date_cloture_exercice_social',
  datePremiereCloture: 'date_premiere_cloture',
  descriptionActivite: 'description_activite',
  siren: 'siren',
  typePersonne: 'type_personne',
  nom: 'nom',
  prenom: 'prenom',
  prenoms: 'prenoms',
  nomCommercial: 'nom_commercial',
  etatAdministratif: 'etat_administratif',
};

/**
 * L'adresse, champ par champ.
 *
 * Separee de `CORRESPONDANCE` parce qu'elle vient d'un OBJET et non d'une valeur
 * plate : `donnees.adresse.ligne1` et non `donnees.ligne1`.
 *
 * ⚠️ CE QUI A REMPLACE `adresseEnTexte`, ET POURQUOI ON N'Y REVIENT PAS.
 *
 * L'extraction rend l'adresse sous forme d'objet, et les appelants de l'API la
 * consomment ainsi. Mais `clients.adresse` etait une colonne `text` : y passer
 * l'objet le faisait serialiser en JSON, et la fiche client affichait, accolades
 * comprises :
 *
 *     {"ligne1":"12 RUE de l Exemple","codePostal":"81120","ville":"Villeneuve"}
 *
 * C'est l'origine des 122 adresses illisibles trouvees le 2026-08-01. Elles
 * n'etaient pas un heritage de l'ancienne application : LA SYNCHRONISATION EN
 * FABRIQUAIT DE NOUVELLES A CHAQUE PASSAGE. Les normaliser en base sans corriger
 * cette ecriture n'aurait rien regle durablement.
 *
 * `adresseEnTexte` aplatissait donc l'objet au moment d'ecrire. Elle n'a plus
 * lieu d'etre : chaque composant a sa colonne, et le declencheur recompose le
 * texte. La lecon reste — UN OBJET NE DOIT JAMAIS ATTEINDRE UNE COLONNE `text`.
 */
const CORRESPONDANCE_ADRESSE: Record<string, (typeof CHAMPS_SYNCHRONISABLES)[number]> = {
  ligne1: 'adresse_ligne1',
  complement: 'adresse_complement',
  codePostal: 'code_postal',
  ville: 'ville',
  pays: 'pays',
  codeInsee: 'code_insee',
};

function messageErreur(e: unknown): { status: number; message: string } {
  if (e instanceof ErreurInpi) return { status: e.status >= 400 ? e.status : 502, message: e.message };
  return { status: 500, message: e instanceof Error ? e.message : 'Erreur interne.' };
}

/**
 * Écrit dans `clients` ce que l'INPI a renvoyé, sans écraser par du vide.
 *
 * Deux précautions, dans cet ordre d'importance :
 *
 *   1. Les valeurs vides sont écartées côté JavaScript, pas en SQL. L'INPI ne
 *      connaît pas tous les champs de tous les clients ; sans ce filtre, chaque
 *      synchronisation viderait un peu plus les fiches saisies à la main.
 *   2. `COALESCE($n, colonne)` plutôt qu'un `SET colonne = $n` sec : PostgreSQL
 *      déduit alors le type du paramètre de celui de la colonne, ce qui laisse
 *      passer `capital_social` (numeric) et `date_creation_entreprise` (date)
 *      sans transtypage explicite à écrire pour chacune.
 */
/**
 * Libelle d'une forme juridique, avec REPLI SUR LE CODE.
 *
 * ⚠️ LE REPLI EST LE POINT DE VIGILANCE DE CE PORTAGE. `legal_forms` est creee
 * VIDE par `cible.sql` — aucun INSERT nulle part — donc `getLegalFormLabel`
 * rendait le code brut sur une instance neuve et le libelle sur une instance
 * peuplee. Reproduire ce comportement a l'identique est obligatoire : sans le
 * repli, des libelles deja en base se transformeraient en codes, et
 * `LegalFormSelect` construit ses options avec `value={form.label}` — un code y
 * laisse le selecteur VIDE en edition.
 */
async function libelleFormeJuridique(code: unknown): Promise<unknown> {
  const brut = typeof code === 'string' ? code.trim() : '';
  if (!brut) return code;
  const ligne = await requeteUne<{ label: string }>(
    'SELECT label FROM legal_forms WHERE code = $1',
    [brut]
  );
  return ligne?.label ?? brut;
}

async function appliquerAuClient(
  clientId: string,
  donnees: Record<string, unknown>
): Promise<string[]> {
  const affectations: string[] = [];
  const modifiees: string[] = [];
  const valeurs: unknown[] = [clientId];

  const poser = (colonne: string, v: unknown): void => {
    // La garde anti-vide s'applique CHAMP PAR CHAMP, y compris pour l'adresse :
    // une synchronisation qui ne connait pas le complement ne doit pas effacer
    // celui que le cabinet a saisi.
    if (v === undefined || v === null || (typeof v === 'string' && v.trim() === '')) return;
    valeurs.push(v);
    affectations.push(`${colonne} = COALESCE($${valeurs.length}, ${colonne})`);
    modifiees.push(colonne);
  };

  for (const [cle, colonne] of Object.entries(CORRESPONDANCE)) {
    poser(colonne, donnees[cle]);
  }

  // `date_cloture` est une date ANNIVERSAIRE publiee en « JJMM » : elle demande
  // une conversion que seul le navigateur savait faire.
  poser(
    'date_cloture',
    convertirJJMMEnDate(
      (donnees.dateCloture as string | undefined) ??
        (donnees.dateClotureExerciceSocial as string | undefined)
    )
  );

  // Le libelle plutot que le code : c'est ce que la colonne contient deja, et ce
  // que `LegalFormSelect` attend.
  poser('forme_juridique', await libelleFormeJuridique(donnees.formeJuridique));

  const adresse = donnees.adresse;
  if (adresse && typeof adresse === 'object') {
    for (const [cle, colonne] of Object.entries(CORRESPONDANCE_ADRESSE)) {
      poser(colonne, (adresse as Record<string, unknown>)[cle]);
    }
  }

  // `last_inpi_sync` est mis à jour même sans champ exploitable : la date dit
  // « on a bien interrogé le registre », ce qui évite de réinterroger en boucle
  // un client que l'INPI ne renseigne pas.
  await requete(
    `UPDATE clients
        SET ${[...affectations, 'last_inpi_sync = now()', 'updated_at = now()'].join(', ')}
      WHERE id = $1`,
    valeurs
  );

  return modifiees;
}

export function enregistrerRoutesInpi(app: FastifyInstance): void {
  // ---- /api/inpi-sync ------------------------------------------------------
  app.post<{ Body: CorpsInpi }>('/api/inpi-sync', async (request, reply) => {
    const session = await exigerSession(request, reply);
    if (!session) return;

    const { action, siret, siren, clientId } = request.body ?? {};

    try {
      switch (action) {
        case 'test': {
          const r = await testerInpi();
          return { success: r.ok, message: r.message, tokenValid: r.ok };
        }

        case 'search':
        case 'sync': {
          if (!siret) {
            return reply.code(400).send({ success: false, message: 'siret manquant.' });
          }
          const r = await chercherParSiren(siret.replace(/\s/g, ''));
          if (!r.ok) return reply.code(404).send({ success: false, message: r.message });

          // `sync` écrit, `search` se contente de rendre : c'est la seule
          // différence entre les deux actions, et l'original les traitait
          // pourtant à l'identique — d'où une « synchronisation » qui
          // n'enregistrait rien.
          if (action === 'sync' && clientId && r.donnees) {
            await appliquerAuClient(clientId, r.donnees);
          }

          return { success: true, message: 'Donnees recuperees', companyData: r.donnees };
        }

        case 'fetch-acts': {
          if (!siren) {
            return reply.code(400).send({ success: false, message: 'siren manquant.' });
          }
          const actes = await listerPieces(siren.replace(/\s/g, ''));
          return {
            success: true,
            message: `${actes.length} acte(s) trouve(s)`,
            actsCount: actes.length,
            acts: actes,
          };
        }

        case 'download-document': {
          if (!siren) {
            return reply.code(400).send({ success: false, message: 'siren manquant.' });
          }
          // Sans identifiant de pièce, on prend les statuts : c'est ce que fait
          // le bouton « Télécharger les statuts » de la fiche client.
          //
          // Le choix vit dans `inpi/statuts.ts`, jumeau de `src/lib/statuts.ts`
          // côté front : l'un décide de ce qui est AFFICHÉ, l'autre de ce qui est
          // TÉLÉCHARGÉ, et les deux doivent désigner les mêmes pièces.
          const pieces = await listerPieces(siren.replace(/\s/g, ''));
          const statuts = choisirStatuts(pieces);
          if (!statuts?.id) {
            return reply.code(404).send({
              success: false,
              message: "Aucun statut depose au registre pour cette entreprise.",
            });
          }
          const r = await telechargerPiece(siren.replace(/\s/g, ''), statuts.id);
          if (!r.ok || !r.contenu) {
            return reply
              .code(404)
              .send({ success: false, message: r.message, portalUrl: r.urlPortail });
          }
          return reply
            .header('Content-Type', r.typeMime ?? 'application/pdf')
            .header('Content-Disposition', `attachment; filename="statuts_${siren}.pdf"`)
            .send(r.contenu);
        }

        case 'auto-sync-cabinet': {
          const admin = await exigerAdmin(request, reply);
          if (!admin) return;
          return synchroniserTousLesClients(app.log);
        }

        case 'schedule': {
          // L'original rendait un succès sans rien faire : la périodicité était
          // dans pg_cron, hors de portée de la fonction. Elle est désormais dans
          // l'ordonnanceur du serveur, donc réellement modifiable.
          const jours = request.body?.intervalDays;
          if (typeof jours === 'number' && jours > 0) {
            await requete(
              `UPDATE sync_settings
                  SET frequency = CASE WHEN $1 >= 30 THEN 'monthly'
                                       WHEN $1 >= 7  THEN 'weekly'
                                       ELSE 'daily' END,
                      updated_at = now()
                WHERE sync_type = 'inpi_officers'`,
              [jours]
            );
          }
          return { success: true, message: 'Periodicite enregistree.' };
        }

        default:
          return reply.code(400).send({ success: false, message: `Action inconnue : ${action}.` });
      }
    } catch (e) {
      const { status, message } = messageErreur(e);
      return reply.code(status).send({ success: false, message });
    }
  });

  // ---- /api/inpi-api ------------------------------------------------------
  app.post<{ Body: CorpsInpi }>('/api/inpi-api', async (request, reply) => {
    const session = await exigerSession(request, reply);
    if (!session) return;

    const { action, siren, query, documentId } = request.body ?? {};

    try {
      switch (action) {
        case 'search-companies': {
          if (!query) {
            return reply.code(400).send({ success: false, message: 'query manquant.' });
          }
          const r = await chercherParNom(query);
          return { success: r.ok, message: r.message, companies: r.entreprises };
        }

        case 'list-documents': {
          if (!siren) {
            return reply.code(400).send({ success: false, message: 'siren manquant.' });
          }
          const documents = await listerPieces(siren.replace(/\s/g, ''));
          return {
            success: true,
            message: `${documents.length} document(s) trouve(s)`,
            documents,
          };
        }

        case 'download-document': {
          if (!siren || !documentId) {
            return reply
              .code(400)
              .send({ success: false, message: 'siren et documentId requis.' });
          }
          const r = await telechargerPiece(siren.replace(/\s/g, ''), documentId);
          if (!r.ok || !r.contenu) {
            return reply
              .code(404)
              .send({ success: false, message: r.message, portalUrl: r.urlPortail });
          }
          return reply
            .header('Content-Type', r.typeMime ?? 'application/pdf')
            .header(
              'Content-Disposition',
              `attachment; filename="document_${siren}_${documentId}.pdf"`
            )
            .send(r.contenu);
        }

        default:
          return reply.code(400).send({ success: false, message: `Action inconnue : ${action}.` });
      }
    } catch (e) {
      const { status, message } = messageErreur(e);
      return reply.code(status).send({ success: false, message });
    }
  });

  // ---- /api/legal-sync-all ------------------------------------------------
  /**
   * Synchronisation de tous les clients actifs, à la demande.
   *
   * Le front appelle cette route depuis « Actes juridiques ». Elle enchaîne les
   * clients en série et non en parallèle : l'INPI limite les appels, et un
   * cabinet de 200 clients lancé de front se ferait couper.
   */
  app.post('/api/legal-sync-all', async (request, reply) => {
    const session = await exigerAdmin(request, reply);
    if (!session) return;
    return synchroniserTousLesClients(app.log);
  });
}

interface BilanSynchro {
  success: boolean;
  message: string;
  syncedCount: number;
  errorCount: number;
  total: number;
}

/**
 * Parcourt les clients actifs et met à jour leur fiche depuis l'INPI.
 *
 * L'Edge Function d'origine appelait bien l'INPI pour chaque client, mais
 * jetait le résultat : elle incrémentait un compteur et mettait à jour
 * `sync_settings`. Autrement dit la « synchronisation automatique » consommait
 * le quota INPI sans jamais rien écrire. Ici le résultat est appliqué.
 */
async function synchroniserTousLesClients(journal: FastifyBaseLogger): Promise<BilanSynchro> {
  const clients = await requete<{ id: string; siret: string | null; siren: string | null }>(
    `SELECT id, siret, siren
       FROM clients
      WHERE statut = 'actif' AND (siren IS NOT NULL OR siret IS NOT NULL)
      ORDER BY nom_entreprise`
  );

  await requete(
    `UPDATE sync_settings
        SET last_sync_status = 'running', updated_at = now()
      WHERE sync_type = 'inpi_officers'`
  );

  let synchronises = 0;
  let erreurs = 0;

  for (const client of clients) {
    const identifiant = (client.siren ?? client.siret ?? '').replace(/\s/g, '');
    if (identifiant.length < 9) continue;

    try {
      const r = await chercherParSiren(identifiant);
      if (r.ok && r.donnees) {
        await appliquerAuClient(client.id, r.donnees);
        synchronises++;
      } else {
        erreurs++;
      }
    } catch (e) {
      erreurs++;
      journal.warn(`[inpi] ${identifiant} : ${e instanceof Error ? e.message : String(e)}`);
      // Un 429 signifie qu'on a dépassé le rythme toléré : continuer ne ferait
      // qu'accumuler des échecs, on s'arrête pour reprendre au prochain tour.
      if (e instanceof ErreurInpi && e.status === 429) break;
    }
  }

  const message =
    `${synchronises}/${clients.length} client(s) synchronise(s)` +
    (erreurs > 0 ? `, ${erreurs} erreur(s)` : '');

  await requete(
    `UPDATE sync_settings
        SET last_sync_at = now(),
            last_sync_status = $1,
            last_sync_message = $2,
            updated_at = now()
      WHERE sync_type = 'inpi_officers'`,
    [erreurs === 0 ? 'success' : erreurs < clients.length ? 'partial' : 'error', message]
  );

  return {
    success: true,
    message,
    syncedCount: synchronises,
    errorCount: erreurs,
    total: clients.length,
  };
}

/** Réglages de synchronisation, pour l'ordonnanceur. */
export async function reglagesSynchro(): Promise<{
  actif: boolean;
  frequence: string;
  heure: number;
} | null> {
  const l = await requeteUne<{ is_enabled: boolean; frequency: string; sync_hour: number }>(
    `SELECT is_enabled, frequency, sync_hour
       FROM sync_settings
      WHERE sync_type = 'inpi_officers'
      LIMIT 1`
  ).catch(() => null);
  if (!l) return null;
  return { actif: l.is_enabled, frequence: l.frequency, heure: l.sync_hour };
}

export { synchroniserTousLesClients };
