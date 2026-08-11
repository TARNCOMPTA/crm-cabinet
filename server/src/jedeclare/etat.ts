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
  /**
   * Le compte de flux qui a fourni la piece.
   *
   * Fait partie de l'IDENTITE de la piece : deux comptes numerotent leurs
   * pieces chacun de leur cote, et l'index unique les confondait sans lui.
   */
  compte: number;
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
 * suffit à lever l'ambiguïté, et il reste juste pour un cabinet dont les
 * destinataires ne ressembleraient pas à ceux de TARN COMPTA.
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

/** Ce qu'une ligne dit, une fois les codes de jedeclare traduits. */
type Verdict = 'accepte' | 'refuse' | 'attente';

const verdictDe = (l: LigneTeletransmission): Verdict => {
  // Bloquée d'abord : la déclaration n'est PARTIE chez personne, quel que soit
  // ce que `resultat` raconte par ailleurs.
  if (l.bloquee) return 'refuse';
  if (REJET.test(l.resultat)) return 'refuse';
  if (ACCEPTE.test(l.resultat)) return 'accepte';
  return 'attente';
};

/** Le plus récent d'abord ; à date égale l'ARS passe devant, il répond à l'ACS. */
const plusRecentDabord = (a: LigneTeletransmission, b: LigneTeletransmission): number =>
  b.date_avis.localeCompare(a.date_avis) ||
  (b.nature === 'ACS' ? 0 : 1) - (a.nature === 'ACS' ? 0 : 1);

/**
 * Le dernier mot d'un destinataire, et lui seul.
 *
 * ⚠️ UNE DÉCLARATION REFUSÉE PUIS RÉGÉNÉRÉE EST ACCEPTÉE. Le cabinet corrige,
 * redépose, et le destinataire accepte : la cellule doit passer au vert. Elle
 * restait rouge, parce que le jugement cherchait « un refus quelque part » sans
 * jamais regarder les dates — malgré un commentaire qui affirmait le contraire.
 * Le travail refait n'apparaissait donc nulle part, et le suivi montrait un
 * arriéré qui n'existait plus.
 *
 * C'est le DERNIER ARS qui tranche. À défaut d'ARS, l'ACS : un contrôle de
 * conformité refusé arrête tout, la déclaration n'est jamais partie ; un ACS
 * accepté n'est qu'un dépôt, donc une attente.
 */
function dernierMot(lignes: LigneTeletransmission[]): Verdict {
  const ordonnees = lignes.slice().sort(plusRecentDabord);
  const ars = ordonnees.find((l) => l.nature === 'ARS');
  if (ars) return verdictDe(ars);
  const acs = ordonnees[0];
  return acs && verdictDe(acs) === 'refuse' ? 'refuse' : 'attente';
}

/**
 * État d'une cellule.
 *
 * Rouge : le dernier mot d'un destinataire est un refus, ou une déclaration
 * bloquée. Vert : un ARS accepté — et lui seul fait foi, l'ACS n'atteste que du
 * dépôt. Orange : tout le reste, c'est-à-dire l'attente.
 *
 * ⚠️ LE JUGEMENT SE FAIT DESTINATAIRE PAR DESTINATAIRE, et ce n'est pas un
 * raffinement. Une même cellule part souvent à la DGFiP ET aux banques du
 * client — 436 lignes sur 6 075 au relevé du 2026-08-03, et le type `ILF` est
 * même à 100 % bancaire. Prendre « le dernier ARS » toutes lignes confondues
 * ferait passer au vert une liasse REFUSÉE PAR LA DGFiP au seul motif qu'une
 * banque l'a acceptée après. Un refus de l'administration disparaîtrait de
 * l'écran — exactement ce qu'un comptable ne doit jamais rater.
 *
 * Un destinataire dont le dernier mot est un refus garde donc la cellule rouge,
 * quoi qu'en disent les autres.
 */
export function etatCellule(lignes: LigneTeletransmission[]): EtatCellule | null {
  if (!lignes.length) return null;

  const parDestinataire = new Map<string, LigneTeletransmission[]>();
  for (const l of lignes) {
    const cle = l.destinataire || '';
    if (!parDestinataire.has(cle)) parDestinataire.set(cle, []);
    parDestinataire.get(cle)!.push(l);
  }

  const verdicts = [...parDestinataire.entries()].map(([destinataire, siennes]) => ({
    destinataire,
    verdict: dernierMot(siennes),
    lignes: siennes,
  }));

  const refusees = verdicts.filter((v) => v.verdict === 'refuse');
  const rejet = refusees.length > 0;
  const arsAccepte = verdicts.some((v) => v.verdict === 'accepte');

  // L'anomalie est celle de la décision RETENUE, et non de tout l'historique :
  // une déclaration régénérée puis acceptée sans anomalie ne doit pas traîner
  // l'anomalie de la tentative précédente.
  const decisives = verdicts.flatMap((v) =>
    v.lignes.slice().sort(plusRecentDabord).slice(0, 1)
  );
  const anomalie = decisives.some((l) => ANOMALIE.test(l.resultat));

  // Un « sans retour » n'est PAS une anomalie : c'est un silence du
  // destinataire, fréquent et souvent normal. Il mérite d'être nommé, pas
  // confondu avec une déclaration qui n'aurait jamais été déposée.
  const sansRetour = !arsAccepte && decisives.some((l) => SANS_RETOUR.test(l.resultat));
  const montant = lignes.reduce((total, l) => (l.montant ? total + Number(l.montant) : total), 0);

  return {
    etat: rejet ? 'rouge' : arsAccepte ? 'vert' : 'orange',
    anomalie,
    // Le destinataire est NOMMÉ : « refusée par Banque Populaire Occitane » ne
    // se confond pas avec un refus de l'administration, là où « refusée par le
    // destinataire » laissait tout supposer. Seuls les destinataires dont le
    // DERNIER mot est un refus sont nommés — citer celui qui a refusé avant de
    // finalement accepter serait un contresens.
    libelle: rejet
      ? refusees.some((v) => v.lignes.some((l) => l.bloquee))
        ? 'refusée (déclaration bloquée)'
        : `refusée par ${nommer(refusees.map((v) => v.destinataire))}`
      : arsAccepte
        ? anomalie
          ? 'acceptée avec anomalie'
          : 'acceptée'
        : sansRetour
          ? `déposée, sans retour de ${nommer(decisives.filter((l) => SANS_RETOUR.test(l.resultat)).map((l) => l.destinataire))}`
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

