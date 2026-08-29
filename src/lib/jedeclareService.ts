/**
 * Suivi des échéances — accès aux routes de l'instance.
 * ---------------------------------------------------------------------------
 * Tout passe par `appelerFonction`, donc par le cookie de session : le
 * navigateur n'a jamais les identifiants jedeclare, et ne peut pas non plus
 * appeler jedeclare directement. Les seules données qu'il voit sont celles que
 * le serveur a bien voulu construire.
 *
 * Les types décrivent le contrat de `server/src/routes/jedeclare.ts`. Ils sont
 * écrits à la main et non générés : `database.ts` décrit les TABLES, or ce que
 * la route rend est un pivot, pas une table.
 */

import { appelerFonction } from './api/fonctions';

export type StatutInterne = 'a_faire' | 'en_cours' | 'a_controler' | 'valide' | 'sans_objet';

export const STATUTS_INTERNES: { value: StatutInterne; label: string }[] = [
  { value: 'a_faire', label: 'À faire' },
  { value: 'en_cours', label: 'En cours' },
  { value: 'a_controler', label: 'À contrôler' },
  { value: 'valide', label: 'Validé' },
  { value: 'sans_objet', label: 'Sans objet' },
];

export const LIBELLES_STATUT: Record<StatutInterne, string> = {
  a_faire: 'À faire',
  en_cours: 'En cours',
  a_controler: 'À contrôler',
  valide: 'Validé',
  sans_objet: 'Sans objet',
};

/** Ce que jedeclare dit d'une cellule. Lecture seule, toujours. */
export interface EtatJedeclare {
  etat: 'vert' | 'orange' | 'rouge';
  anomalie: boolean;
  libelle: string;
  etapes: string[];
  montant: number | null;
  lien: string | null;
  /** Qui a reçu la déclaration — pas toujours l'administration, voir `etat.ts`. */
  destinataires: string[];
}

/** Ce que le cabinet en dit. Modifiable. */
export interface EtatInterne {
  statut: StatutInterne;
  commentaire: string;
  assigneeId: string | null;
  majLe: string;
}

export interface CelluleSuivi {
  jedeclare: EtatJedeclare | null;
  interne: EtatInterne | null;
}

export type NiveauRapprochement = 'siren' | 'dossier' | 'manuel' | 'ambigu' | 'aucun';

export type OrigineEcheance = 'surcharge' | 'regle' | 'inconnue';

/**
 * Le jour du mois où la déclaration est due, et d'où il sort.
 *
 * `origine` n'est pas décoratif : elle distingue ce que le cabinet a fixé de ce
 * que le programme a déduit d'une forme juridique déclarative. Un jour déduit
 * se discute, un jour saisi ne se discute pas — l'écran doit pouvoir le montrer.
 */
export interface Echeance {
  jour: number | null;
  origine: OrigineEcheance;
  motif: string;
  /** Ce que la règle donnerait, même sous une surcharge : sert à nommer le retour au défaut. */
  jourRegle: number | null;
}

export interface SocieteSuivie {
  societe: string;
  siren: string;
  siret: string;
  dossier: string;
  clientId: string | null;
  clientNom: string | null;
  rapprochement: NiveauRapprochement;
  monDossier: boolean;
  /** `null` hors TVA : le calendrier CA3 ne concerne qu'elle. */
  echeance: Echeance | null;
  cellules: Record<string, CelluleSuivi>;
}

export type Periodicite = 'mensuelle' | 'trimestrielle' | 'annuelle';

/** Miroir de `Famille` côté serveur (`jedeclare/etat.ts`) : l'onglet de l'écran. */
export type Famille = 'tva' | 'bilan' | 'autres';

export const LIBELLE_FAMILLE: Record<Famille, string> = {
  tva: 'TVA',
  bilan: 'Bilan',
  autres: 'Autres',
};

/** Miroir de `Decoupage` côté serveur (`jedeclare/etat.ts`) : le pas des colonnes. */
export type Decoupage = 'mois' | 'trimestre' | 'annee';

