/**
 * Connecteur jedeclare.com — LECTURE SEULE.
 * ---------------------------------------------------------------------------
 * Porté depuis `ecritures-api`, où il est en service. Deux services distincts,
 * deux authentifications, un seul couple login / mot de passe :
 *
 *   1. « Communication V2 » — les comptes rendus de télétransmission. SOAP sur
 *      `/webservices/wspid_spring/CommunicationV2Service/`, espace de noms
 *      `http://experian.com/communicationV2/schemas`. Deux opérations :
 *      `ListeDisponibiliteV2` pour lister, `DemandeAccuse` pour récupérer. La
 *      pièce revient en base64 DANS la réponse SOAP (champ `pieceJointe`), pas
 *      en pièce jointe MIME.
 *
 *   2. « Gestion des dossiers » — REST/XML en HTTP Basic (realm `jdc-users`),
 *      avec un identifiant de compte numérique dans l'URL.
 *
 * ⚠️ LE POINT LE PLUS IMPORTANT DE CE FICHIER — LE MARQUAGE DES PIÈCES.
 *
 * Récupérer une pièce la fait passer en « déjà récupérée » chez jedeclare. Si
 * le cabinet dépose ses flux avec un autre logiciel, celui-ci ne verra donc
 * plus ses propres accusés comme nouveaux. Ce n'est pas une opération coûteuse :
 * c'est une opération DESTRUCTRICE POUR UN TIERS.
 *
 * Trois conséquences, toutes délibérées :
 *   · on interroge par défaut TOUTES les pièces (`statutPiece = '01'`), jamais
 *     seulement les non récupérées — le filtre « non récupéré » appartient au
 *     logiciel de production ;
 *   · l'analyse d'un accusé est réservée aux administrateurs, en mode prudent,
 *     et jamais planifiée (voir `routes/jedeclare.ts`) ;
 *   · la vraie parade est CONTRACTUELLE : faire déclarer le couple
 *     éditeur/logiciel en exception de marquage auprès de
 *     `contacts.editeurs@jedeclare.info`. Tant que ce n'est pas fait, chaque
 *     lecture a un coût chez le cabinet.
 *
 * Les identifiants viennent du `.env` de l'instance et n'atteignent jamais le
 * navigateur — même parti pris que l'INPI.
 */

import { gunzipSync } from 'node:zlib';
import { config } from '../config.js';
import { echapper, extraire, extraireTous, chemin } from './xml.js';
import { analyserEml, trouverPiece, corpsTexte } from './mime.js';

const NS = 'http://experian.com/communicationV2/schemas';

export const TYPES_PIECE: Record<string, string> = {
  '00': 'ADS — accusé de dépôt',
  '01': 'ACS — accusé de conformité',
  '02': 'ARS — accusé de réponse',
  '03': 'Réception',
  '04': 'Réception (EML avec AIS)',
};

/**
 * Liste ordonnée, et non un objet : les clés numériques d'un objet JavaScript
 * seraient réordonnées par le moteur, et le premier choix est celui que
 * l'interface présélectionne.
 */
export const TYPES_LISTE = [
  { valeur: '99', libelle: 'Tout (ADS, ACS, ARS, réceptions)' },
  { valeur: '98', libelle: 'ACS et ARS' },
  { valeur: '97', libelle: 'ACS, ARS et réceptions' },
  { valeur: '00', libelle: 'ADS seulement' },
  { valeur: '01', libelle: 'ACS seulement' },
  { valeur: '02', libelle: 'ARS seulement' },
  { valeur: '03', libelle: 'Réceptions seulement' },
] as const;

/** Téléprocédures les plus courantes en cabinet. Filtre facultatif. */
export const TELEPROCEDURES = [
  'EDI-TDFC', 'EDI-TVA', 'DSN', 'EDI-PAIE', 'EDI-IR', 'EDI-PART', 'EDI-OGA',
  'DUCS', 'DPAE_MSA', 'DUE', 'EDI-DSI', 'DTS', 'BPIJ', 'RELEVE',
] as const;

/**
 * jedeclare répond 200 avec un code d'erreur dans le corps : le statut HTTP ne
 * suffit pas à savoir si l'appel a réussi.
 */
