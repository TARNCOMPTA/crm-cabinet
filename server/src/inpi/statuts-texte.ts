/**
 * Les statuts, lus : le texte du PDF et les repères qu'on peut en tirer sans
 * interpréter.
 * ---------------------------------------------------------------------------
 * Ce module est au téléchargement ce que `statuts.ts` est à la liste des
 * pièces : la partie qui décide, séparée de celle qui parle au réseau.
 *
 * ⚠️ CE QU'IL NE FAIT PAS, ET POURQUOI C'EST LE POINT IMPORTANT.
 *
 * Il ne cherche NI la répartition des parts, NI les associés, NI la gérance.
 * Ce n'est pas un oubli : ces informations sont rédigées EN PROSE, et leur
 * formulation change d'un rédacteur à l'autre — « Monsieur X, à concurrence de
 * deux cent cinquante parts », « les parts sont réparties comme suit : … »,
 * un tableau, une annexe. Une expression régulière y produirait des réponses
 * fausses avec l'assurance des réponses justes, et ces réponses-là finiraient
 * dans une attestation signée.
 *
 * Le texte est donc rendu tel quel à l'appelant, qui le confie à un modèle.
 * Ici on ne relève que ce qui est MÉCANIQUE : un montant suivi d'« euros », un
 * nombre d'années, une date de clôture. Chacun rend `null` dès qu'il n'est pas
 * certain — JAMAIS une valeur devinée.
 */

import { fermerPdf, ouvrirPdf } from './pdfjs.js';

export interface Reperes {
  denomination: string | null;
  forme: string | null;
  /** En euros. `null` si le montant n'est pas écrit en chiffres. */
  capitalSocial: number | null;
  dureeAns: number | null;
  /** Jour et mois de clôture, au format `JJ/MM`. */
  cloture: string | null;
}

/**
 * Le texte d'un PDF, et son nombre de pages.
 *
 * ⚠️ UN TEXTE VIDE N'EST PAS UNE ERREUR, c'est un DIAGNOSTIC : le document est
 * un scan, sans couche texte. Beaucoup de statuts déposés avant la
 * dématérialisation le sont. L'appelant doit le dire à l'utilisateur, et
 * surtout pas rendre « aucune information trouvée » — qui se confondrait avec
 * « la société n'a pas de statuts ».
 */
export async function extraireTexte(
  pdf: Buffer
): Promise<{ texte: string; pages: number; parPage: string[] }> {
  /**
   * ⚠️ PAGE PAR PAGE, ET NON FUSIONNÉ, PARCE QU'UN DÉPÔT EST SOUVENT MIXTE.
   *
   * Le greffe place devant les statuts une PAGE DE GARDE générée, qui a une
   * couche texte, puis les pages du document, qui sont un scan et n'en ont pas.
   * Fusionner rendait un texte NON VIDE — celui de la seule page de garde — et
   * le document entier passait pour lisible : l'outil rendait deux lignes
   * d'en-tête de greffe et rien du contenu. Constaté à l'usage sur un statut de
   * 22 pages.
   *
   * Le détail par page permet de dire, page par page, ce qui se lit et ce qui
   * demande une image.
   */
  const doc = await ouvrirPdf(pdf);
  const parPage: string[] = [];
  for (let n = 1; n <= doc.numPages; n++) {
    const contenu = await (await doc.getPage(n)).getTextContent();
    // La concaténation reprend telle quelle celle d'`unpdf`, remplacé ici : le
    // saut de ligne vient de `hasEOL`, pas d'une séparation ajoutée entre les
    // fragments. Les repères de plus bas dans ce fichier ont été réglés sur ce
    // texte-là ; en changer le collage les casserait sans que rien ne le dise.
    parPage.push(
      contenu.items
        .map((i) => ('str' in i ? i.str + (i.hasEOL ? '\n' : '') : ''))
        .join('')
    );
  }
  const pages = doc.numPages;
  await fermerPdf(doc);
  return { texte: parPage.join('\n\n'), pages, parPage };
}

