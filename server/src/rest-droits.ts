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
  // Les campagnes : la lecture reste ouverte — savoir qui a recu quel rappel fait
  // partie du travail d'un collaborateur — mais ecrire dans ces tables, c'est
  // ecrire aux clients du cabinet.
  //
  // ⚠️ CES DEUX ENTREES RESTENT FERMEES ALORS MEME QUE `/api/campagnes` EST
  // DESORMAIS OUVERT A TOUT COLLABORATEUR, et le raisonnement s'est INVERSE :
  // avant, la porte laterale doublait un verrou pose sur la route ; maintenant
  // elle est le seul obstacle a une ecriture qui n'enverrait rien.
  //
  // Ecrire ici a la main creerait une ligne d'historique SANS courriel, sans
  // trace d'auteur imposee, sans lien de desinscription — un envoi fantome dans
  // le journal du cabinet. Passer par la route est le seul moyen d'envoyer, donc
  // le seul moyen d'etre trace : c'est ce que cette fermeture garantit.
  'mailing_campagnes',
  'mailing_destinataires',
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

/**
 * Tables qu'AUCUNE requête du navigateur ne touche, dans aucun sens.
 * ---------------------------------------------------------------------------
 * ⚠️ `email_queue` ÉTAIT OUVERTE EN ÉCRITURE À TOUT COLLABORATEUR CONNECTÉ, ET
 * C'EST LA FAILLE LA PLUS GRAVE DE CET AUDIT. Elle porte `to_email`, `subject`
 * et `html_body` ; l'ordonnanceur la vide toutes les deux minutes par le SMTP
 * du cabinet. Un `POST /rest/v1/email_queue` suffisait donc à faire partir
 * N'IMPORTE QUEL courriel, vers N'IMPORTE QUELLE adresse — hors du cabinet
 * comprise — signé du domaine du cabinet.
 *
 * C'est exactement le scénario que `TABLES_LECTURE_ADMIN` nomme plus haut à
 * propos du mot de passe SMTP : « de quoi faire changer un RIB à un client ».
 * Le mot de passe était protégé ; la file d'envoi qu'il alimente ne l'était
 * pas. Et c'est la même famille que le trou RPC ci-dessous : une porte latérale
 * vers l'envoi de courriel, fermée d'un côté, restée ouverte de l'autre.
 *
 * Vérifié le 2026-09-22 sur le harnais, depuis une VRAIE session de
 * collaborateur `role = 'user'` enrôlée par le navigateur : `201 Created`.
 *
 * ⚠️ FERMÉES AUX ADMINISTRATEURS AUSSI, et ce n'est pas un excès de zèle. Le
 * front ne lit ni n'écrit ces deux tables : l'état de la file lui arrive par
 * `/api/emails/etat`, une route du serveur. Une table qu'aucun écran n'utilise
 * n'a pas à être joignable par le proxy — si un écran en a besoin un jour, il
 * passera par une route, comme celui-là.
 */
export const TABLES_HORS_NAVIGATEUR = new Set([
  'email_queue',
  'email_digests',
  /*
   * Le compte rendu de l'ordonnanceur : « la tache de 2 h a-t-elle tourne
   * cette nuit, et bien ? ». Le serveur seul y ecrit, et l'ecran
   * d'administration le lit par `/api/taches`. Ouvert en ecriture a tout
   * collaborateur, il permettait d'ecrire `statut = 'succes'` sur une tache qui
   * n'a jamais tourne — c'est-a-dire de faire taire le seul endroit qui dit
   * qu'une synchronisation ou une file d'envoi est en panne. La panne de
   * vingt-quatre jours de septembre a coute assez cher pour ne pas laisser
   * maquiller son signalement.
   */
  'taches_planifiees',
]);

/**
 * Tables où l'on AJOUTE, jamais où l'on récrit.
 * ---------------------------------------------------------------------------
 * ⚠️ `audit_logs` ACCEPTAIT LE DELETE ET LE PATCH DE N'IMPORTE QUEL
 * COLLABORATEUR. Le journal que le produit tient pour savoir qui a archivé,
 * supprimé ou modifié quoi était donc effaçable — et, pire, RÉCRIVABLE — par
 * les personnes mêmes qu'il enregistre. Vérifié le 2026-09-22 depuis une
 * session `role = 'user'` : `DELETE …?action=eq.<x>` rend 204 et la ligne
 * disparaît ; `PATCH` rend 204 et la ligne dit autre chose.
 *
 * Une trace effacée laisse un trou qu'on peut au moins remarquer. Une trace
 * RÉCRITE ne laisse rien : elle est lue, et crue. C'est la seconde qui décide
 * ici.
 *
 * ⚠️ L'INSERTION RESTE OUVERTE, ET IL LE FAUT : `clientDeletionService` écrit
 * `archive_client` et `restore_client` depuis le navigateur. Fermer la table
 * entièrement ferait disparaître ces deux traces — soit l'inverse du but.
 *
 * ⚠️ LA RÉÉCRITURE EST REFUSÉE AUX ADMINISTRATEURS AUSSI. Un journal que son
 * lecteur le plus puissant peut corriger ne prouve rien à personne, à
 * commencer par lui : le jour où il doit établir ce qui s'est passé, on lui
 * répondra qu'il a pu l'écrire. La correction d'une ligne, si elle devait
 * exister un jour, serait une ligne de PLUS, pas une ligne changée.
 */
