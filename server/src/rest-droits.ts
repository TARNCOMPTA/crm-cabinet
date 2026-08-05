/**
 * Droits applicatifs sur les tables relayées vers PostgREST.
 * ---------------------------------------------------------------------------
 * Ce fichier ne dépend de RIEN : ni de Fastify, ni de la configuration, ni de la
 * base. C'est délibéré. La règle qu'il porte est le seul rempart devant les
 * tables de réglages — la base n'a plus une seule policy RLS, et le rôle
 * `authenticated` y possède tous les droits sur toutes les tables (voir
 * schema/auth-interne.sql). Une règle aussi seule doit pouvoir se relire et se
 * tester sans monter quoi que ce soit autour.
 */

/**
 * Tables dont l'écriture est réservée aux administrateurs. La lecture reste
 * ouverte à tout collaborateur : en mono-cabinet, tout le monde travaille sur
 * les mêmes dossiers, ce sont les réglages du cabinet qui sont protégés.
 *
 * Le critère est l'AUTORITÉ, pas la sensibilité : figure ici ce qui régit le
 * fonctionnement du cabinet — droits, adresses d'envoi, référentiels, colonnes
 * de tableaux communs. Le contenu de travail, lui, appartient à tout le monde,
 * comme les clients, les tâches et les bilans.
 *
 * `checklist_templates` et `checklist_template_items` en ont été retirées : ces
 * modèles portent un `user_id` et un indicateur `is_shared`, ce sont donc des
 * biens personnels, et l'écran « Checklists ▸ Modèles » n'est réservé à personne.
 * Les y laisser rendait la fonction inutilisable pour tout collaborateur non
 * administrateur — créer, renommer, réordonner ou supprimer un modèle partait
 * en 403, sans que l'interface ne l'explique.
 *
 * `jedeclare_teletransmissions` et `jedeclare_suivi_interne` n'y figurent pas
 * NON PLUS, et c'est délibéré : ce sont des déclarations et l'avancement de leur
 * traitement, donc du contenu de travail, au même titre que les clients et les
 * tâches. Les y mettre par réflexe — « ça touche à jedeclare, donc c'est
 * sensible » — reproduirait exactement l'erreur ci-dessus. Ce qui doit être
 * réservé aux administrateurs, c'est l'APPEL à jedeclare, et il ne passe pas
 * par ici : il est gardé par `exigerAdmin` dans `routes/jedeclare.ts`.
 */
export const TABLES_ADMIN = new Set([
  'cabinets',
  'cabinet_collaborator_roles',
  'profiles',
  'app_config',
  'cabinet_smtp_config',
  'software',
  'task_categories',
  'task_templates',
  'regimes_fiscaux',
  'bilan_checklist_templates',
  'bilan_columns',
  'opportunity_columns',
  'web_directory_categories',
  'legal_forms',
  'mcp_api_keys',
  'sync_settings',
]);

/**
 * Tables dont même la LECTURE est réservée aux administrateurs.
 * ---------------------------------------------------------------------------
 * L'ouverture des lectures repose sur un raisonnement juste — en mono-cabinet
 * tout le monde travaille sur les mêmes dossiers — mais qui ne vaut que pour des
 * DONNÉES. Ces trois tables portent des IDENTIFIANTS, ce qui est autre chose :
 * les lire ne renseigne pas sur le travail du cabinet, cela permet d'agir en son
 * nom.
 *
 * `cabinet_smtp_config` est le cas net. Son mot de passe SMTP y est stocké en
 * clair, et un simple `GET /rest/v1/cabinet_smtp_config?select=*` le rendait à
 * n'importe quel collaborateur connecté. L'écran qui l'affiche est pourtant
 * marqué `requiresAdmin` — mais c'est le navigateur qui masque l'entrée de menu,
 * et un menu masqué n'a jamais été un contrôle d'accès. Avec ce mot de passe, on
 * écrit aux clients du cabinet depuis le domaine du cabinet : pour un cabinet
 * comptable, c'est de quoi faire changer un RIB à un client.
 *
 * C'est exactement le défaut consigné au CHANGELOG 2.0 — « la clé OpenAI était
 * lisible en clair par tout collaborateur connecté » — qui avait été traité en
 * retirant la colonne. Celui-ci avait survécu.
 */
export const TABLES_LECTURE_ADMIN = new Set([
  'cabinet_smtp_config',
  'mcp_api_keys',
  'app_config',
]);

/**
 * Colonnes de `profiles` qu'un collaborateur peut modifier sur SA fiche.
 *
 * `profiles` figure dans TABLES_ADMIN parce qu'elle porte `role` et `is_active`,
 * qui décident des droits : les ouvrir en écriture reviendrait à laisser
 * n'importe quel collaborateur se déclarer administrateur. Mais la même table
 * porte aussi l'état civil et les préférences d'affichage, que chacun doit
 * pouvoir corriger sur son propre compte.
 *
 * Sans cette exception, « Paramètres ▸ Mon profil » répondait « Erreur lors de
 * la mise à jour du profil » à tout collaborateur non administrateur, et le
 * bouton « Mes dossiers » se rallumait tout seul au rechargement de la page :
 * son écriture partait en 403, que personne ne lisait.
 *
 * Ce qui reste hors de cette liste porte de l'autorité ou de l'identité :
 * `role`, `is_active`, `email`, `id`, `deactivated_at`, `deactivated_by`.
 */
