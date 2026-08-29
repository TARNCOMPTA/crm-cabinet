/**
 * Suivi des télétransmissions : état d'avancement par type de déclaration, par
 * mois et par société.
 * ---------------------------------------------------------------------------
 * Porté depuis `ecritures-api` (`src/suivi.js`), le cache SQLite étant remplacé
 * par les tables PostgreSQL de l'instance.
 *
 * Le suivi ne s'appuie que sur les ACS et les ARS (`typeDeListe = '98'`) : un
 * ACS atteste du dépôt et du contrôle de conformité, l'ARS porte la réponse du
 * destinataire — et seul l'ARS fait foi. Les ADS, purement transitoires, ne
 * disent rien d'utile ici.
 *
 * ⚠️ L'analyse d'un accusé le MARQUE « récupéré » chez jedeclare. Chaque pièce
 * n'est donc lue qu'UNE fois, puis conservée en base. C'est toute la raison
 * d'être de `jedeclare_teletransmissions` : sans ce cache, rafraîchir l'écran
 * coûterait des accusés au logiciel de production du cabinet.
 */

import { config } from '../config.js';
import { requete } from '../db.js';
import {
  etatCellule,
  sirenDe,
  familleDe,
  decoupageDe,
  periodiciteDe,
  LIBELLE_PERIODICITE,
  type EtatCellule,
  type Famille,
  type LigneTeletransmission,
  type Decoupage,
  type Periodicite,
} from './etat.js';

// Réexporté : le jugement a demenage dans `etat.ts`, mais les appelants
// continuent de le demander ici — c'est le point d'entree du suivi.
export { etatCellule, sirenDe } from './etat.js';
export type { EtatCellule, LigneTeletransmission } from './etat.js';
import { listePieces, analyserPiece } from './client.js';
// La règle qui autorise — ou non — la lecture d'un accusé. Elle vit dans son
// propre module, sans dépendance, parce qu'elle décide d'une opération que rien
// ne défait : voir l'en-tête de prudence.ts.
import { pieceLisible } from './prudence.js';

const COLONNES = [
  'compte', 'numero', 'type_piece', 'ligne', 'procedure', 'nature', 'numero_ads', 'date_avis',
  'siret', 'siren', 'societe', 'dossier', 'type_declaration', 'type_libelle',
  'destinataire', 'periode_debut', 'periode_fin', 'resultat', 'bloquee', 'montant',
  'rof', 'lien',
] as const;

/** Écrit les lignes analysées, en une seule requête par lot. */
async function enregistrer(lignes: LigneTeletransmission[]): Promise<void> {
  if (lignes.length === 0) return;
  const TAILLE_LOT = 200;
  for (let i = 0; i < lignes.length; i += TAILLE_LOT) {
    const lot = lignes.slice(i, i + TAILLE_LOT);
    const valeurs: unknown[] = [];
    const tuples = lot.map((l, index) => {
      const base = index * COLONNES.length;
      for (const colonne of COLONNES) valeurs.push(l[colonne]);
      return `(${COLONNES.map((_, k) => `$${base + k + 1}`).join(', ')})`;
    });
    await requete(
      `INSERT INTO jedeclare_teletransmissions (${COLONNES.join(', ')})
       VALUES ${tuples.join(', ')}
       ON CONFLICT (compte, numero, type_piece, ligne) DO UPDATE SET
         resultat = EXCLUDED.resultat,
         nature = EXCLUDED.nature,
         type_libelle = EXCLUDED.type_libelle,
         analyse_le = now()`,
      valeurs
    );
  }
}

/**
 * Pièces déjà analysées, pour ne jamais en relire une.
 *
 * ⚠️ LE COMPTE FAIT PARTIE DE LA CLÉ, comme dans l'index unique de la table.
 * Deux comptes de flux numérotent leurs pièces chacun de leur côté : sans lui,
 * une pièce du second compte passait pour déjà analysée dès qu'un numéro
 * coïncidait avec une pièce du premier — et n'était jamais lue.
 *
 * Le défaut est resté invisible tant que le mode prudent écartait de toute
 * façon 100 % des pièces du second compte : rien n'arrivait jusqu'ici. Il se
 * serait réveillé le jour même où l'on ouvre la prudence, en donnant
 * l'impression que l'ouverture n'a servi à rien.
 */