export interface TableSuivi {
  /**
   * La famille de travail : c'est elle qui désigne l'ONGLET.
   *
   * ⚠️ OBLIGATOIRE, ET NON FACULTATIVE. La route recopie les tables champ par
   * champ et en a déjà oublié deux fois — voir le commentaire qui le raconte
   * dans `routes/jedeclare.ts`. Un champ facultatif rattraperait l'oubli en
   * silence, en affichant un écran presque juste ; obligatoire, il le fait
   * tomber au typage, qui est le seul endroit où on peut encore le voir.
   */
  famille: Famille;
  /**
   * L'identifiant de CE tableau — c'est lui qui désigne un onglet.
   *
   * ⚠️ Distinct de `typeDeclaration`, parce que la TVA en produit trois qui
   * partagent le même code. Indexer les onglets sur le code les masquerait
   * l'un l'autre.
   */
  cle: string;
  typeDeclaration: string;
  /** Vrai pour les tableaux de TVA, et eux seuls : eux seuls ont un jour d'échéance. */
  estTva: boolean;
  /** Renseignée pour la TVA, absente ailleurs. */
  periodicite?: Periodicite;
  /**
   * Le pas des colonnes de la grille : au mois, au trimestre, à l'année.
   *
   * ⚠️ OBLIGATOIRE, pour la même raison que `famille` juste au-dessus. Facultatif,
   * il retomberait sur « mois » en silence le jour où la route l'oublierait, et
   * l'écran réafficherait douze colonnes vides pour une liasse annuelle — sans
   * erreur, sans page blanche, juste la grille d'avant revenue toute seule.
   * Obligatoire, l'oubli tombe au typage, qui est le seul endroit où on le voit.
   */
  decoupage: Decoupage;
  libelle: string;
  societes: SocieteSuivie[];
  /** Destinataires du type, du plus fréquent au moins fréquent. */
  destinataires: { nom: string; lignes: number }[];
  nbLignes: number;
}

export interface Suivi {
  axe: 'periode' | 'depot';
  mois: string[];
  nbDeclarations: number;
  nbEnCache: number;
  sansClient: number;
  configure: boolean;
  tables: TableSuivi[];
}

/** Un onglet de l'écran : une famille, et les tableaux qu'elle contient. */
export interface GroupeFamille {
  famille: Famille;
  libelle: string;
  /** Dans l'ordre décidé par le serveur — ce sont les pastilles de l'onglet. */
  tables: TableSuivi[];
  /** Sociétés DISTINCTES de la famille : le compteur porté par l'onglet. */
  nbSocietes: number;
}

/**
 * Range les tableaux en onglets, sans jamais réordonner.
 * ---------------------------------------------------------------------------
 * ⚠️ AUCUN TRI ICI, ET C'EST VOLONTAIRE. Le serveur rend `tables` déjà trié —
 * famille, puis rythme, puis volume, puis alphabet — et cette fonction se
 * contente de partitionner en préservant l'ordre. Retrier côté écran ferait
 * exister deux règles d'ordre pour la même liste, qui divergeraient à la
 * première retouche de l'une des deux.
 *
 * Les familles VIDES sont omises. Un cabinet qui ne dépose aucune liasse sur la
 * période ne doit pas voir un onglet « Bilan » qui n'ouvre rien : c'est la même
 * règle qu'avant le regroupement, où un onglet n'existait que si son type
 * existait dans les données.
 */
export function grouperParFamille(tables: TableSuivi[]): GroupeFamille[] {
  const ordre: Famille[] = ['tva', 'bilan', 'autres'];
  return ordre
    .map((famille) => {
      const siennes = tables.filter((t) => t.famille === famille);
      return {
        famille,
        libelle: LIBELLE_FAMILLE[famille],
        tables: siennes,
        nbSocietes: compterSocietes(siennes),
      };
    })
    .filter((g) => g.tables.length > 0);
}

/**
 * Les sociétés distinctes d'un ensemble de tableaux.
 *
 * ⚠️ LE DÉDOUBLONNAGE EST LE POINT. Une société apparaît dans autant de
 * tableaux qu'elle a de types déclarés : en TVA mensuelle ET en remboursement,
 * ou en liasse ET en IS. Additionner les `societes.length` la compterait une
 * fois par tableau, et l'onglet annoncerait plus de dossiers que le cabinet
 * n'en a — un compteur faux étant pire qu'un compteur absent.
 *
 * La clé est CELLE DU PIVOT (`suivi.ts`) : le SIREN survit au transfert
 * d'établissement et au changement de dénomination ; à défaut le dossier, puis
 * le nom. Une clé différente d'ici à là dédoublonnerait autrement, donc mal.
 */