export const TABLES_JOURNAL = new Set(['audit_logs']);

/**
 * Les fonctions que le NAVIGATEUR a le droit d'appeler.
 * ---------------------------------------------------------------------------
 * ⚠️ TOUT APPEL RPC ÉTAIT AUTORISÉ, ET C'ÉTAIT UN TROU BÉANT. `nomTable()` rend
 * « rpc » pour `/rest/v1/rpc/n_importe_quoi` : une pseudo-table, absente des
 * deux listes ci-dessus, donc relayée sans contrôle. Les huit fonctions du
 * schéma `public` étaient ainsi ouvertes à tout collaborateur connecté.
 *
 * Ce que cela permettait, concrètement : `create_notification` est
 * SECURITY DEFINER, son déclencheur `AFTER INSERT` remplit `email_queue`, et
 * l'ordonnanceur la vide toutes les deux minutes. N'importe quel compte pouvait
 * donc faire partir, DEPUIS LE SMTP DU CABINET, un courriel à n'importe quel
 * utilisateur, avec titre, message et lien de son choix. Pour un cabinet
 * comptable, c'est le scénario du RIB modifié — celui-là même que
 * TABLES_LECTURE_ADMIN plus haut cherchait à empêcher.
 *
 * LA LISTE EST CELLE DES APPELS RÉELS DU FRONT, et rien d'autre : les quatre
 * ci-dessous sont les seuls `supabase.rpc(...)` du code. Les autres fonctions —
 * `create_notification`, `process_email_digest`, `auto_archive_done_tasks`,
 * `build_notification_email_html` — sont appelées par le SERVEUR, en direct,
 * sans passer par ce proxy : les fermer ici ne retire rien à personne.
 *
 * Elles restent ouvertes à TOUT collaborateur, administrateur ou non. Deux
 * d'entre elles partent au chargement des écrans « Bilans » et « Opportunités » :
 * les réserver aux administrateurs rejouerait exactement l'erreur consignée plus
 * haut à propos de `checklist_templates` — une fonction rendue inutilisable pour
 * la moitié du cabinet, en 403 muets.
 */
export const RPC_OUVERTES = new Set([
  'get_dashboard_stats',
  'initialize_bilan_defaults',
  'initialize_opportunity_defaults',
  'replace_client_collaborators',
  // Remplace la repartition des parts d'un client en UNE transaction. Deux
  // appels PostgREST — un DELETE puis un INSERT — laisseraient la fiche sans
  // aucun associe si le second echouait. Voir schema/increments/014.
  'replace_client_associes',
  // ⚠️ ELLE MANQUAIT DEPUIS SON ARRIVEE (increment 017, 2026-09-05). Le
  // tableau de bord l'appelle pour la progression des bilans, le proxy la
  // refusait en 403 — et le bloc restait vide, sans message. Trouve le
  // 2026-09-23 en relevant les reponses en echec du navigateur. Lecture seule
  // (`STABLE`, un comptage), rien a craindre. `tests/rpc-front-jumelle.test.ts`
  // tient desormais cette liste avec les appels du front.
  'get_bilan_progression',
]);

/**
 * Nom de la fonction visée par un appel RPC, ou null si l'URL n'en désigne pas.
 *
 * Le chemin est DÉCODÉ AVANT d'être découpé, pour la même raison que dans
 * `nomTable` : PostgREST route sur le chemin décodé, et `/rest/v1/rpc%2fcreate_
 * notification` y désigne bien la fonction. Découper d'abord laisserait passer
 * cette forme sans jamais voir le nom qu'elle appelle.
 */
export function fonctionRpc(chemin: string): string | null {
  const apres = chemin.replace(/^\/rest\/v1\/?/, '');
  const sansQuery = apres.split('?')[0] ?? '';

  let decode: string;
  try {
    decode = decodeURIComponent(sansQuery);
  } catch {
    return null;
  }

  const m = decode.match(/^rpc\/([A-Za-z0-9_]+)$/);
  return m ? (m[1] ?? null) : null;
}