async function piecesAnalysees(): Promise<Set<string>> {
  const lignes = await requete<{ compte: number; numero: string; type_piece: string }>(
    'SELECT DISTINCT compte, numero, type_piece FROM jedeclare_teletransmissions'
  );
  return new Set(lignes.map((l) => `${l.compte}|${l.numero}|${l.type_piece}`));
}

/** La clé du cache, écrite une fois : quatre lectures s'en servent. */
const cleCache = (p: { compte: number; numero: string; typePiece: string }): string =>
  `${p.compte}|${p.numero}|${p.typePiece}`;

const frVersIso = (fr: string | null | undefined): string => {
  const m = String(fr ?? '').match(/^(\d{2})\/(\d{2})\/(\d{4})/);
  return m ? `${m[3]}-${m[2]}-${m[1]}` : '';
};

/**
 * Le compte de flux qui a fourni les pièces, et ce qu'elles sont devenues.
 *
 * ⚠️ SANS CETTE VENTILATION, LES TOTAUX NE SE DIAGNOSTIQUENT PAS. Un bilan qui
 * annonce « 368 trouvées, 170 écartées par prudence » ne dit pas si ces 170
 * viennent d'un compte ou des deux. Or c'est toute la question quand un cabinet
 * dépose sous plusieurs comptes : un compte dont AUCUN accusé n'est récupéré par
 * le logiciel de production voit 100 % de ses pièces écartées, à chaque analyse,
 * et n'apparaît jamais dans le suivi. Le total, lui, a l'air simplement partiel.
 */
export interface BilanParCompte {
  compte: number;
  login: string;
  trouvees: number;
  dejaEnCache: number;
  ecarteesPrudence: number;
  aTraiter: number;
  /**
   * Vrai quand le `.env` lève la prudence sur ce compte : ses accusés sont lus
   * même jamais récupérés, donc marqués. Remonté jusqu'à l'écran parce que c'est
   * la seule chose qui distingue « ce compte avance » de « ce compte marque ».
   */
  marquageAutorise: boolean;
}

export interface BilanAnalyse {
  prudent: boolean;
  piecesTrouvees: number;
  dejaEnCache: number;
  analysees: number;
  illisibles: number;
  declarationsEnregistrees: number;
  restantes: number;
  ecarteesPrudence: number;
  /** Les mêmes chiffres, compte par compte. Vide si un seul compte est configuré. */
  parCompte: BilanParCompte[];
}

/**
 * Analyse incrémentale : ne lit que les accusés absents du cache.
 *
 * `prudent` (défaut) ne lit que les accusés DÉJÀ marqués « récupérés » chez
 * jedeclare — leur lecture ne change donc rien, et le logiciel de production du
 * cabinet ne perd rien. C'est le seul mode ouvert depuis le CRM.
 *
 * Il souffre UNE exception, réservée au `.env` du serveur : un compte que rien
 * ne relève n'a jamais d'accusé récupéré, et resterait invisible pour toujours.
 * C'est `prudence.ts` qui porte le raisonnement, et la décision.
 */