export const COLONNES_PROFIL_PERSONNELLES = new Set([
  'prenom',
  'nom',
  'display_name',
  'telephone',
  'adresse',
  'job_role',
  'avatar_url',
  'avatar_color',
  'default_collaborator_role_key',
  'show_my_dossiers',
  'updated_at',
]);

const METHODES_ECRITURE = new Set(['POST', 'PATCH', 'PUT', 'DELETE']);

/**
 * Nom de table visé par une URL, tel que PostgREST le comprendra.
 *
 * Le décodage n'est pas une précaution de style : PostgREST route sur le chemin
 * DÉCODÉ. `/rest/v1/pro%66iles` y désigne donc la table `profiles`, alors qu'une
 * comparaison sur la chaîne brute lisait « pro%66iles », absent de TABLES_ADMIN.
 * Le contrôle d'écriture était contournable par ce seul caractère encodé — et
 * comme rien ne le double côté base, n'importe quel collaborateur pouvait
 * s'accorder `role = 'admin'`.
 *
 * Rend null si le chemin ne désigne pas un identifiant de table plausible :
 * mieux vaut refuser que relayer une forme qu'on ne sait pas interpréter.
 */
export function nomTable(chemin: string): string | null {
  // /rest/v1/clients?select=... -> clients
  const apres = chemin.replace(/^\/rest\/v1\/?/, '');
  const sansQuery = apres.split('?')[0] ?? '';
  const premier = sansQuery.split('/')[0] ?? '';

  let decode: string;
  try {
    decode = decodeURIComponent(premier);
  } catch {
    // Séquence d'échappement invalide : PostgREST la refuserait de toute façon.
    return null;
  }

  // Les tables du schéma sont toutes en minuscules et sans ponctuation. La mise
  // en minuscules ferme la variante `/rest/v1/Profiles` : PostgREST rendrait 404,
  // mais le contrôle ne doit pas dépendre de ce détail.
  if (!/^[A-Za-z0-9_]+$/.test(decode)) return null;
  return decode.toLowerCase();
}

/**
 * Une écriture sur `profiles` ne touche-t-elle que la fiche de son auteur, et
 * seulement des colonnes personnelles ?
 *
 * Les filtres de PostgREST se combinent par ET : un `id=eq.<soi>` présent suffit
 * à borner la requête à sa propre ligne, les autres paramètres ne pouvant que
 * restreindre davantage. On exige donc qu'il y en ait un, et que TOUT filtre
 * `id` désigne bien l'auteur — `?id=eq.<soi>&id=eq.<autrui>` ne doit pas passer
 * pour une écriture personnelle.
 */
function modifieSaProprefiche(url: string, corps: unknown, sub: string): boolean {
  const query = url.split('?')[1] ?? '';
  const filtresId = new URLSearchParams(query).getAll('id');

  if (filtresId.length === 0) return false;
  if (!filtresId.every((v) => v === `eq.${sub}`)) return false;

  // Le corps doit être un objet simple : un tableau viserait plusieurs lignes.
  if (typeof corps !== 'object' || corps === null || Array.isArray(corps)) return false;

  const colonnes = Object.keys(corps);
  if (colonnes.length === 0) return false;
  return colonnes.every((colonne) => COLONNES_PROFIL_PERSONNELLES.has(colonne));
}

export interface Demande {
  methode: string;
  url: string;
  /** Rôle applicatif du porteur de session : 'admin' ou 'user'. */
  roleApp: string;
  /** Identifiant du profil connecté (revendication `sub` du jeton). */
  sub: string;
  corps: unknown;
}

export type Verdict =
  | { autorise: true }
  | { autorise: false; code: 400 | 403; message: string };

/** Décide seul de l'accès. Pure fonction : voir rest-droits.test.ts. */
export function deciderAcces(demande: Demande): Verdict {
  const table = nomTable(demande.url);
  if (table === null) {
    return { autorise: false, code: 400, message: 'Chemin de ressource invalide.' };
  }

  // Les tables d'identifiants se ferment dans les deux sens, lecture comprise.
  if (TABLES_LECTURE_ADMIN.has(table) && demande.roleApp !== 'admin') {
    return {
      autorise: false,
      code: 403,
      message: `Consultation de « ${table} » reservee aux administrateurs.`,
    };
  }

  if (!METHODES_ECRITURE.has(demande.methode) || !TABLES_ADMIN.has(table)) {
    return { autorise: true };
  }

  if (demande.roleApp === 'admin') return { autorise: true };

  if (
    table === 'profiles' &&
    demande.methode === 'PATCH' &&
    modifieSaProprefiche(demande.url, demande.corps, demande.sub)
  ) {
    return { autorise: true };
  }

  return {
    autorise: false,
    code: 403,
    message: `Modification de « ${table} » reservee aux administrateurs.`,
  };
}