function compterSocietes(tables: TableSuivi[]): number {
  const vues = new Set<string>();
  for (const table of tables) {
    for (const s of table.societes) vues.add(s.siren || s.dossier || s.societe || '?');
  }
  return vues.size;
}

export interface Catalogue {
  teleprocedures: Record<string, string>;
  typesPiece: Record<string, string>;
  configure: boolean;
}

/** Miroir de `BilanParCompte` côté serveur — voir le commentaire qui l'y explique. */
export interface BilanParCompte {
  compte: number;
  login: string;
  trouvees: number;
  dejaEnCache: number;
  ecarteesPrudence: number;
  aTraiter: number;
  /** La prudence est levée sur ce compte, dans le `.env` : ses lectures marquent. */
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
  /** Vide quand un seul compte de flux est configuré. */
  parCompte?: BilanParCompte[];
}

export interface FiltresSuivi {
  debut: string;
  fin: string;
  axe: 'periode' | 'depot';
}

export class ErreurSuivi extends Error {
  constructor(
    message: string,
    readonly status: number
  ) {
    super(message);
    this.name = 'ErreurSuivi';
  }
}

export async function chargerSuivi(filtres: FiltresSuivi): Promise<Suivi> {
  const q = new URLSearchParams({
    debut: filtres.debut,
    fin: filtres.fin,
    axe: filtres.axe,
  });
  const rep = await appelerFonction<Suivi>(`jedeclare/suivi?${q}`, undefined, { methode: 'GET' });
  if (!rep.ok || !rep.data) {
    throw new ErreurSuivi(rep.message ?? 'Suivi indisponible.', rep.status);
  }
  return rep.data;
}

export async function chargerCatalogue(): Promise<Catalogue> {
  const rep = await appelerFonction<Catalogue>('jedeclare/catalogue', undefined, {
    methode: 'GET',
  });
  if (!rep.ok || !rep.data) {
    throw new ErreurSuivi(rep.message ?? 'Catalogue indisponible.', rep.status);
  }
  return rep.data;
}

/**
 * Enregistre l'état interne d'une cellule.
 *
 * Les identifiants de la société accompagnent l'écriture : la ligne créée doit
 * rester lisible même si la société disparaît du cache, sinon le travail de
 * suivi se réduirait à un SIREN nu.
 */
export async function enregistrerStatut(entree: {
  societe: SocieteSuivie;
  typeDeclaration: string;
  mois: string;
  axe: 'periode' | 'depot';
  statut: StatutInterne;
  commentaire?: string;
}): Promise<void> {
  const rep = await appelerFonction('jedeclare/suivi-interne', {
    siren: entree.societe.siren,
    typeDeclaration: entree.typeDeclaration,
    mois: entree.mois,
    axe: entree.axe,
    statut: entree.statut,
    commentaire: entree.commentaire ?? '',
    societe: entree.societe.societe,
    siret: entree.societe.siret,
    dossier: entree.societe.dossier,
  }, { methode: 'PUT' });

  if (!rep.ok) throw new ErreurSuivi(rep.message ?? 'Enregistrement refusé.', rep.status);
}

/**
 * Fixe — ou retire — le jour d'échéance TVA d'une fiche client.
 *
 * `jour: null` retire la surcharge et rend la main à la règle. C'est la seule
 * façon de défaire un arbitrage posé par erreur sans toucher à la base.
 */
export async function fixerJourEcheance(entree: {
  clientId: string;
  jour: number | null;
}): Promise<void> {
  const rep = await appelerFonction(
    'jedeclare/jour-echeance',
    { clientId: entree.clientId, jour: entree.jour },
    { methode: 'PUT' }
  );
  if (!rep.ok) throw new ErreurSuivi(rep.message ?? 'Enregistrement refusé.', rep.status);
}