export async function analyserPeriode(opts: {
  debut: string;
  fin: string;
  procedure?: string;
  limite?: number;
  prudent?: boolean;
}): Promise<BilanAnalyse> {
  const limite = opts.limite ?? 150;
  const prudent = opts.prudent !== false;

  const pieces = await listePieces({
    debut: opts.debut,
    fin: opts.fin,
    typeDeListe: '98', // ACS et ARS
    statutPiece: '01', // toutes, y compris déjà récupérées
    typeProcedure: opts.procedure ?? 'TOUTES',
  });

  // Une seule expression pour les quatre compteurs qui suivent : ils doivent
  // trancher pareil, sinon le bilan décrit une analyse qui n'a pas eu lieu.
  const lisible = (p: { compte: number; recuperee: boolean }): boolean =>
    pieceLisible(p, prudent, config.jedeclare.comptes);

  const dejaVues = await piecesAnalysees();
  const candidats = pieces.filter((p) => !dejaVues.has(cleCache(p))).filter(lisible);
  const aTraiter = candidats.slice(0, limite);
  const ecarteesPrudence = pieces.filter(
    (p) => !dejaVues.has(cleCache(p)) && !lisible(p)
  ).length;

  const lignes: LigneTeletransmission[] = [];
  let analysees = 0;
  let illisibles = 0;
  const file = [...aTraiter];

  /**
   * Un accusé, avec UNE seconde chance.
   *
   * ⚠️ JEDECLARE REND DES 500 SOUS CHARGE, et ils sont TRANSITOIRES. Mesuré le
   * 2026-08-03 sur la reprise d'un an d'historique : 168 accusés sur 2 212 —
   * 7,6 % — ont échoué en « jedeclare a repondu 500 », et la même pièce
   * redemandée deux secondes plus tard passe sans broncher.
   *
   * Sans ce réessai, ces 168 accusés étaient simplement perdus : l'échec ne
   * produit aucune ligne, donc rien ne dit qu'ils ont été vus, mais la fenêtre
   * de sept jours de la tâche quotidienne les fait sortir du champ avant qu'une
   * seconde chance ne se présente.
   *
   * Une seule tentative de plus, et une pause : le service est saturé, insister
   * aggraverait la saturation. C'est le même raisonnement que pour VIES et son
   * `MS_MAX_CONCURRENT_REQ`, à ceci près qu'ici personne n'attend derrière un
   * clic — la tâche tourne à 6h30.
   */
  const lireAvecSecondeChance = async (piece: {
    numero: string;
    typePiece: string;
    // Le compte qui a listé la pièce est le seul à pouvoir la rendre : sans lui,
    // un cabinet à deux comptes demanderait la moitié de ses accusés au mauvais.
    compte: number;
  }) => {
    try {
      return await analyserPiece(piece);
    } catch (e) {
      await new Promise((r) => setTimeout(r, 1500));
      try {
        return await analyserPiece(piece);
      } catch {
        throw e;
      }
    }
  };

  const travailleur = async (): Promise<void> => {
    for (;;) {
      const piece = file.shift();
      if (!piece) return;
      try {
        const detail = await lireAvecSecondeChance({
          numero: piece.numero,
          typePiece: piece.typePiece,
          compte: piece.compte,
        });
        // Un accusé sans déclaration lisible produit tout de même une ligne :
        // sans elle, la pièce serait relue au prochain passage — et remarquée.
        const declarations = detail.declarations.length ? detail.declarations : [null];
        declarations.forEach((d, index) => {
          const siret = d?.siret ?? '';
          lignes.push({
            compte: piece.compte,
            numero: piece.numero,
            type_piece: piece.typePiece,
            ligne: index,
            procedure: piece.procedure,
            nature: detail.avis?.nature ?? '',
            numero_ads: detail.avis?.numeroADS ?? piece.numeroADS ?? '',
            date_avis: detail.avis?.dateISO ?? '',
            siret,
            siren: sirenDe(siret),
            societe: d?.societe ?? '',
            dossier: d?.dossier ?? '',
            type_declaration: d?.typeDeclaration ?? '',
            type_libelle: d?.typeLibelle ?? '',
            destinataire: d?.destinataire ?? '',
            periode_debut: frVersIso(d?.periodeDebut),
            periode_fin: frVersIso(d?.periodeFin),
            resultat: d?.resultat ?? '',
            bloquee: d?.bloquee ?? false,
            montant: d?.montant ?? null,
            rof: d?.rof ?? '',
            lien: detail.avis?.lien ?? '',
          });
        });
        analysees += 1;
      } catch {
        illisibles += 1;
      }
    }
  };

  /**
   * DEUX lectures en vol, et non quatre.
   *
   * Quatre saturaient le service : 7,6 % de 500 sur la reprise d'historique du
   * 2026-08-03. Le gain de vitesse ne valait pas le taux d'échec, d'autant que
   * la tâche quotidienne n'a aucune raison d'être pressée — elle tourne à 6h30
   * et personne ne l'attend.
   */
  await Promise.all([travailleur(), travailleur()]);
  await enregistrer(lignes);

  // La ventilation ne sert qu'à partir de deux comptes : sur un seul, elle
  // repeterait les totaux ligne pour ligne.
  const comptes = config.jedeclare.comptes;
  const parCompte: BilanParCompte[] =
    comptes.length < 2
      ? []
      : comptes.map((c, rang) => {
          const siennes = pieces.filter((p) => p.compte === rang);
          const inconnues = siennes.filter((p) => !dejaVues.has(cleCache(p)));
          return {
            compte: rang,
            login: c.login,
            trouvees: siennes.length,
            dejaEnCache: siennes.length - inconnues.length,
            ecarteesPrudence: inconnues.filter((p) => !lisible(p)).length,
            aTraiter: inconnues.filter(lisible).length,
            marquageAutorise: c.marquageAutorise,
          };
        });

  return {
    prudent,
    piecesTrouvees: pieces.length,
    dejaEnCache: pieces.filter((p) => dejaVues.has(cleCache(p))).length,
    analysees,
    illisibles,
    declarationsEnregistrees: lignes.length,
    restantes: candidats.length - aTraiter.length,
    ecarteesPrudence,
    parCompte,
  };
}