const CODES_RETOUR: Record<string, string | null> = {
  '00': null, // succès
  '04': 'type de compression non supporté',
  '05': 'requête mal formée (souvent : plage de dates trop large)',
  '06': 'authentification refusée par jedeclare',
  '07': 'document non disponible',
  '08': 'le numéro demandé n’appartient pas à ce compte',
  '11': 'téléprocédure incorrecte',
  '99': 'problème technique côté jedeclare',
};

/** Erreur portant le statut à rendre au client. Calquée sur `ErreurInpi`. */
export class ErreurJedeclare extends Error {
  readonly status: number;
  constructor(message: string, status = 502) {
    super(message);
    this.name = 'ErreurJedeclare';
    this.status = status;
  }
}

interface Identifiants {
  login: string;
  motDePasse: string;
  editeur: string;
  logiciel: string;
  version: string;
  idCompte: string;
}

/**
 * Les identifiants d'UN compte de flux, désigné par son rang (0 = le premier).
 *
 * Le cabinet peut en avoir plusieurs, et une requête ne voit que le compte
 * qu'elle authentifie : le rang doit donc suivre la pièce jusqu'à sa
 * récupération, sinon on la demande au mauvais compte et jedeclare répond
 * qu'elle n'existe pas.
 */
function identifiants(compte = 0): Identifiants {
  const { comptes, editeur, logiciel, version } = config.jedeclare;
  if (comptes.length === 0 || !editeur) {
    throw new ErreurJedeclare(
      'jedeclare non configure : renseigne JEDECLARE_LOGIN, JEDECLARE_MDP et JEDECLARE_EDITEUR.',
      503
    );
  }
  const choisi = comptes[compte];
  if (!choisi) {
    throw new ErreurJedeclare(
      `compte jedeclare n°${compte + 1} inconnu : ${comptes.length} compte(s) configure(s).`,
      500
    );
  }
  return { ...choisi, editeur, logiciel, version };
}

/** Les rangs des comptes configurés : `[0]`, ou `[0, 1]` si le cabinet en a deux. */
export function rangsComptes(): number[] {
  return config.jedeclare.comptes.map((_, rang) => rang);
}

/** La façade parle ISO (AAAA-MM-JJ), jedeclare attend JJ/MM/AAAA. */
export function isoVersFr(iso: string | null | undefined): string {
  if (!iso) return '';
  const m = String(iso).match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : String(iso);
}

// ------------------------------------------------------------------ SOAP