/** Rattache une société à une fiche client, à la main. */
export async function rattacherClient(entree: {
  societe: SocieteSuivie;
  typeDeclaration: string;
  mois: string;
  axe: 'periode' | 'depot';
  clientId: string;
  statut: StatutInterne;
}): Promise<void> {
  const rep = await appelerFonction('jedeclare/suivi-interne', {
    siren: entree.societe.siren,
    typeDeclaration: entree.typeDeclaration,
    mois: entree.mois,
    axe: entree.axe,
    statut: entree.statut,
    societe: entree.societe.societe,
    siret: entree.societe.siret,
    dossier: entree.societe.dossier,
    clientId: entree.clientId,
    rapprochementManuel: true,
  }, { methode: 'PUT' });

  if (!rep.ok) throw new ErreurSuivi(rep.message ?? 'Rattachement refusé.', rep.status);
}

/**
 * Lance une analyse. Réservée aux administrateurs, et jamais anodine :
 * elle marque des accusés chez jedeclare. L'appelant doit avoir fait confirmer.
 */
export async function lancerAnalyse(demande: {
  debut: string;
  fin: string;
  procedure?: string;
  limite?: number;
}): Promise<BilanAnalyse> {
  const rep = await appelerFonction<BilanAnalyse>('jedeclare/analyser', demande);
  if (!rep.ok || !rep.data) {
    throw new ErreurSuivi(rep.message ?? "L'analyse a échoué.", rep.status);
  }
  return rep.data;
}

/** Un compte de flux, tel que le serveur l'a interrogé. */
export interface CompteTeste {
  login: string;
  ok: boolean;
  nbPieces?: number;
  detail?: string;
  /**
   * L'état du mode prudent sur ce compte, TEL QUE LE SERVEUR L'A LU.
   *
   * Vérifier un réglage ne doit pas coûter une analyse : lister ne marque rien,
   * analyser marque. C'est donc ici que la réponse se lit.
   */
  marquageAutorise: boolean;
}

export interface ResultatDiagnostic {
  editeur: string;
  logiciel: string;
  login: string;
  /** Vrai dès qu'un des deux services répond : ils sont indépendants. */
  ok: boolean;
  nbComptes: number;
  comptes: CompteTeste[];
  communication: { ok: boolean; nbPieces?: number; detail?: string };
  gestion: { ok: boolean; teste: boolean; nbDossiers?: number; detail?: string };
}

/**
 * Le diagnostic, COMPTE PAR COMPTE.
 *
 * ⚠️ CETTE FONCTION APLATISSAIT LA RÉPONSE en `{ ok, message }`, et aucun écran
 * ne l'appelait. Le serveur teste pourtant chaque compte de flux séparément — il
 * le fait exprès, son commentaire le dit : « un mot de passe faux sur le second
 * compte doit se voir comme tel ». Tout ce détail était jeté à l'arrivée.
 *
 * Conséquence vécue : un cabinet à deux comptes voyait la moitié de ses
 * télétransmissions, sans aucun moyen de savoir lequel des deux ne répondait
 * pas, ni pourquoi. Le diagnostic existait, écrit et testé ; il ne sortait
 * simplement jamais du serveur.
 */
export async function testerConnexion(): Promise<ResultatDiagnostic> {
  const rep = await appelerFonction<ResultatDiagnostic>('jedeclare/tester');
  if (!rep.ok || !rep.data) {
    throw new ErreurSuivi(rep.message ?? 'Test impossible.', rep.status);
  }
  return rep.data;
}

/** « 2026-03 » → « mars 26 ». Les colonnes sont étroites. */
export function moisCourt(mois: string): string {
  const m = mois.match(/^(\d{4})-(\d{2})$/);
  if (!m) return mois;
  const noms = ['janv', 'févr', 'mars', 'avr', 'mai', 'juin',
    'juil', 'août', 'sept', 'oct', 'nov', 'déc'];
  return `${noms[Number(m[2]) - 1] ?? m[2]} ${m[1].slice(2)}`;
}

/**
 * Une colonne de la grille de suivi, et les mois qu'elle recouvre.
 *
 * `mois` peut en contenir un seul (grille mensuelle) ou plusieurs (trimestre,
 * année). Ce tableau n'est jamais vide : une colonne n'existe que si au moins
 * un de ses mois est dans la fenêtre demandée.
 */