export interface SocieteSuivie {
  societe: string;
  siren: string;
  siret: string;
  dossier: string;
  cellules: Record<string, EtatCellule | null>;
}

export interface TableSuivi {
  /**
   * La famille de travail : c'est elle qui désigne l'ONGLET de l'écran.
   *
   * Trois onglets — TVA, Bilan, Autres — là où il y avait une douzaine de types
   * dans une barre qui défilait. `cle` désigne la pastille À L'INTÉRIEUR de
   * l'onglet, `famille` désigne l'onglet lui-même. Déduite de la téléprocédure
   * par `familleDe`, sans référentiel écrit en dur : voir son en-tête.
   */
  famille: Famille;
  /**
   * L'identifiant de CE tableau, distinct du code de déclaration.
   *
   * ⚠️ LA TVA EN PRODUIT TROIS — mensuelle, trimestrielle, annuelle — qui
   * portent toutes le même `typeDeclaration`. L'écran indexait ses onglets sur
   * ce code : trois tableaux s'y seraient masqués l'un l'autre, seul le premier
   * restant atteignable. `typeDeclaration` demeure ce qu'on écrit en base pour
   * le suivi interne, `cle` est ce qui désigne un onglet.
   */
  cle: string;
  typeDeclaration: string;
  /**
   * Vrai pour les tableaux de TVA, et eux seuls.
   *
   * Sert à savoir qui a un jour d'échéance : le calendrier CA3 ne concerne que
   * la TVA. Sans ce drapeau, une liasse fiscale afficherait une colonne
   * d'échéance vide sur chacune de ses lignes — du bruit là où il n'y a rien à
   * dire. Distinct de `periodicite`, qui manque aussi aux TVA dont les bornes
   * de période sont inexploitables.
   */
  estTva: boolean;
  /** Renseignée pour la TVA, absente ailleurs. */
  periodicite?: Periodicite;
  /**
   * Le pas des colonnes de la grille — voir `decoupageDe` dans `etat.ts`.
   *
   * Une TVA trimestrielle se lit par trimestres, un bilan par années. Laisser
   * ces tableaux au mois affichait des colonnes vides PAR CONSTRUCTION, que
   * l'écran ne pouvait pas distinguer d'un retard.
   */
  decoupage: Decoupage;
  libelle: string;
  societes: SocieteSuivie[];
  /**
   * À qui part ce type de déclaration, du plus fréquent au moins fréquent.
   *
   * Affiché sous l'onglet parce que le libellé de jedeclare ne suffit pas :
   * « Liasses Fiscales » (ILF) désigne en réalité la copie envoyée aux BANQUES
   * du client — 433 lignes, aucune vers la DGFiP, mesuré le 2026-08-03. Sans
   * cette mention, ses refus se lisent comme des refus de l'administration.
   */
  destinataires: { nom: string; lignes: number }[];
  /** Nombre de lignes, ce qui ordonne les onglets. */
  nbLignes: number;
}

/**
 * L'ordre des onglets : TVA, Bilan, Autres.
 *
 * C'est l'ordre du travail d'un cabinet — le rythme mensuel d'abord, la clôture
 * ensuite, le reste après — et il ne bouge pas avec le portefeuille. Trier les
 * onglets au volume les ferait changer de place d'une période à l'autre.
 */
