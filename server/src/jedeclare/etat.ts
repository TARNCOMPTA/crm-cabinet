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

export type Periodicite = 'mensuelle' | 'trimestrielle' | 'annuelle';

export const LIBELLE_PERIODICITE: Record<Periodicite, string> = {
  mensuelle: 'mensuelle',
  trimestrielle: 'trimestrielle',
  annuelle: 'annuelle',
};

/**
 * La périodicité d'une déclaration, DÉDUITE DE LA PÉRIODE QU'ELLE COUVRE.
 *
 * Ni jedeclare ni le CRM ne portent le régime de TVA d'un client : ce qui est
 * connu, c'est la période effectivement déclarée. Un mois, c'est du mensuel ;
 * un trimestre, du trimestriel ; douze mois, de l'annuel. La donnée est déjà là,
 * et elle décrit ce qui a RÉELLEMENT été déposé — pas ce qu'un champ de fiche
 * client prétendrait, et qui aurait pu ne jamais être mis à jour.
 *
 * La fourchette est large à dessein. Un trimestre déclaré ne fait pas toujours
 * exactement trois mois pleins : une création ou une cessation en cours de
 * trimestre en donne deux, ou quatre à cheval. Coller à « exactement 3 » ferait
 * basculer ces cas dans « annuelle », là où deux à quatre mois restent
 * évidemment du trimestriel.
 *
 * Rend `null` quand les bornes manquent ou se contredisent : une périodicité
 * inventée vaudrait moins que pas de périodicité du tout.
 */
export function periodiciteDe(
  debut: string | null | undefined,
  fin: string | null | undefined
): Periodicite | null {
  const d = String(debut ?? '').match(/^(\d{4})-(\d{2})/);
  const f = String(fin ?? '').match(/^(\d{4})-(\d{2})/);
  if (!d || !f) return null;
  const mois =
    (Number(f[1]) - Number(d[1])) * 12 + (Number(f[2]) - Number(d[2])) + 1;
  if (mois < 1) return null;
  if (mois === 1) return 'mensuelle';
  if (mois <= 4) return 'trimestrielle';
  return 'annuelle';
}

export type Famille = 'tva' | 'bilan' | 'autres';

export const LIBELLE_FAMILLE: Record<Famille, string> = {
  tva: 'TVA',
  bilan: 'Bilan',
  autres: 'Autres',
};

/**
 * La famille de travail d'un type de déclaration, DÉDUITE DE LA TÉLÉPROCÉDURE.
 * ---------------------------------------------------------------------------
 * Trois familles, parce que ce sont trois moments de production distincts dans
 * un cabinet : la TVA au fil des mois, le bilan à la clôture, le reste. C'est
 * ce découpage-là qui donne les onglets de l'écran de suivi.
 *
 * ⚠️ AUCUNE LISTE DE CODES FISCAUX N'EST ÉCRITE ICI. `IDT`, `IS`, `ILF` ne sont
 * nommés nulle part : seule la téléprocédure qui a porté la pièce est lue. Un
 * type de déclaration nouveau se range donc de lui-même, ce qui est la seule
 * façon de ne pas se périmer à la première évolution fiscale — c'est déjà le
 * parti pris de l'écran, qui déduit ses onglets des données plutôt que d'un
 * référentiel tenu à jour à la main.
 *
 * Les copies de liasse envoyées aux BANQUES du client (type `ILF`) partent avec
 * le bilan, et c'est voulu : même liasse, même moment de production. Le bandeau
 * « Destinataires » de l'écran continue de nommer la banque, pour qu'un refus
 * bancaire ne se lise pas comme un refus de l'administration.
 *
 * La TVA l'emporte quand un groupe porte les deux procédures. Le cas ne
 * s'observe pas aujourd'hui, mais laisser la priorité indéterminée ferait
 * dépendre l'onglet de l'ordre d'insertion dans un `Set` — donc de l'ordre
 * d'arrivée des accusés, qui n'a aucun sens ici.
 */
export function familleDe(procedures: Iterable<string>): Famille {
  let bilan = false;
  for (const procedure of procedures) {
    if (procedure === 'EDI-TVA') return 'tva';
    if (procedure === 'EDI-TDFC') bilan = true;
  }
  return bilan ? 'bilan' : 'autres';
}

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


export type Decoupage = 'mois' | 'trimestre' | 'annee';

/**
 * LE PAS DES COLONNES d'un tableau de suivi : au mois, au trimestre, à l'année.
 * ---------------------------------------------------------------------------
 * LE DÉFAUT QUE CECI CORRIGE. La grille avait une colonne par mois pour tout le
 * monde. Sur une TVA trimestrielle, une société ne déclare qu'un mois sur trois
 * — les deux autres colonnes étaient vides par construction, et ces vides se
 * lisaient comme du retard. Sur le bilan, c'est pire : une liasse par an, donc
 * onze colonnes vides pour une pleine, et il fallait faire défiler la grille
 * entière pour trouver la seule qui portait quelque chose.
 *
 * C'est le MÊME défaut que celui qui a déjà fait éclater la TVA en trois
 * tableaux (voir `cleDe` dans `suivi.ts`) : là on avait séparé les rythmes en
 * lignes, ici on aligne les colonnes sur le rythme.
 *
 * ⚠️ LA PÉRIODICITÉ N'EST CONNUE QUE POUR LA TVA, et c'est délibéré : elle s'y
 * déduit des bornes réellement déclarées, là où ailleurs elle serait devinée.
 * Le bilan n'a donc pas besoin d'elle — sa famille suffit à le dire annuel, et
 * c'est une propriété du moment de production, pas d'un client en particulier.
 *
 * « Autres » reste au mois, faute de mieux : DSN, DUCS et le reste y cohabitent
 * avec des rythmes différents, et un découpage deviné y afficherait des
 * trimestres faux. Un mois vide de trop vaut mieux qu'une colonne qui ment.
 *
 * Une TVA sans bornes exploitables retombe au mois pour la même raison : sans
 * périodicité constatée, il n'y a rien à regrouper.
 */
export function decoupageDe(
  famille: Famille,
  periodicite?: Periodicite | null
): Decoupage {
  if (famille === 'bilan') return 'annee';
  if (famille === 'tva') {
    if (periodicite === 'trimestrielle') return 'trimestre';
    if (periodicite === 'annuelle') return 'annee';
  }
  return 'mois';
}