export interface Colonne {
  /** Identifiant stable dans la table : `2026-03`, `2026-T1`, `2026`. */
  cle: string;
  /** Ce qui s'écrit dans l'en-tête. */
  libelle: string;
  /** Les mois recouverts, du plus ancien au plus récent. */
  mois: string[];
}

const RANG_TRIMESTRE = ['1er T', '2e T', '3e T', '4e T'];

/**
 * Les colonnes d'un tableau, au pas que sa famille et sa périodicité imposent.
 * ---------------------------------------------------------------------------
 * LE DÉFAUT CORRIGÉ. Une société au régime trimestriel ne déclare qu'un mois
 * sur trois : les deux autres colonnes étaient vides PAR CONSTRUCTION, et rien
 * ne les distinguait à l'écran d'un retard. Le bilan était pire — une liasse
 * par an, donc onze colonnes vides pour une pleine.
 *
 * ⚠️ LE REGROUPEMENT EST CALENDAIRE, et il fallait vérifier qu'il tient sur LES
 * DEUX AXES de l'écran. En axe `période`, une TVA du 1er trimestre porte
 * `periode_fin` en mars — dernier mois de son trimestre. En axe `dépôt`, elle
 * est déposée en avril — premier mois du SUIVANT. Les deux tombent malgré tout
 * dans une seule case chacun, donc une déclaration par colonne dans les deux
 * cas : c'est tout ce qu'on demande ici. Ce que la colonne signifie change avec
 * l'axe — « le trimestre déclaré » ou « le trimestre où l'on a déposé » — mais
 * c'était déjà vrai des mois.
 *
 * Les mois absents de la fenêtre ne créent pas de colonne, et une colonne de
 * bord peut donc ne recouvrir qu'un ou deux mois. C'est voulu : inventer les
 * mois manquants ferait afficher un trimestre entier là où l'utilisateur n'a
 * demandé qu'une partie.
 */
export function colonnesDe(mois: string[], decoupage: Decoupage): Colonne[] {
  if (decoupage === 'mois') {
    return mois.map((m) => ({ cle: m, libelle: moisCourt(m), mois: [m] }));
  }
  const parCle = new Map<string, Colonne>();
  for (const m of mois) {
    const bornes = m.match(/^(\d{4})-(\d{2})$/);
    // Un mois illisible ne disparaît pas : il garde sa propre colonne, plutôt
    // que d'être rangé dans un trimestre inventé ou passé sous silence.
    if (!bornes) {
      parCle.set(m, { cle: m, libelle: m, mois: [m] });
      continue;
    }
    const annee = bornes[1];
    if (decoupage === 'annee') {
      const col = parCle.get(annee) ?? { cle: annee, libelle: annee, mois: [] };
      col.mois.push(m);
      parCle.set(annee, col);
      continue;
    }
    const rang = Math.floor((Number(bornes[2]) - 1) / 3);
    const cle = `${annee}-T${rang + 1}`;
    const col = parCle.get(cle) ?? {
      cle,
      libelle: `${RANG_TRIMESTRE[rang]} ${annee.slice(2)}`,
      mois: [],
    };
    col.mois.push(m);
    parCle.set(cle, col);
  }
  return [...parCle.values()];
}

/** Ce qu'une colonne affiche pour une société, et les mois réels qu'elle vise. */
export interface CelluleResolue {
  /**
   * LE MOIS OÙ S'ÉCRIT LE STATUT DU CABINET, et il n'est pas décoratif.
   *
   * Le suivi interne est stocké par mois — `jedeclare_suivi_interne` porte une
   * contrainte `^\d{4}-(0[1-9]|1[0-2])$` sur sa colonne `mois`, et sa clé
   * unique est `(siren, type_declaration, mois, axe)`. Une colonne « 1er T »
   * n'est donc pas écrivable telle quelle : poser un statut dessus doit viser
   * un mois, et toujours LE MÊME, sans quoi le même statut s'écrirait à deux
   * endroits et la période en afficherait deux.
   */
  moisStatut: string;
  /** Le mois de la déclaration montrée : c'est lui qu'ouvre le détail. */
  moisDeclaration: string;
  /**
   * La cellule affichée, RECOMPOSÉE : la déclaration vient de `moisDeclaration`,
   * le statut de `moisStatut`. Les deux ne tombent pas toujours au même mois.
   */
  cellule: CelluleSuivi;
  /**
   * Déclarations que la colonne recouvre.
   *
   * Vaut 1 dans le cas normal — un trimestre, une déclaration. Au-delà, la
   * colonne en cumule plusieurs et n'en montre qu'une : l'écran doit pouvoir le
   * signaler plutôt que de laisser croire qu'il n'y en a eu qu'une.
   */
  nbDeclarations: number;
}

