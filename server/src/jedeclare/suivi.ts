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

import { requete } from '../db.js';
import {
  etatCellule,
  sirenDe,
  type EtatCellule,
  type LigneTeletransmission,
} from './etat.js';

// Réexporté : le jugement a demenage dans `etat.ts`, mais les appelants
// continuent de le demander ici — c'est le point d'entree du suivi.
export { etatCellule, sirenDe } from './etat.js';
export type { EtatCellule, LigneTeletransmission } from './etat.js';
import { listePieces, analyserPiece } from './client.js';

const COLONNES = [
  'numero', 'type_piece', 'ligne', 'procedure', 'nature', 'numero_ads', 'date_avis',
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
       ON CONFLICT (numero, type_piece, ligne) DO UPDATE SET
         resultat = EXCLUDED.resultat,
         nature = EXCLUDED.nature,
         type_libelle = EXCLUDED.type_libelle,
         analyse_le = now()`,
      valeurs
    );
  }
}

/** Pièces déjà analysées, pour ne jamais en relire une. */
async function piecesAnalysees(): Promise<Set<string>> {
  const lignes = await requete<{ numero: string; type_piece: string }>(
    'SELECT DISTINCT numero, type_piece FROM jedeclare_teletransmissions'
  );
  return new Set(lignes.map((l) => `${l.numero}|${l.type_piece}`));
}

const frVersIso = (fr: string | null | undefined): string => {
  const m = String(fr ?? '').match(/^(\d{2})\/(\d{2})\/(\d{4})/);
  return m ? `${m[3]}-${m[2]}-${m[1]}` : '';
};

export interface BilanAnalyse {
  prudent: boolean;
  piecesTrouvees: number;
  dejaEnCache: number;
  analysees: number;
  illisibles: number;
  declarationsEnregistrees: number;
  restantes: number;
  ecarteesPrudence: number;
}

/**
 * Analyse incrémentale : ne lit que les accusés absents du cache.
 *
 * `prudent` (défaut) ne lit que les accusés DÉJÀ marqués « récupérés » chez
 * jedeclare — leur lecture ne change donc rien, et le logiciel de production du
 * cabinet ne perd rien. C'est le seul mode ouvert depuis le CRM.
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

  const dejaVues = await piecesAnalysees();
  const candidats = pieces
    .filter((p) => !dejaVues.has(`${p.numero}|${p.typePiece}`))
    .filter((p) => !prudent || p.recuperee);
  const aTraiter = candidats.slice(0, limite);
  const ecarteesPrudence = prudent
    ? pieces.filter((p) => !p.recuperee && !dejaVues.has(`${p.numero}|${p.typePiece}`)).length
    : 0;

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

  return {
    prudent,
    piecesTrouvees: pieces.length,
    dejaEnCache: pieces.filter((p) => dejaVues.has(`${p.numero}|${p.typePiece}`)).length,
    analysees,
    illisibles,
    declarationsEnregistrees: lignes.length,
    restantes: candidats.length - aTraiter.length,
    ecarteesPrudence,
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
  typeDeclaration: string;
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

export interface Suivi {
  axe: 'periode' | 'depot';
  mois: string[];
  nbDeclarations: number;
  tables: TableSuivi[];
}

/** Lit le cache, filtré sur la période et éventuellement la téléprocédure. */
async function lireTeletransmissions(opts: {
  debut?: string;
  fin?: string;
  procedure?: string;
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
  if (opts.procedure) {
    valeurs.push(opts.procedure);
    conditions.push(`procedure = $${valeurs.length}`);
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
  procedure?: string;
  axe?: 'periode' | 'depot';
}): Promise<Suivi> {
  const axe = opts.axe === 'depot' ? 'depot' : 'periode';
  const lignes = await lireTeletransmissions(opts);

  const mois = new Set<string>();
  const parType = new Map<
    string,
    {
      libelle: string;
      nbLignes: number;
      /** Téléprocédures rencontrées : sert à reconnaître la TVA au tri. */
      procedures: Set<string>;
      destinataires: Map<string, number>;
      societes: Map<string, SocieteSuivie & { brut: Map<string, LigneTeletransmission[]> }>;
    }
  >();

  for (const ligne of lignes) {
    const cleMois = String(axe === 'depot' ? ligne.date_avis : ligne.periode_fin).slice(0, 7);
    if (!/^\d{4}-\d{2}$/.test(cleMois)) continue;
    mois.add(cleMois);

    // Regroupement sur le CODE technique, stable entre ACS et ARS ; le libellé,
    // présent seulement dans les ARS, ne sert qu'à l'affichage.
    const type = ligne.type_declaration || '(type non précisé)';
    if (!parType.has(type))
      parType.set(type, {
        libelle: '',
        nbLignes: 0,
        procedures: new Set(),
        destinataires: new Map(),
        societes: new Map(),
      });
    const groupe = parType.get(type)!;
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
  const tables: TableSuivi[] = [...parType.entries()]
    // LA TVA D'ABORD, puis le volume, puis l'alphabet.
    //
    // Le volume seul ne suffisait pas. Il place bien `IDT` en tête — 3 650
    // lignes pour 175 sociétés — mais laisse `RBT`, les remboursements de TVA,
    // au cinquième rang derrière `IS`, `IDF` et `ILF`. Or les deux se lisent
    // ensemble : c'est la même échéance, le même interlocuteur, le même geste.
    //
    // Le volume garde tout son sens ensuite : `IAA` et `BCG` pèsent UNE ligne
    // chacun, et l'alphabet les mettait au même rang que le travail quotidien
    // du cabinet. À volume égal, l'ordre alphabétique départage, pour que la
    // liste ne bouge pas d'un chargement à l'autre.
    .sort(
      (a, b) =>
        Number(b[1].procedures.has('EDI-TVA')) - Number(a[1].procedures.has('EDI-TVA')) ||
        b[1].nbLignes - a[1].nbLignes ||
        (a[1].libelle || a[0]).localeCompare(b[1].libelle || b[0], 'fr')
    )
    .map(([typeDeclaration, groupe]) => ({
      typeDeclaration,
      libelle: groupe.libelle || typeDeclaration,
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