function enveloppe(operation: string, corps: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:sch="${NS}">
<soapenv:Header/>
<soapenv:Body><sch:${operation}Request>${corps}</sch:${operation}Request></soapenv:Body>
</soapenv:Envelope>`;
}

function blocsAuth(ids: Identifiants): string {
  return (
    `<sch:Authentification>` +
    `<sch:motDePasse>${echapper(ids.motDePasse)}</sch:motDePasse>` +
    `<sch:nom>${echapper(ids.login)}</sch:nom>` +
    `</sch:Authentification>` +
    `<sch:Identification>` +
    `<sch:editeur>${echapper(ids.editeur)}</sch:editeur>` +
    `<sch:logiciel>${echapper(ids.logiciel)}</sch:logiciel>` +
    `<sch:version>${echapper(ids.version)}</sch:version>` +
    `</sch:Identification>`
  );
}

async function appelSoap(operation: string, corps: string, essai = 0): Promise<string> {
  let reponse: Response;
  try {
    reponse = await fetch(config.jedeclare.urlCommunication, {
      method: 'POST',
      headers: { 'Content-Type': 'text/xml; charset=utf-8', SOAPAction: '""' },
      body: enveloppe(operation, corps),
      signal: AbortSignal.timeout(60_000),
    });
  } catch (e) {
    // Coupure réseau passagère : une seconde tentative avant d'abandonner.
    if (essai === 0) {
      await new Promise((resoudre) => setTimeout(resoudre, 1500));
      return appelSoap(operation, corps, 1);
    }
    const detail = e instanceof Error ? e.message : String(e);
    throw new ErreurJedeclare(`jedeclare injoignable (${detail})`, 502);
  }

  const texte = await reponse.text();
  if (!reponse.ok) {
    throw new ErreurJedeclare(`jedeclare a repondu ${reponse.status}`, reponse.status >= 400 ? reponse.status : 502);
  }
  const faute = extraire(texte, 'faultstring');
  if (faute) throw new ErreurJedeclare(`jedeclare (SOAP) : ${faute}`, 502);
  return texte;
}

function verifierCodeRetour(xml: string): string | null {
  const code = extraire(xml, 'codeRetour');
  const probleme = code === null ? null : CODES_RETOUR[code];
  if (probleme) {
    const message = extraire(xml, 'message');
    throw new ErreurJedeclare(
      `code retour ${code} : ${probleme}${message ? ` (${message})` : ''}`,
      code === '06' ? 401 : 502
    );
  }
  return code;
}

export interface PieceDisponible {
  numero: string;
  statut: string;
  typePiece: string;
  libelleType: string;
  numeroADS: string;
  /** Vrai si jedeclare la considère déjà récupérée — voir l'en-tête du fichier. */
  recuperee: boolean;
  procedure: string;
  /** Rang du compte de flux qui l'a listée. Indispensable pour la récupérer. */
  compte: number;
}

/**
 * Une interrogation porte toujours sur UNE téléprocédure : sans elle, jedeclare
 * répond « code retour 11 : téléprocédure incorrecte ».
 */
async function listeParProcedure(opts: {
  debut: string;
  fin: string;
  typeDeListe: string;
  statutPiece: string;
  typeProcedure: string;
  identifiantDossier?: string;
  compte: number;
}): Promise<PieceDisponible[]> {
  const ids = identifiants(opts.compte);
  let corps =
    blocsAuth(ids) +
    `<sch:RequeteListe>` +
    `<sch:dateDebut>${echapper(isoVersFr(opts.debut))}</sch:dateDebut>` +
    `<sch:dateFin>${echapper(isoVersFr(opts.fin))}</sch:dateFin>` +
    `<sch:statutPiece>${echapper(opts.statutPiece)}</sch:statutPiece>` +
    `<sch:typeDeListe>${echapper(opts.typeDeListe)}</sch:typeDeListe>` +
    `<sch:typeProcedure>${echapper(opts.typeProcedure)}</sch:typeProcedure>`;
  if (opts.identifiantDossier) {
    corps += `<sch:identifiantDossier>${echapper(opts.identifiantDossier)}</sch:identifiantDossier>`;
  }
  corps += `</sch:RequeteListe>`;

  const xml = await appelSoap('ListeDisponibiliteV2', corps);
  verifierCodeRetour(xml);
  const liste = extraire(xml, 'liste') ?? '';
  return extraireTous(liste, 'item').map((item) => {
    const typePiece = extraire(item, 'typeDePiece') ?? '';
    const statut = extraire(item, 'statut') ?? '';
    return {
      numero: extraire(item, 'numero') ?? '',
      statut,
      typePiece,
      libelleType: TYPES_PIECE[typePiece] ?? typePiece,
      numeroADS: extraire(item, 'numeroADS') ?? '',
      recuperee: statut === '01',
      procedure: opts.typeProcedure,
      compte: opts.compte,
    };
  });
}

/**
 * jedeclare refuse les plages trop larges — sa documentation annonce 18 mois.
 * On découpe ici pour que l'appelant n'ait pas à connaître cette limite.
 */
export function decouperFenetre(
  debut: string,
  fin: string,
  joursMax = 540
): Array<{ debut: string; fin: string }> {
  const depart = Date.parse(`${debut}T00:00:00Z`);
  const arrivee = Date.parse(`${fin}T00:00:00Z`);
  if (!Number.isFinite(depart) || !Number.isFinite(arrivee) || depart > arrivee) {
    return [{ debut, fin }];
  }
  const fenetres: Array<{ debut: string; fin: string }> = [];
  const JOUR = 86_400_000;
  for (let curseur = depart; curseur <= arrivee; ) {
    const finTranche = Math.min(curseur + (joursMax - 1) * JOUR, arrivee);
    fenetres.push({
      debut: new Date(curseur).toISOString().slice(0, 10),
      fin: new Date(finTranche).toISOString().slice(0, 10),
    });
    curseur = finTranche + JOUR;
  }
  return fenetres;
}

/**
 * Liste les pièces disponibles sur une période.
 *
 * `statutPiece` vaut '01' (toutes) par défaut, et non '00' (non récupérées) —
 * voir l'en-tête du fichier : le filtre « non récupéré » appartient au logiciel
 * de production du cabinet.
 */
export async function listePieces(opts: {
  debut: string;
  fin: string;
  typeDeListe?: string;
  statutPiece?: string;
  typeProcedure?: string;
  identifiantDossier?: string;
}): Promise<PieceDisponible[]> {
  const typeDeListe = opts.typeDeListe ?? '99';
  const statutPiece = opts.statutPiece ?? '01';
  const procedures =
    !opts.typeProcedure || opts.typeProcedure === 'TOUTES'
      ? [...TELEPROCEDURES]
      : [opts.typeProcedure];
  const fenetres = decouperFenetre(opts.debut, opts.fin);

  // Chaque compte de flux est interrogé séparément : une requête ne voit que le
  // compte qu'elle authentifie. Sans cette troisième dimension, un cabinet à
  // deux comptes ne voyait que la moitié de ses télétransmissions.
  const taches: Array<{ procedure: string; debut: string; fin: string; compte: number }> = [];
  for (const compte of rangsComptes()) {
    for (const procedure of procedures) {
      for (const fenetre of fenetres) taches.push({ procedure, compte, ...fenetre });
    }
  }

  const pieces: PieceDisponible[] = [];
  const vues = new Set<string>();
  const ignorees = new Set<string>();
  const file = [...taches];

  const travailleur = async (): Promise<void> => {
    for (;;) {
      const tache = file.shift();
      if (!tache) return;
      try {
        const lot = await listeParProcedure({
          debut: tache.debut,
          fin: tache.fin,
          typeDeListe,
          statutPiece,
          typeProcedure: tache.procedure,
          identifiantDossier: opts.identifiantDossier,
          compte: tache.compte,
        });
        for (const piece of lot) {
          /**
           * Une même pièce peut ressortir sur deux tranches limitrophes — c'est
           * ce que ce dédoublonnage écarte, et rien d'autre.
           *
           * ⚠️ LE COMPTE FAIT PARTIE DE LA CLÉ, et il en manquait. Un numéro de
           * pièce est rattaché au compte qui l'a déposée : `PieceDisponible.compte`
           * est d'ailleurs décrit comme « indispensable pour la récupérer ». Deux
           * comptes numérotant leurs pièces chacun de leur côté, une clé sans le
           * compte faisait passer les pièces du SECOND pour des doublons de
           * celles du PREMIER — et les jetait.
           *
           * Le cabinet voyait alors la moitié de ses télétransmissions, sans
           * aucun message : le second compte s'authentifiait correctement, la
           * requête aboutissait, et le résultat était écarté ici, en silence.
           * Le tri par compte n'existait que jusqu'à cette ligne.
           *
           * À l'intérieur d'un même compte, le comportement est inchangé.
           */
          const cle = `${piece.compte}|${piece.numero}|${piece.typePiece}`;
          if (vues.has(cle)) continue;
          vues.add(cle);
          pieces.push(piece);
        }
      } catch (e) {
        // Téléprocédure non souscrite : on l'ignore — sauf si c'est justement
        // celle que l'utilisateur a demandée.
        const message = e instanceof Error ? e.message : '';
        if (procedures.length > 1 && /code retour 11/.test(message)) {
          ignorees.add(tache.procedure);
          continue;
        }
        throw e;
      }
    }
  };

  await Promise.all(Array.from({ length: Math.min(4, taches.length) }, travailleur));
  return pieces;
}

export interface PieceRecuperee {
  numero: string;
  date: string | null;
  typePiece: string;
  contentType: string;
  contenu: Buffer;
}

/**
 * Récupère une pièce. Demandée compressée puis décompressée ici, pour livrer le
 * document tel quel — les accusés sont des courriels.
 *
 * ⚠️ Cet appel MARQUE la pièce comme récupérée chez jedeclare.
 */
export async function recupererPiece(opts: {
  numero: string;
  typePiece?: string;
  /** Rang du compte qui a listé la pièce ; un autre ne la connaît pas. */
  compte?: number;
}): Promise<PieceRecuperee> {
  const typePiece = opts.typePiece ?? '01';
  const ids = identifiants(opts.compte ?? 0);
  const corps =
    blocsAuth(ids) +
    `<sch:RequeteDemandePiece>` +
    `<sch:mimeTypeReponse>application/gzip</sch:mimeTypeReponse>` +
    `<sch:numero>${echapper(opts.numero)}</sch:numero>` +
    `<sch:typePiece>${echapper(typePiece)}</sch:typePiece>` +
    `</sch:RequeteDemandePiece>`;

  const xml = await appelSoap('DemandeAccuse', corps);
  verifierCodeRetour(xml);
  const base64 = extraire(xml, 'pieceJointe');
  if (!base64) throw new ErreurJedeclare('reponse jedeclare sans piece jointe', 502);

  const brut = Buffer.from(base64, 'base64');
  let contenu = brut;
  // Signature gzip `1f 8b` : on décompresse quel que soit le type annoncé, que
  // jedeclare ne renseigne pas toujours.
  if (brut[0] === 0x1f && brut[1] === 0x8b) {
    try {
      contenu = gunzipSync(brut);
    } catch {
      contenu = brut; // livrer le brut vaut mieux que rien
    }
  }
  return {
    numero: extraire(xml, 'numero') ?? opts.numero,
    date: extraire(xml, 'date'),
    typePiece: extraire(xml, 'typeDePiece') ?? typePiece,
    contentType: (extraire(xml, 'contentType') ?? '').toLowerCase(),
    contenu,
  };
}

// ------------------------------------------ Lecture humaine d'un accusé

const RESULTATS: Record<string, string> = {
  declarationsAcceptees: 'acceptée',
  declarationsAccepteesAno: 'acceptée avec anomalie',
  declarationsRejetees: 'rejetée',
  declarationsEnAttente: 'en attente',
  declarationsSuspendues: 'suspendue',
};

function dateLisible(valeur: string | null): string | null {
  const m = String(valeur ?? '').match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : null;
}

export interface DeclarationAvis {
  resultat: string;
  siret: string | null;
  societe: string | null;
  dossier: string | null;
  typeDeclaration: string | null;
  typeLibelle: string | null;
  destinataire: string | null;
  periodeDebut: string | null;
  periodeFin: string | null;
  rof: string | null;
  montant: number | null;
  bloquee: boolean;
}

export interface EnTeteAvis {
  nature: string | null;
  numeroADS: string | null;
  dateISO: string;
  nbDeclarations: number | null;
  message: string | null;
  lien: string | null;
}

export function analyserAvis(xml: string): { avis: EnTeteAvis; declarations: DeclarationAvis[] } {
  const racine = xml.match(/<(avis[A-Za-z]*)[\s>]/)?.[1] ?? null;
  const nombre = (nom: string): number | null => {
    const brut = extraire(xml, nom);
    return brut === null || brut === '' ? null : Number(brut);
  };

  const avis: EnTeteAvis = {
    nature:
      racine === 'avisConformiteSigne' ? 'ACS' : racine === 'avisReceptionSigne' ? 'ARS' : racine,
    numeroADS: extraire(xml, 'numeroAds'),
    dateISO: (extraire(xml, 'dateAcs') ?? extraire(xml, 'dateArs') ?? '').slice(0, 19),
    nbDeclarations: nombre('nbDecl'),
    message: extraire(xml, 'msgLibre'),
    lien: extraire(xml, 'lienProfond'),
  };

  /**
   * Les déclarations sont groupées dans des balises `<declarationsXxx>` dont le
   * NOM porte le résultat. On les découvre au lieu de les présumer : jedeclare
   * en ajoute au fil des évolutions, et une liste figée en manquerait
   * silencieusement.
   */
  const conteneurs = [...new Set([...xml.matchAll(/<(declarations[A-Za-z]*)[\s>]/g)].map((m) => m[1]!))];
  const declarations: DeclarationAvis[] = [];
  for (const conteneur of conteneurs) {
    for (const bloc of extraireTous(xml, conteneur)) {
      const montantBrut = Number(extraire(bloc, 'montantTd'));
      declarations.push({
        resultat: RESULTATS[conteneur] ?? conteneur.replace(/^declarations/, '').toLowerCase(),
        siret: extraire(bloc, 'siret'),
        societe: extraire(bloc, 'rs'),
        dossier: extraire(bloc, 'numeroInterne'),
        // Le code technique est le seul identifiant STABLE : l'ACS ne porte que
        // lui, l'ARS y ajoute un libellé. Les deux sont conservés, et c'est le
        // code qui identifie un onglet.
        typeDeclaration: extraire(bloc, 'typeDeclaration'),
        typeLibelle: extraire(bloc, 'typeDeclarationLabel'),
        destinataire: extraire(bloc, 'destinataire'),
        periodeDebut: dateLisible(extraire(bloc, 'periodeDepotDeb')),
        periodeFin: dateLisible(extraire(bloc, 'periodeDepotFin')),
        rof: extraire(bloc, 'rof'),
        montant: Number.isFinite(montantBrut) && montantBrut >= 0 ? montantBrut : null,
        bloquee: extraire(bloc, 'isDeclarationBloquee') === 'true',
      });
    }
  }
  return { avis, declarations };
}

/**
 * Télécharge un accusé et en tire les informations lisibles.
 *
 * ⚠️ Comme tout téléchargement, ceci MARQUE la pièce chez jedeclare.
 */
export async function analyserPiece(opts: {
  numero: string;
  typePiece?: string;
  compte?: number;
}): Promise<{
  numero: string;
  typePiece: string;
  libelleType: string;
  dateMiseADisposition: string | null;
  sujet: string;
  avis: EnTeteAvis | null;
  declarations: DeclarationAvis[];
  texte: string;
}> {
  const piece = await recupererPiece(opts);
  const eml = analyserEml(piece.contenu);
  const avisXml = trouverPiece(eml, /^avis\.xml$/i);
  const analyse = avisXml
    ? analyserAvis(avisXml.contenu.toString('utf8'))
    : { avis: null, declarations: [] };
  return {
    numero: piece.numero,
    typePiece: piece.typePiece,
    libelleType: TYPES_PIECE[piece.typePiece] ?? piece.typePiece,
    dateMiseADisposition: piece.date,
    sujet: eml.sujet,
    ...analyse,
    texte: corpsTexte(eml),
  };
}

// -------------------------------------------- REST « gestion » (Basic)

async function appelGestion(cheminUrl: string, compte = 0): Promise<string> {
  const ids = identifiants(compte);
  if (!ids.idCompte) {
    throw new ErreurJedeclare(
      'JEDECLARE_ID_COMPTE non renseigne : necessaire pour la liste des dossiers.',
      503
    );
  }
  const url = `${config.jedeclare.urlGestion}/compte/${encodeURIComponent(ids.idCompte)}${cheminUrl}`;
  const reponse = await fetch(url, {
    headers: {
      Authorization: `Basic ${Buffer.from(`${ids.login}:${ids.motDePasse}`).toString('base64')}`,
      Accept: 'application/xml',
    },
    signal: AbortSignal.timeout(30_000),
  });
  const texte = await reponse.text();
  if (reponse.status === 401) {
    throw new ErreurJedeclare('couple login / mot de passe refuse par jedeclare.', 401);
  }
  if (reponse.status === 404) {
    throw new ErreurJedeclare(`identifiant de compte ${ids.idCompte} inconnu chez jedeclare.`, 404);
  }
  if (!reponse.ok) throw new ErreurJedeclare(`jedeclare (gestion) a repondu ${reponse.status}`, 502);
  return texte;
}

/**
 * Les dossiers de TOUS les comptes de flux, fusionnés.
 *
 * Un compte sans `idCompte` est sauté plutôt que de faire échouer l'ensemble :
 * l'identifiant ne sert qu'à ce service, et le cabinet n'a pas forcément demandé
 * l'accès « gestion » pour chacun de ses comptes.
 *
 * Le même dossier peut être suivi sous deux comptes : on le rend une seule fois.
 */
export async function dossiers(): Promise<
  Array<{ numero: string; nom: string; siret: string; siren: string }>
> {
  const avecIdentifiant = rangsComptes().filter((rang) => config.jedeclare.comptes[rang]?.idCompte);
  if (avecIdentifiant.length === 0) {
    throw new ErreurJedeclare(
      'JEDECLARE_ID_COMPTE non renseigne : necessaire pour la liste des dossiers.',
      503
    );
  }

  const lots = await Promise.all(
    avecIdentifiant.map(async (rang) => {
      const xml = await appelGestion('/dossierClient', rang);
      return extraireTous(xml, 'dossierClient').map((bloc) => {
        const client = extraire(bloc, 'client') ?? bloc;
        const siren = chemin(client, 'siretPrincipal', 'siren') ?? '';
        const nic = chemin(client, 'siretPrincipal', 'nic') ?? '';
        return {
          numero: extraire(client, 'id') ?? '',
          nom: extraire(client, 'rs') ?? '',
          siret: siren && nic ? `${siren}${nic}` : siren,
          siren,
        };
      });
    })
  );

  const vus = new Set<string>();
  return lots.flat().filter((d) => {
    const cle = d.siren || d.numero || d.nom;
    if (vus.has(cle)) return false;
    vus.add(cle);
    return true;
  });
}

/**
 * Teste les deux services INDÉPENDAMMENT : l'un peut fonctionner sans l'autre
 * (comptes de flux distincts, identifiant de compte absent…). Ne lève pas — le
 * résultat décrit ce qui marche et ce qui ne marche pas.
 */
export async function testerConnexion(): Promise<{
  editeur: string;
  logiciel: string;
  login: string;
  ok: boolean;
  /** Nombre de comptes de flux configurés, et le détail de chacun. */
  nbComptes: number;
  comptes: Array<{ login: string; ok: boolean; nbPieces?: number; detail?: string }>;
  communication: { ok: boolean; nbPieces?: number; detail?: string };
  gestion: { ok: boolean; teste: boolean; nbDossiers?: number; detail?: string };
}> {
  const ids = identifiants();
  const hier = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);

  // Compte par compte, et non en une fois : un mot de passe faux sur le second
  // compte doit se voir comme tel. Un test global se contenterait d'echouer,
  // sans dire lequel des deux est en cause.
  const comptes = await Promise.all(
    rangsComptes().map(async (rang) => {
      const login = config.jedeclare.comptes[rang]!.login;
      try {
        // Une téléprocédure explicite est indispensable, sinon « code retour 11 ».
        const lot = await listeParProcedure({
          debut: hier,
          fin: hier,
          typeDeListe: '99',
          statutPiece: '01',
          typeProcedure: 'EDI-TDFC',
          compte: rang,
        });
        return { login, ok: true, nbPieces: lot.length };
      } catch (e) {
        return { login, ok: false, detail: e instanceof Error ? e.message : String(e) };
      }
    })
  );

  const enEchec = comptes.filter((c) => !c.ok);
  const communication: { ok: boolean; nbPieces?: number; detail?: string } =
    enEchec.length === 0
      ? { ok: true, nbPieces: comptes.reduce((n, c) => n + (c.nbPieces ?? 0), 0) }
      : {
          ok: false,
          detail: enEchec.map((c) => `${c.login} : ${c.detail}`).join(' | '),
        };

  let gestion: { ok: boolean; teste: boolean; nbDossiers?: number; detail?: string } = {
    ok: false,
    teste: rangsComptes().some((rang) => config.jedeclare.comptes[rang]?.idCompte),
  };
  if (gestion.teste) {
    try {
      gestion = { ok: true, teste: true, nbDossiers: (await dossiers()).length };
    } catch (e) {
      gestion = { ok: false, teste: true, detail: e instanceof Error ? e.message : String(e) };
    }
  }

  return {
    editeur: ids.editeur,
    logiciel: ids.logiciel,
    login: ids.login,
    ok: communication.ok || gestion.ok,
    nbComptes: comptes.length,
    comptes,
    communication,
    gestion,
  };
}
