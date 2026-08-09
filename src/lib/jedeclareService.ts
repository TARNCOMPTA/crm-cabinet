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

export interface SocieteSuivie {
  societe: string;
  siren: string;
  siret: string;
  dossier: string;
  clientId: string | null;
  clientNom: string | null;
  rapprochement: NiveauRapprochement;
  monDossier: boolean;
  cellules: Record<string, CelluleSuivi>;
}

export interface TableSuivi {
  typeDeclaration: string;
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

export interface Catalogue {
  teleprocedures: Record<string, string>;
  typesPiece: Record<string, string>;
  configure: boolean;
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
}

export interface FiltresSuivi {
  debut: string;
  fin: string;
  procedure: string;
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
  if (filtres.procedure && filtres.procedure !== 'TOUTES') q.set('procedure', filtres.procedure);

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