const rangFamille = (f: Famille): number => (f === 'tva' ? 0 : f === 'bilan' ? 1 : 2);

/** L'ordre de lecture des trois tableaux de TVA. Le reste vient après. */
const rangPeriodicite = (p: Periodicite | undefined): number =>
  p === 'mensuelle' ? 0 : p === 'trimestrielle' ? 1 : p === 'annuelle' ? 2 : 3;

export interface Suivi {
  axe: 'periode' | 'depot';
  mois: string[];
  nbDeclarations: number;
  tables: TableSuivi[];
}

/** Lit le cache, filtré sur la période. */
async function lireTeletransmissions(opts: {
  debut?: string;
  fin?: string;
}): Promise<LigneTeletransmission[]> {
  const conditions: string[] = [];
  const valeurs: unknown[] = [];
  // Le filtre porte sur la période DÉCLARÉE ou sur la date d'avis : on garde
  // large ici, le pivot tranche ensuite selon l'axe demandé.
  if (opts.debut) {
    valeurs.push(opts.debut);
    conditions.push(`(periode_fin >= $${valeurs.length} OR date_avis >= $${valeurs.length})`);
  }
  if (opts.fin) {
    valeurs.push(`${opts.fin}￿`);
    conditions.push(`(periode_fin <= $${valeurs.length} OR date_avis <= $${valeurs.length})`);
  }
  const filtre = conditions.length ? ` WHERE ${conditions.join(' AND ')}` : '';
  return requete<LigneTeletransmission>(
    `SELECT * FROM jedeclare_teletransmissions${filtre}
      ORDER BY societe, type_declaration, date_avis`,
    valeurs
  );
}

/**
 * Pivot : une table par type de déclaration, une ligne par société, une colonne
 * par mois. Construit depuis le cache, sans jamais appeler jedeclare.
 */