const METHODES_ECRITURE = new Set(['POST', 'PATCH', 'PUT', 'DELETE']);

/** Ce qui change ou efface une ligne DEJA ecrite — l'insertion en est exclue. */
const METHODES_REECRITURE = new Set(['PATCH', 'PUT', 'DELETE']);

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

/**
 * Un lien de notification que le navigateur a le droit de poser.
 * ---------------------------------------------------------------------------
 * ⚠️ POSER UNE NOTIFICATION, C'EST FAIRE PARTIR UN COURRIEL. Le déclencheur
 * `trg_notification_email_queue` remplit `email_queue` à chaque insertion, et
 * `build_notification_email_html` transforme le champ `link` en un bouton
 * « Voir le detail ». Cette fonction échappe déjà le lien et refuse
 * `javascript:` et `data:` — mais elle ACCEPTE `https://`.
 *
 * Un collaborateur pouvait donc faire envoyer à un collègue, depuis le SMTP du
 * cabinet et sous son nom de domaine, un courriel dont le seul bouton mène où
 * il veut. Un hameçonnage interne n'a pas besoin de plus : c'est la confiance
 * dans l'expéditeur qui fait le travail.
 *
 * ⚠️ ON N'INTERDIT PAS LA NOTIFICATION, ON BORNE SON LIEN. Fermer la table
 * casserait l'avertissement d'affectation de tâche et de déplacement de fiche
 * bilan — la chaîne entière. Les cinq appels du front passent `/tasks`,
 * `/bilans`, ou rien : un chemin interne suffit à tout ce que le produit fait.
 *
 * `//exemple.fr` est refusé comme le reste : le navigateur y lit une URL
 * absolue vers un autre domaine, pas un chemin.
 */
export function lienDeNotificationAdmis(lien: unknown): boolean {
  if (lien === null || lien === undefined || lien === '') return true;
  if (typeof lien !== 'string') return false;
  return lien.startsWith('/') && !lien.startsWith('//');
}

/** Toutes les lignes proposées à l'insertion, que le corps en porte une ou dix. */
function lignes(corps: unknown): Record<string, unknown>[] {
  if (Array.isArray(corps)) {
    return corps.filter((l): l is Record<string, unknown> => typeof l === 'object' && l !== null);
  }
  if (typeof corps === 'object' && corps !== null) return [corps as Record<string, unknown>];
  return [];
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

  // Les appels RPC se decident sur le NOM DE LA FONCTION, pas sur la pseudo-table
  // « rpc » que `nomTable` rend pour tous. Refus par defaut : une fonction
  // ajoutee au schema n'est pas exposee au navigateur tant que personne ne l'a
  // inscrite ci-dessus, et c'est le sens de marche voulu.
  if (table === 'rpc') {
    const fonction = fonctionRpc(demande.url);
    if (fonction === null) {
      return { autorise: false, code: 400, message: 'Appel RPC mal forme.' };
    }
    if (!RPC_OUVERTES.has(fonction)) {
      return {
        autorise: false,
        code: 403,
        message: `La fonction « ${fonction} » n'est pas appelable depuis l'application.`,
      };
    }
    return { autorise: true };
  }

  // Ce qu'aucun ecran n'utilise n'a pas a etre joignable — administrateur
  // compris. Refus avant tout autre controle : il n'y a pas de cas passant.
  if (TABLES_HORS_NAVIGATEUR.has(table)) {
    return {
      autorise: false,
      code: 403,
      message: `« ${table} » n'est pas accessible depuis l'application.`,
    };
  }

  // Un journal s'allonge ; il ne se corrige pas. Voir TABLES_JOURNAL.
  if (TABLES_JOURNAL.has(table) && METHODES_REECRITURE.has(demande.methode)) {
    return {
      autorise: false,
      code: 403,
      message: `« ${table} » est un journal : on y ajoute, on n'y modifie ni n'y supprime.`,
    };
  }

  // Les tables d'identifiants se ferment dans les deux sens, lecture comprise.
  if (TABLES_LECTURE_ADMIN.has(table) && demande.roleApp !== 'admin') {
    return {
      autorise: false,
      code: 403,
      message: `Consultation de « ${table} » reservee aux administrateurs.`,
    };
  }

  // Poser une notification fait partir un courriel : son lien doit rester
  // interne. Voir `lienDeNotificationAdmis`.
  if (table === 'notifications' && demande.methode === 'POST') {
    const douteuse = lignes(demande.corps).find((l) => !lienDeNotificationAdmis(l.link));
    if (douteuse) {
      return {
        autorise: false,
        code: 403,
        message:
          "Le lien d'une notification doit etre un chemin interne (« /taches ») : " +
          'il devient un bouton dans un courriel envoye par le cabinet.',
      };
    }
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