/** Les numéros des pages SANS texte lisible — celles qu'il faut montrer en image. */
export function pagesSansTexte(parPage: readonly string[]): number[] {
  const sans: number[] = [];
  for (let i = 0; i < parPage.length; i++) {
    if ((parPage[i] ?? '').trim() === '') sans.push(i + 1);
  }
  return sans;
}

/**
 * Le texte réduit à ce qui se compare : minuscules, sans accents, espaces
 * normalisés.
 *
 * ⚠️ LES ESPACES D'UN PDF NE SONT PAS DES ESPACES ORDINAIRES. L'extraction rend
 * des espaces insécables (` `) et des espaces fines insécables (` `),
 * précisément là où le français les met : dans les milliers d'un montant et
 * devant les deux-points. Les oublier ferait manquer « 10 000 € » — soit le cas
 * le plus courant.
 */
function normaliser(texte: string): string {
  return texte
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[\u00a0\u202f\u2009]/g, ' ')
    .replace(/\s+/g, ' ');
}

/**
 * Un montant en euros écrit EN CHIFFRES, cherché après une ancre.
 *
 * ⚠️ « MILLE EUROS » RESTE `null`, DÉLIBÉRÉMENT. Les statuts écrivent presque
 * toujours le capital deux fois — « la somme de MILLE EUROS (1 000 €) » — et
 * c'est la forme chiffrée qu'on lit. Quand elle manque, rendre `null` est la
 * seule réponse honnête : convertir des lettres en nombre est un pari, et ce
 * pari-ci alimenterait une attestation.
 *
 * La fenêtre de 160 caractères après l'ancre évite d'attraper le montant d'un
 * autre article — un apport, une prime — situé plus loin dans le document.
 */