/**
 * Ce qu'une colonne montre pour une société, et où s'écrit son statut.
 * ---------------------------------------------------------------------------
 * ⚠️ DEUX MOIS ET NON UN, et c'est une correction, pas un raffinement. La
 * déclaration et le suivi du cabinet ne tombent PAS forcément au même mois
 * d'une même période : sur le bilan, un « à faire » posé en mars du temps de la
 * grille mensuelle voisine avec une liasse déposée en mai. Ne retenir qu'un
 * mois faisait disparaître l'un des deux de l'écran — le statut se serait tu,
 * puis aurait été réécrit ailleurs, et l'année en aurait porté deux.
 *
 * En les résolvant séparément, la colonne montre les deux, et le statut se
 * réécrit LÀ OÙ IL EST DÉJÀ.
 *
 * L'ordre de préférence, et pourquoi celui-là :
 *
 *  · le statut va au dernier mois qui en porte un — c'est ce qui rend le
 *    changement rétrocompatible, rien n'étant migré en base — sinon au mois de
 *    la déclaration, sinon au dernier mois de la colonne, par convention stable ;
 *  · la déclaration va au dernier mois qui en porte une, parce que le détail
 *    qu'on ouvre doit montrer une pièce qui existe.
 *
 * « Dernier » plutôt que « premier » parce qu'en axe `période` une déclaration
 * trimestrielle porte sa borne de fin — mars pour le 1er trimestre —, donc le
 * dernier mois de la colonne est déjà celui où elle tombe.
 */
export function resoudreCellule(
  societe: SocieteSuivie,
  colonne: Colonne
): CelluleResolue {
  let avecDeclaration: string | null = null;
  let avecStatut: string | null = null;
  let nbDeclarations = 0;
  for (const m of colonne.mois) {
    const c = societe.cellules[m];
    if (!c) continue;
    if (c.jedeclare) {
      avecDeclaration = m;
      nbDeclarations += 1;
    }
    if (c.interne) avecStatut = m;
  }
  const dernier = colonne.mois[colonne.mois.length - 1] ?? colonne.cle;
  const moisStatut = avecStatut ?? avecDeclaration ?? dernier;
  const moisDeclaration = avecDeclaration ?? moisStatut;
  return {
    moisStatut,
    moisDeclaration,
    cellule: {
      jedeclare: societe.cellules[moisDeclaration]?.jedeclare ?? null,
      interne: societe.cellules[moisStatut]?.interne ?? null,
    },
    nbDeclarations,
  };
}

/**
 * Bornes par défaut : six mois en arrière, deux mois en avant.
 *
 * Les douze derniers mois faisaient une trentaine de colonnes de TVA à faire
 * défiler, dont la moitié n'intéressait plus personne : une échéance de TVA se
 * regarde sur le trimestre écoulé, pas sur l'année. Six mois couvrent le
 * rattrapage d'un retard, et les deux mois en avant montrent ce qui arrive —
 * une période déclarée par avance a bien une date de fin dans le futur.
 *
 * Les bornes s'alignent sur des mois pleins : du premier jour du mois de début
 * au dernier jour du mois de fin. Sans cela, une exécution le 15 amputait le
 * premier et le dernier mois de la fenêtre, et la colonne correspondante
 * paraissait vide alors qu'elle était seulement tronquée.
 */
export function periodeParDefaut(): { debut: string; fin: string } {
  const maintenant = new Date();
  const debut = new Date(maintenant.getFullYear(), maintenant.getMonth() - 6, 1);
  // Jour 0 du mois suivant = dernier jour du mois visé.
  const fin = new Date(maintenant.getFullYear(), maintenant.getMonth() + 3, 0);
  const iso = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  return { debut: iso(debut), fin: iso(fin) };
}
