/**
 * Rapprochement des sociétés vues par jedeclare avec le portefeuille du cabinet.
 * ---------------------------------------------------------------------------
 * Le rapprochement se fait par SIREN, et c'est un choix contraint par l'état
 * réel des données :
 *
 *   · `clients.siret` n'est rafraîchi par AUCUNE source automatique. La
 *     synchronisation INPI écrit `siren` mais pas `siret` — voir
 *     `CHAMPS_SYNCHRONISABLES` dans `routes/inpi.ts`. Le SIRET ne vient que de
 *     la saisie, et rien ne le corrige après un transfert d'établissement ;
 *   · `clients` ne porte AUCUNE contrainte d'unicité sur `siren`, `siret` ni
 *     `numero_dossier`. Les doublons existent bel et bien dans le portefeuille,
 *     souvent une fiche archivée et une fiche active ;
 *   · les dénominations sont inexploitables — espaces terminaux, casses mixtes
 *     et fautes de frappe sont la règle. On ne rapproche jamais sur le nom.
 *
 * D'où la règle : SIREN d'abord, numéro de dossier ensuite, et un aveu
 * d'ambiguïté plutôt qu'un rattachement au hasard. Un rapprochement silencieux
 * vers la mauvaise fiche est pire qu'un non-rapprochement : il fait porter le
 * suivi d'une société sur une autre.
 *
 * C'est le même parti pris que `habilitationsService`, qui rapproche déjà un
 * fichier importé par SIREN et affiche les non-rapprochés au lieu de les taire.
 */

export type NiveauRapprochement = 'siren' | 'dossier' | 'manuel' | 'ambigu' | 'aucun';

export interface ClientRapprochable {
  id: string;
  siren: string | null;
  siret: string | null;
  numero_dossier: string | null;
  statut: string | null;
  nom_entreprise: string;
}

/**
 * Ce qu'il faut d'une fiche pour savoir si elle est encore au portefeuille.
 *
 * Volontairement plus étroit que `ClientRapprochable` : la règle ne regarde que
 * deux champs, et une signature qui n'en demande pas plus rend impossible d'en
 * introduire un troisième sans le décider ici.
 */
export interface ClientPortefeuille {
  statut: string | null;
  date_sortie_cabinet: string | null;
}

/**
 * La fiche est-elle sortie du portefeuille ?
 *
 * ⚠️ RÈGLE PARTAGÉE. L'écran « Suivi échéances » (`routes/jedeclare.ts`) et
 * l'outil MCP `list_fiscal_deadlines` (`mcp/outils.ts`) filtrent tous deux
 * là-dessus. Le reste de leur enrichissement est dupliqué exprès, mais PAS
 * ceci : deux copies de cette règle finiraient par diverger, et le cabinet
 * lirait alors deux portefeuilles différents selon qu'il regarde l'écran ou
 * qu'il interroge son assistant.
 *
 * TROIS FAÇONS DE NE PLUS ÊTRE DU TRAVAIL À FAIRE, et une fiche n'en porte pas
 * forcément plusieurs :
 *
 *   · `date_sortie_cabinet` dit QUAND le dossier est parti ;
 *   · `statut = 'archive'` dit que la fiche est rangée — beaucoup d'archivages
 *     anciens n'ont jamais reçu de date, donc ne regarder que la date les
 *     laissait dans le suivi ;
 *   · `statut = 'inactif'` dit que le dossier ne produit plus rien.
 *
 * `inactif` A ÉTÉ AJOUTÉ APRÈS COUP, ET CE N'EST PAS GRATUIT. Un dossier
 * inactif reste au portefeuille : le masquer fait disparaître précisément la
 * fiche dont on pourrait vouloir vérifier qu'elle n'a effectivement rien à
 * déclarer. Le cabinet a tranché dans l'autre sens — un dossier inactif qui
 * télédéclare encore est assez rare pour ne pas encombrer l'écran de tous les
 * autres. Si un jour on veut le revoir, c'est un filtre à ajouter, pas cette
 * ligne à défaire.
 *
 * LA DATE N'EST PAS COMPARÉE À LA PÉRIODE AFFICHÉE : un dossier parti ne
 * revient pas dans le suivi parce qu'on regarde une fenêtre antérieure à son
 * départ. Ses déclarations d'alors sont exactes, mais elles ne sont plus du
 * travail à faire — et c'est de travail à faire que cet écran parle.
 *
 * `prospect` N'EST PAS ICI, et c'est délibéré : un prospect qui télédéclare est
 * une anomalie qui mérite d'être vue, au même titre qu'une société non
 * rapprochée.
 */