export async function construireSuivi(opts: {
  debut?: string;
  fin?: string;
  axe?: 'periode' | 'depot';
  /**
   * Ecarte une ligne AVANT le pivot, et donc avant tous les comptages.
   *
   * ⚠️ C'EST LE SEUL ENDROIT OU L'EXCLUSION EST SANS CONTRADICTION. Filtrer les
   * societes apres coup laisserait `nbLignes`, `nbDeclarations` et les
   * destinataires compter des lignes que le tableau n'affiche plus : l'en-tete
   * annoncerait « 41 declarations » au-dessus d'une grille qui n'en montre que
   * 30, sans que rien n'explique l'ecart.
   *
   * Le pivot reste ignorant du portefeuille : il recoit un predicat, pas des
   * clients. C'est l'appelant qui sait ce qu'est un dossier sorti.
   */
  exclure?: (ligne: LigneTeletransmission) => boolean;
}): Promise<Suivi> {
  const axe = opts.axe === 'depot' ? 'depot' : 'periode';
  const toutes = await lireTeletransmissions(opts);
  // L'exclusion s'applique ICI, avant le moindre comptage : ce qui suit ne voit
  // jamais les lignes ecartees, et aucun total ne peut donc les inclure.
  const lignes = opts.exclure ? toutes.filter((l) => !opts.exclure!(l)) : toutes;

  /**
   * LA COUPE QUE LA REQUÊTE SQL NE FAIT PAS.
   *
   * Le filtre en base est volontairement large : `(periode_fin >= debut OR
   * date_avis >= debut) AND (periode_fin <= fin OR date_avis <= fin)`. Une
   * déclaration déposée en mars 2026 pour une période close en 2022 satisfait
   * les deux conditions — par `date_avis` pour l'une, par `periode_fin` pour
   * l'autre. C'est délibéré : l'axe demandé n'est connu qu'ici.
   *
   * Mais le pivot ne tranchait pas, alors que le commentaire de la requête
   * annonce qu'il le fait. Chaque mois rencontré devenait une colonne : une
   * fenêtre de huit mois en produisait SEIZE, de 2022-12 à 2027-03. Demander
   * une fenêtre plus courte l'élargissait même, en laissant entrer plus de
   * dépôts récents portant sur des périodes lointaines.
   *
   * Constaté le 2026-08-05, sur une fenêtre 2026-02 → 2026-10.
   */
  const borneBasse = opts.debut?.slice(0, 7);
  const borneHaute = opts.fin?.slice(0, 7);
  const dansLaFenetre = (cleMois: string) =>
    (!borneBasse || cleMois >= borneBasse) && (!borneHaute || cleMois <= borneHaute);

  const mois = new Set<string>();
  const parType = new Map<
    string,
    {
      typeDeclaration: string;
      periodicite?: Periodicite;
      libelle: string;
      nbLignes: number;
      /** Téléprocédures rencontrées : sert à reconnaître la TVA au tri. */
      procedures: Set<string>;
      destinataires: Map<string, number>;
      societes: Map<string, SocieteSuivie & { brut: Map<string, LigneTeletransmission[]> }>;
    }
  >();

  /**
   * LA TVA SE LIT PAR PÉRIODICITÉ, et non en un seul tableau.
   *
   * Un cabinet ne traite pas ensemble une TVA mensuelle et une TVA annuelle :
   * ce sont deux rythmes, deux échéances, deux moments de production. Mélangées,
   * les colonnes de mois donnaient une grille pleine de trous — une société au
   * régime trimestriel n'a rien à déclarer deux mois sur trois, et ces vides se
   * lisaient comme du retard.
   *
   * Le découpage ne vaut QUE pour la TVA : c'est là que la périodicité change
   * d'un client à l'autre. Un IS ou une liasse n'ont pas cette question.
   */
  const cleDe = (ligne: LigneTeletransmission, type: string): {
    cle: string;
    periodicite?: Periodicite;
  } => {
    if (ligne.procedure !== 'EDI-TVA') return { cle: type };
    const periodicite = periodiciteDe(ligne.periode_debut, ligne.periode_fin);
    // Sans bornes exploitables, la ligne reste dans le tableau du type, sans
    // périodicité affichée. La ranger d'office en « mensuelle » ferait passer
    // une inconnue pour une certitude.
    return periodicite ? { cle: `${type}|${periodicite}`, periodicite } : { cle: type };
  };

  for (const ligne of lignes) {
    const cleMois = String(axe === 'depot' ? ligne.date_avis : ligne.periode_fin).slice(0, 7);
    if (!/^\d{4}-\d{2}$/.test(cleMois)) continue;
    // La coupe porte sur la ligne entiere, et pas seulement sur la liste des
    // colonnes : ecarter le mois sans ecarter la ligne laisserait des societes
    // presentes dans le tableau avec une rangee entierement vide, et un
    // `nbLignes` comptant des declarations qu'on n'affiche pas.
    if (!dansLaFenetre(cleMois)) continue;
    mois.add(cleMois);

    // Regroupement sur le CODE technique, stable entre ACS et ARS ; le libellé,
    // présent seulement dans les ARS, ne sert qu'à l'affichage.
    const type = ligne.type_declaration || '(type non précisé)';
    const { cle: cleTable, periodicite } = cleDe(ligne, type);
    if (!parType.has(cleTable))
      parType.set(cleTable, {
        typeDeclaration: type,
        periodicite,
        libelle: '',
        nbLignes: 0,
        procedures: new Set(),
        destinataires: new Map(),
        societes: new Map(),
      });
    const groupe = parType.get(cleTable)!;
    if (!groupe.libelle && ligne.type_libelle) groupe.libelle = ligne.type_libelle;
    groupe.nbLignes += 1;
    if (ligne.procedure) groupe.procedures.add(ligne.procedure);
    if (ligne.destinataire)
      groupe.destinataires.set(ligne.destinataire, (groupe.destinataires.get(ligne.destinataire) ?? 0) + 1);

    // Le SIREN identifie la société : il survit au transfert d'établissement et
    // au changement de dénomination. À défaut, le dossier, puis le nom.
    const cle = ligne.siren || ligne.dossier || ligne.societe || '?';
    if (!groupe.societes.has(cle)) {
      groupe.societes.set(cle, {
        societe: ligne.societe || '(société non précisée)',
        siren: ligne.siren,
        siret: ligne.siret,
        dossier: ligne.dossier,
        cellules: {},
        brut: new Map(),
      });
    }
    const societe = groupe.societes.get(cle)!;
    if (!societe.brut.has(cleMois)) societe.brut.set(cleMois, []);
    societe.brut.get(cleMois)!.push(ligne);
  }

  const moisTries = [...mois].sort();

  // La famille est calculée UNE fois par tableau, avant le tri. La recalculer
  // dans le comparateur reparcourrait le Set des procédures à chaque
  // comparaison, pour une valeur qui ne change pas.
  const groupes = [...parType.entries()].map(
    ([cle, groupe]) => [cle, groupe, familleDe(groupe.procedures)] as const
  );

  const tables: TableSuivi[] = groupes
    // LA FAMILLE D'ABORD — c'est l'ordre des onglets — puis le rythme, le
    // volume, l'alphabet.
    //
    // ⚠️ CE TRI CLASSE LES ONGLETS ET LES PASTILLES À LA FOIS, et c'est
    // délibéré : `tables` reste UN SEUL tableau trié, que l'écran n'a plus qu'à
    // partitionner par famille en préservant l'ordre. Dédoubler la logique de
    // tri côté front l'aurait fait diverger de celle-ci à la première retouche.
    //
    // Le volume seul ne suffisait pas. Il place bien `IDT` en tête — 3 650
    // lignes pour 175 sociétés — mais laissait `RBT`, les remboursements de
    // TVA, au cinquième rang derrière `IS`, `IDF` et `ILF`. Or les deux se
    // lisent ensemble : c'est la même échéance, le même interlocuteur, le même
    // geste — et ils tiennent désormais dans le même onglet.
    //
    // Le volume garde tout son sens ensuite : `IAA` et `BCG` pèsent UNE ligne
    // chacun, et l'alphabet les mettait au même rang que le travail quotidien
    // du cabinet. À volume égal, l'ordre alphabétique départage, pour que la
    // liste ne bouge pas d'un chargement à l'autre.
    //
    // Entre les trois tableaux de TVA, l'ordre est celui du RYTHME et non du
    // volume : mensuelle, trimestrielle, annuelle. Le volume les classerait
    // par hasard, alors que ces trois-là se lisent dans un ordre évident — et
    // qui ne bouge pas quand le portefeuille change.
    .sort(
      (a, b) =>
        rangFamille(a[2]) - rangFamille(b[2]) ||
        rangPeriodicite(a[1].periodicite) - rangPeriodicite(b[1].periodicite) ||
        b[1].nbLignes - a[1].nbLignes ||
        (a[1].libelle || a[0]).localeCompare(b[1].libelle || b[0], 'fr')
    )
    .map(([cle, groupe, famille]) => ({
      famille,
      cle,
      typeDeclaration: groupe.typeDeclaration,
      estTva: groupe.procedures.has('EDI-TVA'),
      ...(groupe.periodicite ? { periodicite: groupe.periodicite } : {}),
      decoupage: decoupageDe(famille, groupe.periodicite),
      // Le libellé porte la périodicité : trois onglets nommés « TVA » à
      // l'identique n'aideraient personne.
      libelle: groupe.periodicite
        ? `${groupe.libelle || groupe.typeDeclaration} — ${LIBELLE_PERIODICITE[groupe.periodicite]}`
        : groupe.libelle || groupe.typeDeclaration,
      nbLignes: groupe.nbLignes,
      destinataires: [...groupe.destinataires.entries()]
        .map(([nom, lignes]) => ({ nom, lignes }))
        .sort((x, y) => y.lignes - x.lignes || x.nom.localeCompare(y.nom, 'fr')),
      societes: [...groupe.societes.values()]
        .sort((a, b) => a.societe.localeCompare(b.societe, 'fr'))
        .map((s) => ({
          societe: s.societe,
          siren: s.siren,
          siret: s.siret,
          dossier: s.dossier,
          cellules: Object.fromEntries(
            moisTries.map((m) => [m, etatCellule(s.brut.get(m) ?? [])])
          ),
        })),
    }));

  return { axe, mois: moisTries, nbDeclarations: lignes.length, tables };
}

export async function compterTeletransmissions(): Promise<number> {
  const lignes = await requete<{ n: string }>(
    'SELECT count(*)::text AS n FROM jedeclare_teletransmissions'
  );
  return Number(lignes[0]?.n ?? 0);
}