function montantApres(reduit: string, ancre: RegExp): number | null {
  const m = ancre.exec(reduit);
  if (!m) return null;

  const fenetre = reduit.slice(m.index, m.index + 160);
  // Séparateurs de milliers : espace, point, apostrophe. Décimale : la virgule.
  const montant = /(\d[\d .']*(?:,\d{1,2})?)\s*(?:euros?|eur\b|€)/.exec(fenetre);
  if (!montant?.[1]) return null;

  const brut = montant[1].replace(/[ .']/g, '').replace(',', '.');
  const valeur = Number.parseFloat(brut);
  return Number.isFinite(valeur) && valeur > 0 ? valeur : null;
}

const FORMES: [RegExp, string][] = [
  [/societe civile immobiliere|\bsci\b/, 'SCI'],
  [/societe a responsabilite limitee/, 'SARL'],
  [/entreprise unipersonnelle a responsabilite limitee|\beurl\b/, 'EURL'],
  [/societe par actions simplifiee unipersonnelle|\bsasu\b/, 'SASU'],
  [/societe par actions simplifiee|\bsas\b/, 'SAS'],
  [/societe anonyme\b/, 'SA'],
  [/societe civile de moyens|\bscm\b/, 'SCM'],
  [/societe civile professionnelle|\bscp\b/, 'SCP'],
  [/societe en nom collectif|\bsnc\b/, 'SNC'],
  [/societe civile\b/, 'Societe civile'],
];

const MOIS: Record<string, string> = {
  janvier: '01', fevrier: '02', mars: '03', avril: '04', mai: '05', juin: '06',
  juillet: '07', aout: '08', septembre: '09', octobre: '10', novembre: '11', decembre: '12',
};

/**
 * La dénomination, cherchée dans le texte D'ORIGINE et non dans le réduit.
 *
 * DEUX RAISONS, et la seconde est un défaut constaté :
 *
 *   · la casse est l'information. Le réduit rendrait « sci du pont neuf » là où
 *     le document écrit « SCI DU PONT NEUF » ;
 *   · ⚠️ UN PDF N'A PAS DE FIN DE LIGNE. L'extraction joint les lignes par une
 *     espace : « Denomination sociale : SCI DU PONT NEUF » suivi de « Le capital
 *     social… » devient une seule phrase. Un motif borné au retour chariot n'y
 *     borne rien, et la première version rendait bel et bien « sci du pont neuf
 *     le capital social ». Constaté sur un PDF réel, pas supposé.
 *
 * D'où la coupure sur le mot qui OUVRE la clause suivante. On n'accepte par
 * ailleurs que la forme explicitement étiquetée : « la societe X » se rencontre
 * partout dans un statut, y compris pour désigner une banque ou un notaire.
 */
function denominationDe(texte: string): string | null {
  const m = /d[ée]nomination(?:\s+sociale)?\s*:?\s*["«“]?\s*([^\n."»”]{2,80})/i.exec(texte);
  if (!m?.[1]) return null;

  let valeur = m[1].trim();
  const suite =
    /\b(?:le\s+capital|capital|si[èe]ge|objet|dur[ée]e|forme\s+|article|la\s+soci[ée]t[ée]|est\s+|sera\s+)/i.exec(
      valeur
    );
  if (suite && suite.index > 1) valeur = valeur.slice(0, suite.index);

  valeur = valeur.replace(/[,;:\s]+$/, '').trim();
  return valeur.length >= 2 && valeur.length <= 60 ? valeur : null;
}

/**
 * Les repères mécaniques d'un texte de statuts.
 *
 * Fonction PURE : elle ne connaît ni PDF, ni réseau, ni base. C'est ce qui la
 * rend testable sur des extraits en dur, et c'est la raison de sa séparation
 * d'avec `extraireTexte`.
 */
export function reperes(texte: string): Reperes {
  const reduit = normaliser(texte);

  // ---- Forme juridique ----------------------------------------------------
  const forme = FORMES.find(([motif]) => motif.test(reduit))?.[1] ?? null;

  const denomination = denominationDe(texte);

  // ---- Capital ------------------------------------------------------------
  const capitalSocial =
    montantApres(reduit, /capital social/) ?? montantApres(reduit, /\bcapital\b/);

  // ---- Durée --------------------------------------------------------------
  // Bornée à 99 ans, le maximum légal : au-delà, on a lu autre chose.
  let dureeAns: number | null = null;
  const duree = /duree(?: de la societe)?[^.]{0,80}?(\d{1,3})\s*(?:annees?|ans)\b/.exec(reduit);
  if (duree?.[1]) {
    const n = Number.parseInt(duree[1], 10);
    if (n > 0 && n <= 99) dureeAns = n;
  }

  // ---- Clôture de l'exercice ---------------------------------------------
  //
  // ⚠️ L'ANCRE EST LE VERBE DE CLÔTURE, PAS LE MOT « EXERCICE ». La formulation
  // la plus répandue nomme les DEUX dates dans la même phrase — « commence le
  // 1er janvier et se termine le 31 décembre ». Ancrer sur « exercice » y
  // attrape la première, c'est-à-dire l'OUVERTURE, et un champ nommé `cloture`
  // annoncerait alors le 1er janvier. Personne ne le vérifierait : la valeur est
  // plausible, et c'est ce qui la rend dangereuse.
  const CLOTURE = '(?:se termine|se termin[a-z]*|est clos[a-z]*|sera clos[a-z]*|prend fin|cloture[a-z]*|clot)';
  const mois = Object.keys(MOIS).join('|');

  let cloture: string | null = null;
  const enLettres = new RegExp(`${CLOTURE}[^.]{0,60}?(\\d{1,2})\\s*(?:er)?\\s*(${mois})`).exec(
    reduit
  );
  if (enLettres?.[1] && enLettres[2]) {
    cloture = `${enLettres[1].padStart(2, '0')}/${MOIS[enLettres[2]]}`;
  } else {
    const enChiffres = new RegExp(
      `${CLOTURE}[^.]{0,60}?(\\d{1,2})\\s*/\\s*(\\d{1,2})\\b`
    ).exec(reduit);
    if (enChiffres?.[1] && enChiffres[2]) {
      const jour = Number.parseInt(enChiffres[1], 10);
      const numeroMois = Number.parseInt(enChiffres[2], 10);
      if (jour >= 1 && jour <= 31 && numeroMois >= 1 && numeroMois <= 12) {
        cloture = `${String(jour).padStart(2, '0')}/${String(numeroMois).padStart(2, '0')}`;
      }
    }
  }

  return { denomination, forme, capitalSocial, dureeAns, cloture };
}
