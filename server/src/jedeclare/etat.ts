/**
 * Le jugement du suivi : ce qu'une cellule dit, sans toucher à la base.
 * ---------------------------------------------------------------------------
 * Séparé de `suivi.ts` pour une raison concrète : celui-ci importe `db.ts`, qui
 * ouvre un pool PostgreSQL et exige `DATABASE_URL` DÈS L'IMPORT. La logique
 * ci-dessous est pure — elle ne fait que lire des lignes déjà chargées — et
 * l'enfermer derrière une connexion la rendait intestable.
 *
 * Même partage que `vies.ts` (tout le réseau d'un côté, tout le jugement de
 * l'autre) et `tvaStatut.ts` : c'est ce qui permet d'exercer les dix
 * combinaisons réelles de jedeclare sans base ni réseau.
 */

/** « 2026-07-15 » -> « 15/07/2026 ». Employe par les etapes d'une cellule. */
export const isoVersFr = (iso: string | null | undefined): string => {
  const m = String(iso ?? '').match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : '';
};

/** SIREN d'un SIRET : les neuf premiers chiffres, et rien si l'entrée est vide. */
export function sirenDe(siret: string | null | undefined): string {
  const chiffres = String(siret ?? '').replace(/\D/g, '');
  return chiffres.length >= 9 ? chiffres.slice(0, 9) : '';
}

export interface LigneTeletransmission {
  numero: string;
  type_piece: string;
  ligne: number;
  procedure: string;
  nature: string;
  numero_ads: string;
  date_avis: string;
  siret: string;
  siren: string;
  societe: string;
  dossier: string;
  type_declaration: string;
  type_libelle: string;
  destinataire: string;
  periode_debut: string;
  periode_fin: string;
  resultat: string;
  bloquee: boolean;
  montant: number | null;
  rof: string;
  lien: string;
}

export interface EtatCellule {
  etat: 'vert' | 'orange' | 'rouge';
  anomalie: boolean;
  libelle: string;
  etapes: string[];
  montant: number | null;
  lien: string | null;
  /**
   * Qui a reçu la déclaration, dans l'ordre d'apparition.
   *
   * ⚠️ CE N'EST PAS TOUJOURS L'ADMINISTRATION. Sur le compte réel au
   * 2026-08-03, 436 lignes sur 6 075 partent à une banque et non à la DGFiP :
   * la copie de la liasse envoyée aux banques du client. Le type `ILF`
   * (« Liasses Fiscales ») est même à 100 % bancaire — 433 lignes, aucune vers
   * la DGFiP.
   *
   * Sans cette information, un refus bancaire s'affichait « refusée par le
   * destinataire » dans un onglet nommé « Liasses Fiscales », et se lisait
   * donc « l'administration a refusé la liasse ». C'était faux, et c'est le
   * genre d'erreur qui envoie quelqu'un chercher un incident inexistant.
   */
  destinataires: string[];
}

/**
 * Nomme les destinataires d'un lot de lignes, pour un libellé lisible.
 *
 * Volontairement SANS taxonomie : on ne cherche pas à deviner si le
 * destinataire est une banque ou une administration. Le nom brut de jedeclare
 * suffit à lever l'ambiguïté, et il reste juste quel que soit le cabinet : une
 * taxonomie calée sur les destinataires d'un seul se tromperait chez les autres.
 */
function nommer(noms: string[]): string {
  const distincts = [...new Set(noms.filter(Boolean))];
  if (distincts.length === 0) return 'le destinataire';
  if (distincts.length === 1) return distincts[0] ?? 'le destinataire';
  return `${distincts.length} destinataires`;
}