export function estHorsPortefeuille(c: ClientPortefeuille): boolean {
  return Boolean(c.date_sortie_cabinet) || c.statut === 'archive' || c.statut === 'inactif';
}

export interface Rapprochement {
  clientId: string | null;
  clientNom: string | null;
  niveau: NiveauRapprochement;
}

const AUCUN: Rapprochement = { clientId: null, clientNom: null, niveau: 'aucun' };

function normaliserSiren(valeur: string | null | undefined): string {
  const chiffres = String(valeur ?? '').replace(/\D/g, '');
  return chiffres.length >= 9 ? chiffres.slice(0, 9) : '';
}

function normaliserDossier(valeur: string | null | undefined): string {
  return String(valeur ?? '').trim().toLowerCase();
}

/**
 * Index préparé une fois par requête, puis interrogé pour chaque société.
 *
 * Les valeurs sont des LISTES, pas des clients : c'est ce qui permet de
 * détecter l'ambiguïté au lieu de la subir.
 */
export function indexerClients(clients: ClientRapprochable[]): {
  parSiren: Map<string, ClientRapprochable[]>;
  parDossier: Map<string, ClientRapprochable[]>;
} {
  const parSiren = new Map<string, ClientRapprochable[]>();
  const parDossier = new Map<string, ClientRapprochable[]>();

  for (const client of clients) {
    // `clients.siren` est calculé par déclencheur depuis `siret`, mais peut
    // avoir été saisi seul : on accepte les deux origines.
    const siren = normaliserSiren(client.siren) || normaliserSiren(client.siret);
    if (siren) {
      if (!parSiren.has(siren)) parSiren.set(siren, []);
      parSiren.get(siren)!.push(client);
    }
    const dossier = normaliserDossier(client.numero_dossier);
    if (dossier) {
      if (!parDossier.has(dossier)) parDossier.set(dossier, []);
      parDossier.get(dossier)!.push(client);
    }
  }
  return { parSiren, parDossier };
}

/**
 * Départage plusieurs candidats : une fiche vivante l'emporte sur une archivée.
 * S'il en reste plusieurs, on refuse de choisir.
 */
function departager(candidats: ClientRapprochable[]): ClientRapprochable | 'ambigu' | null {
  if (candidats.length === 0) return null;
  if (candidats.length === 1) return candidats[0]!;

  const vivants = candidats.filter((c) => c.statut !== 'archive');
  if (vivants.length === 1) return vivants[0]!;

  const actifs = vivants.filter((c) => c.statut === 'actif');
  if (actifs.length === 1) return actifs[0]!;

  return 'ambigu';
}

export function rapprocher(
  societe: { siren?: string | null; siret?: string | null; dossier?: string | null },
  index: ReturnType<typeof indexerClients>
): Rapprochement {
  const siren = normaliserSiren(societe.siren) || normaliserSiren(societe.siret);
  if (siren) {
    const choix = departager(index.parSiren.get(siren) ?? []);
    if (choix === 'ambigu') return { clientId: null, clientNom: null, niveau: 'ambigu' };
    if (choix) return { clientId: choix.id, clientNom: choix.nom_entreprise, niveau: 'siren' };
  }

  // Repli sur le numéro de dossier. Il n'a pas la stabilité du SIREN — rien ne
  // garantit que jedeclare emploie la même convention que le cabinet — d'où sa
  // place APRÈS, et le niveau distinct rendu à l'interface.
  const dossier = normaliserDossier(societe.dossier);
  if (dossier) {
    const choix = departager(index.parDossier.get(dossier) ?? []);
    if (choix === 'ambigu') return { clientId: null, clientNom: null, niveau: 'ambigu' };
    if (choix) return { clientId: choix.id, clientNom: choix.nom_entreprise, niveau: 'dossier' };
  }

  return AUCUN;
}