/**
 * Les valeurs que jedeclare met réellement dans `resultat`.
 * ---------------------------------------------------------------------------
 * ⚠️ CE NE SONT PAS DES PHRASES, MAIS DES CODES ACCOLÉS. Relevé exhaustif sur
 * 2 165 accusés réels du cabinet, le 2026-08-03 :
 *
 *     acceptée                  1 616   ACS et ARS
 *     accepteesprecedement        166   ARS
 *     sansretour                  117   ARS
 *     acceptée avec anomalie       59   ACS et ARS
 *     refusees                     30   ACS et ARS
 *     accepteesanoprecedement      14   ARS
 *     refuseesprecedement           5   ARS
 *
 * D'où venait le défaut : la détection cherchait `/rejet/i`, un mot que
 * jedeclare N'EMPLOIE JAMAIS. Les 35 déclarations REFUSÉES du cabinet
 * s'affichaient donc en orange « en attente de réponse » au lieu de rouge — soit
 * exactement l'inverse de ce qu'un comptable doit voir. Le connecteur d'origine
 * (`ecritures-api`, dont celui-ci est porté) porte le même défaut, et
 * `portailrecup` affiche donc la même chose aujourd'hui.
 *
 * Ces expressions sont volontairement larges — `refus` couvre `refusees` et
 * `refuseesprecedement` — parce que jedeclare ajoute des suffixes sans prévenir.
 */
const REJET = /refus|rejet/i;
/** `accepteesanoprecedement` porte l'anomalie dans un « ano » accolé. */
const ANOMALIE = /anomalie|ano(?=precedement)/i;
const ACCEPTE = /accept/i;
/** Le destinataire n'a pas répondu. Ce n'est ni un refus ni une acceptation. */
const SANS_RETOUR = /sansretour/i;

/**
 * État d'une cellule.
 *
 * Rouge : un refus, ou une déclaration bloquée. Vert : un ARS accepté — et lui
 * seul fait foi, l'ACS n'atteste que du dépôt. Orange : tout le reste, c'est-à-
 * dire l'attente.
 *
 * L'ORDRE COMPTE : un refus l'emporte sur une acceptation antérieure. Une
 * déclaration acceptée puis refusée est refusée.
 */
export function etatCellule(lignes: LigneTeletransmission[]): EtatCellule | null {
  if (!lignes.length) return null;
  const lignesRefusees = lignes.filter((l) => REJET.test(l.resultat) || l.bloquee);
  const rejet = lignesRefusees.length > 0;
  const anomalie = lignes.some((l) => ANOMALIE.test(l.resultat));
  const arsAccepte = lignes.some((l) => l.nature === 'ARS' && ACCEPTE.test(l.resultat));
  // Un « sans retour » n'est PAS une anomalie : c'est un silence du
  // destinataire, fréquent et souvent normal. Il mérite d'être nommé, pas
  // confondu avec une déclaration qui n'aurait jamais été déposée.
  const sansRetour = !arsAccepte && lignes.some((l) => SANS_RETOUR.test(l.resultat));
  const montant = lignes.reduce((total, l) => (l.montant ? total + Number(l.montant) : total), 0);

  return {
    etat: rejet ? 'rouge' : arsAccepte ? 'vert' : 'orange',
    anomalie,
    // Le destinataire est NOMMÉ : « refusée par Banque Populaire Occitane » ne
    // se confond pas avec un refus de l'administration, là où « refusée par le
    // destinataire » laissait tout supposer.
    libelle: rejet
      ? lignes.some((l) => l.bloquee)
        ? 'refusée (déclaration bloquée)'
        : `refusée par ${nommer(lignesRefusees.map((l) => l.destinataire))}`
      : arsAccepte
        ? anomalie
          ? 'acceptée avec anomalie'
          : 'acceptée'
        : sansRetour
          ? `déposée, sans retour de ${nommer(lignes.filter((l) => SANS_RETOUR.test(l.resultat)).map((l) => l.destinataire))}`
          : 'déposée, en attente de réponse',
    // À date égale — deux accusés émis le même jour, c'est courant — l'ACS
    // passe devant : il atteste du dépôt, l'ARS y répond. Sans ce départage, la
    // chronologie s'afficherait à l'envers une fois sur deux.
    etapes: lignes
      .slice()
      .sort(
        (a, b) =>
          a.date_avis.localeCompare(b.date_avis) ||
          (a.nature === 'ACS' ? 0 : 1) - (b.nature === 'ACS' ? 0 : 1)
      )
      .map((l) => `${l.nature || '?'} du ${isoVersFr(l.date_avis)} : ${l.resultat || 'sans détail'}`),
    montant: montant || null,
    lien: lignes.find((l) => l.lien)?.lien ?? null,
    destinataires: [...new Set(lignes.map((l) => l.destinataire).filter(Boolean))],
  };
}

