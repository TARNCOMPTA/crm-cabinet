import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { supabase } from './supabase';
import { fetchContactsForClient } from './contactsDirectoryService';
import { fetchMeetingNotes } from './meetingNotesService';
import { listAttachments, STATUS_LABELS as REVENUE_STATUS_LABELS } from './revenueDeclarationService';

/**
 * Les lignes de l'export, taillees sur les `select` de la page precedente.
 *
 * `sanitize()` et `formatDate()` acceptent deja `null` : les colonnes nullables
 * sont donc declarees telles quelles, sans repli force. Le nombre est laisse en
 * `number | string | null` la ou la colonne est `numeric` — Supabase la rend en
 * chaine, et le code fait deja `Number(...)`.
 */
interface LigneCollaborateur {
  role: string | null;
  created_at: string | null;
  user: { prenom: string | null; nom: string | null; email: string | null; job_role: string | null } | null;
}
interface LigneDirigeant {
  role: string | null;
  start_date: string | null;
  end_date: string | null;
  company_officers: {
    first_name: string | null; last_name: string | null;
    denomination: string | null; person_type: string | null;
  } | null;
}
interface LigneDepot {
  date_cloture: string | null; date_parution: string | null;
  type_depot: string | null; tribunal: string | null; numero_annonce: number | null;
}
interface LigneActe {
  act_type: string | null; act_date: string | null; act_category: string | null;
  deposit_date: string | null; inpi_reference: string | null;
}
interface LigneDeclarationRevenus {
  id: string; annee: number | string | null; person_name: string | null;
  statut: string | null; commentaire: string | null;
}
interface LigneRelance {
  numero_facture: string | null; libelle: string | null;
  montant: number | string | null; montant_regle: number | string | null;
  date_facture: string | null; date_echeance: string | null; statut: string | null;
  nombre_relances: number | null; derniere_relance: string | null;
  mode_reglement: string | null; date_reglement: string | null;
}
interface LigneArd {
  annee: number | string | null; ca: number | string | null;
  charges_totales: number | string | null; frais_compta: number | string | null;
  adhesion_cga: number | string | null; cfe: number | string | null;
  autres_charges: number | string | null;
}

const MONTHS_FR = [
  'Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin',
  'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre',
];

/**
 * La charte du cabinet, telle que l'application la porte.
 * ---------------------------------------------------------------------------
 * ⚠️ CE DOCUMENT ETAIT LE DERNIER ENDROIT TURQUOISE DU PRODUIT. `tokens.css`
 * pose `--teal: #7c2d5e` — un BORDEAUX, le nom de variable etant un vestige
 * assume d'une charte anterieure. Ce fichier, lui, codait en dur le vrai
 * turquoise #0d9488 : la fiche imprimee ne ressemblait plus a l'ecran dont elle
 * sort, ni au reste de ce qui porte le nom du cabinet.
 */
const ACCENT: [number, number, number] = [124, 45, 94];
/** L'accent eclairci, pour les aplats de tableau. */
const ACCENT_PALE: [number, number, number] = [247, 240, 243];
const ENCRE: [number, number, number] = [42, 36, 40];
const ENCRE_DOUCE: [number, number, number] = [110, 100, 106];
const FILET: [number, number, number] = [228, 222, 225];

/*
 * ⚠️ UN SEUL SIGNE POUR L'ABSENCE, DANS TOUT LE DOCUMENT. Le document melait
 * « - » (les formateurs de dates) et « — » (ceux de montants) selon la
 * fonction qui rendait la valeur : deux signes pour la meme chose, sur la meme
 * page. Et le trait d'union se lit comme une valeur tronquee, la ou le cadratin
 * se lit « rien a dire ». Tout passe par cette constante, ce qui rend le
 * prochain ecart visible au grep.
 */
const ABSENT = '—';

/**
 * Un montant en euros, ecrit comme on l'ecrit en France.
 *
 * ⚠️ « 50000 EUR » N'EST PAS UN MONTANT LISIBLE. Sur un document qui sort d'un
 * cabinet comptable, l'absence de separateur de milliers fait compter les
 * zeros ; « EUR » a la place de « € » fait pense-bete d'export de tableur. Deux
 * details, mais ce sont exactement ceux qu'un client remarque.
 */
function formaterEuros(valeur: number | string | null | undefined): string {
  if (valeur === null || valeur === undefined || valeur === '') return ABSENT;
  const n = Number(valeur);
  if (!Number.isFinite(n)) return ABSENT;
  /*
   * ⚠️ LES ESPACES FINES INSECABLES SONT REMPLACEES, ET C'EST INDISPENSABLE.
   * `toLocaleString('fr-FR')` separe les milliers par U+202F et precede l'euro
   * du meme caractere. L'encodage WinAnsi des polices standard de jsPDF ne le
   * connait pas : « 50 000,00 € » sortait imprime « 5 0 / 0 0 0 , 0 0  € »,
   * lettre par lettre. Trouve en REGARDANT le PDF, pas en relisant le code —
   * rien dans le typage ni dans les tests ne pouvait le signaler.
   */
  return n
    .toLocaleString('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 2 })
    .replace(/[\u202f\u00a0\u2009]/g, ' ');
}

/** Premiere lettre en capitale — pour `actif`, `prospect`, `archive`. */
function capitaliser(v: string | null | undefined): string {
  if (!v) return ABSENT;
  return v.charAt(0).toUpperCase() + v.slice(1);
}

function formatDate(d: string | null | undefined): string {
  if (!d) return ABSENT;
  try {
    return new Date(d).toLocaleDateString('fr-FR');
  } catch {
    return ABSENT;
  }
}

function formatDateTime(d: string | null | undefined): string {
  if (!d) return ABSENT;
  try {
    return new Date(d).toLocaleString('fr-FR');
  } catch {
    return ABSENT;
  }
}

function formatClosingMonthFromDate(dateString: string | null | undefined): string {
  if (!dateString) return ABSENT;
  const date = new Date(dateString);
  if (isNaN(date.getTime())) return ABSENT;
  return MONTHS_FR[date.getMonth()];
}

function formatClosingMonthFromDdMm(ddmm: string | null | undefined): string {
  if (!ddmm || ddmm.length < 4) return ABSENT;
  const idx = parseInt(ddmm.substring(2, 4), 10) - 1;
  if (idx < 0 || idx > 11) return ABSENT;
  return MONTHS_FR[idx];
}

function stripHtml(html: string | null | undefined): string {
  if (!html) return '';
  return html
    .replace(/<\s*br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|li|h[1-6])>/gi, '\n')
    .replace(/<li[^>]*>/gi, '- ')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** Ce qu'on imprime pour une valeur absente — voir `ABSENT`. */
function sanitize(value: string | null | undefined): string {
  if (value === null || value === undefined || value === '') return ABSENT;
  return String(value);
}

interface SectionCursor {
  doc: jsPDF;
  y: number;
  pageWidth: number;
  marginX: number;
  maxWidth: number;
  /**
   * Les sections sans aucune ligne, retenues plutot qu'imprimees.
   *
   * ⚠️ HUIT SECTIONS VIDES D'AFFILEE REMPLISSAIENT UNE PAGE ENTIERE. Chacune
   * avait son titre en 13 pt, son marqueur colore et son « Aucune donnee » :
   * le document consacrait plus de place a annoncer l'absence qu'a presenter
   * la donnee, et c'est ce qui le faisait tenir en deux pages la ou une
   * suffit. Elles sont maintenant nommees en UNE ligne, a la fin.
   *
   * ⚠️ ELLES NE SONT PAS TAISSUES POUR AUTANT. « Ce dossier n'a pas de
   * dirigeant enregistre » est une information : la faire disparaitre
   * laisserait croire que la rubrique n'existe pas, ce qui est la confusion
   * que ce depot refuse partout ailleurs entre « absent » et « pas su ».
   */
  vides: string[];
}

function ensureSpace(cursor: SectionCursor, needed: number) {
  const pageHeight = cursor.doc.internal.pageSize.getHeight();
  if (cursor.y + needed > pageHeight - 18) {
    cursor.doc.addPage();
    cursor.y = 20;
  }
}

/**
 * Un titre de section : petites capitales sur un filet pleine largeur.
 *
 * ⚠️ PLUS DE PAVE COLORE NI DE 13 PT. L'ancien titre pesait autant que le nom
 * du client : sur douze sections, douze elements criaient aussi fort que
 * l'unique information que le lecteur cherche. Le filet separe sans hurler, et
 * l'espace au-dessus fait le travail que la couleur faisait mal.
 */
function drawSectionTitle(cursor: SectionCursor, title: string) {
  ensureSpace(cursor, 14);
  cursor.y += 3;
  cursor.doc.setTextColor(...ACCENT);
  cursor.doc.setFont('helvetica', 'bold');
  cursor.doc.setFontSize(9.5);
  cursor.doc.text(title.toUpperCase(), cursor.marginX, cursor.y);
  cursor.y += 2;
  cursor.doc.setDrawColor(...ACCENT);
  cursor.doc.setLineWidth(0.4);
  cursor.doc.line(cursor.marginX, cursor.y, cursor.pageWidth - cursor.marginX, cursor.y);
  cursor.y += 5;
  cursor.doc.setTextColor(...ENCRE);
  cursor.doc.setFont('helvetica', 'normal');
  cursor.doc.setFontSize(10);
}

/**
 * Les couples etiquette / valeur, sur DEUX colonnes.
 *
 * ⚠️ UNE COLONNE LAISSAIT LA MOITIE DROITE DE LA PAGE VIDE SUR TOUTE SA
 * HAUTEUR. Treize lignes d'identite occupaient 40 % de la largeur et
 * repoussaient le reste sur une seconde page — pour un document qui tient
 * largement en une. Deux colonnes n'est pas une coquetterie de mise en page :
 * c'est une page de moins a imprimer, par fiche et par client.
 *
 * ⚠️ LE REMPLISSAGE EST EN COLONNES, PAS EN LIGNES. On lit une fiche de haut
 * en bas ; alterner gauche-droite ferait sauter l'oeil et melerait l'identite
 * legale aux coordonnees.
 */
function drawKeyValueGrid(cursor: SectionCursor, rows: Array<[string, string]>) {
  if (rows.length === 0) return;

  const moitie = Math.ceil(rows.length / 2);
  const gauche = rows.slice(0, moitie);
  const droite = rows.slice(moitie);
  const corps: string[][] = [];
  for (let i = 0; i < moitie; i++) {
    const g = gauche[i] ?? ['', ''];
    const d = droite[i] ?? ['', ''];
    corps.push([g[0], g[1], d[0], d[1]]);
  }

  const colonne = (cursor.maxWidth - 6) / 2;
  autoTable(cursor.doc, {
    startY: cursor.y,
    body: corps,
    theme: 'plain',
    styles: { fontSize: 8.5, cellPadding: { top: 1.1, bottom: 1.1, left: 0, right: 2 }, textColor: ENCRE, valign: 'top' },
    columnStyles: {
      0: { cellWidth: colonne * 0.44, textColor: ENCRE_DOUCE },
      1: { cellWidth: colonne * 0.56, fontStyle: 'bold' },
      2: { cellWidth: colonne * 0.44, textColor: ENCRE_DOUCE },
      3: { cellWidth: colonne * 0.56, fontStyle: 'bold' },
    },
    margin: { left: cursor.marginX, right: cursor.marginX },
  });
  // @ts-expect-error - lastAutoTable is attached by plugin
  cursor.y = cursor.doc.lastAutoTable.finalY + 3;
}

function drawParagraph(cursor: SectionCursor, text: string) {
  const lines = cursor.doc.splitTextToSize(text, cursor.maxWidth);
  const lineHeight = 4.5;
  for (const line of lines) {
    ensureSpace(cursor, lineHeight);
    cursor.doc.text(line, cursor.marginX, cursor.y);
    cursor.y += lineHeight;
  }
}

/**
 * Une section en tableau : titre ET contenu, ou RIEN et le nom retenu.
 *
 * ⚠️ LE TITRE N'EST PLUS ECRIT AVANT DE SAVOIR S'IL Y A QUELQUE CHOSE DESSOUS.
 * C'est tout le changement : l'ancien code posait le titre, puis decouvrait le
 * vide et ecrivait « Aucune donnee ». Ici le nom part dans `cursor.vides`, qui
 * se resume en une ligne a la fin du document.
 */
function drawTableSection(
  cursor: SectionCursor,
  titre: string,
  head: string[],
  body: string[][]
) {
  if (body.length === 0) {
    cursor.vides.push(titre);
    return;
  }
  drawSectionTitle(cursor, titre);
  autoTable(cursor.doc, {
    startY: cursor.y,
    head: [head],
    body,
    theme: 'plain',
    headStyles: {
      fillColor: ACCENT_PALE,
      textColor: ACCENT,
      fontSize: 8,
      fontStyle: 'bold',
      cellPadding: { top: 1.8, bottom: 1.8, left: 2, right: 2 },
    },
    bodyStyles: {
      fontSize: 8.5,
      textColor: ENCRE,
      cellPadding: { top: 1.6, bottom: 1.6, left: 2, right: 2 },
    },
    // Un filet horizontal plutot qu'une ligne sur deux coloree : les zebrures
    // font tableur, le filet fait document.
    didDrawCell: (donnees) => {
      if (donnees.section !== 'body') return;
      const d = donnees.doc as jsPDF;
      d.setDrawColor(...FILET);
      d.setLineWidth(0.1);
      d.line(donnees.cell.x, donnees.cell.y + donnees.cell.height,
             donnees.cell.x + donnees.cell.width, donnees.cell.y + donnees.cell.height);
    },
    margin: { left: cursor.marginX, right: cursor.marginX },
  });
  // @ts-expect-error - lastAutoTable is attached by plugin
  cursor.y = cursor.doc.lastAutoTable.finalY + 5;
}

/**
 * La mention finale des rubriques sans contenu.
 *
 * ⚠️ ELLE EXISTE POUR NE PAS MENTIR PAR OMISSION. Supprimer purement les
 * sections vides laisserait croire au lecteur que le CRM ne porte pas ces
 * rubriques, alors qu'elles sont la et qu'elles sont vides pour ce client-ci.
 * Une ligne suffit a le dire ; huit blocs de titre ne le disaient pas mieux.
 */
function drawRubriquesVides(cursor: SectionCursor) {
  if (cursor.vides.length === 0) return;
  ensureSpace(cursor, 16);
  cursor.y += 4;
  cursor.doc.setDrawColor(...FILET);
  cursor.doc.setLineWidth(0.3);
  cursor.doc.line(cursor.marginX, cursor.y, cursor.pageWidth - cursor.marginX, cursor.y);
  cursor.y += 5;
  cursor.doc.setFont('helvetica', 'bold');
  cursor.doc.setFontSize(8);
  cursor.doc.setTextColor(...ENCRE_DOUCE);
  cursor.doc.text('Rubriques sans donnée pour ce dossier', cursor.marginX, cursor.y);
  cursor.y += 4;
  cursor.doc.setFont('helvetica', 'normal');
  const lignes = cursor.doc.splitTextToSize(cursor.vides.join(' · '), cursor.maxWidth);
  for (const l of lignes) {
    ensureSpace(cursor, 4);
    cursor.doc.text(l, cursor.marginX, cursor.y);
    cursor.y += 4;
  }
  cursor.doc.setTextColor(...ENCRE);
}

function addHeaderFooter(doc: jsPDF, cabinetName: string, clientName: string) {
  const pageCount = doc.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    const pw = doc.internal.pageSize.getWidth();
    const ph = doc.internal.pageSize.getHeight();

    doc.setFontSize(8);
    doc.setTextColor(156, 163, 175);
    doc.setFont('helvetica', 'normal');
    if (i > 1) {
      doc.text(cabinetName, 15, 10);
      doc.text(clientName, pw - 15, 10, { align: 'right' });
      doc.setDrawColor(229, 231, 235);
      doc.line(15, 12, pw - 15, 12);
    }
    // « 1 / 2 » suffit : le mot « Page » repete a chaque bas de feuille
    // n'apprend rien a personne.
    doc.text(`${i} / ${pageCount}`, pw / 2, ph - 8, { align: 'center' });
    doc.setTextColor(...ENCRE);
  }
}

export interface ExportClientToPdfOptions {
  clientId: string;
}

export async function exportClientToPdf({
  clientId,
}: ExportClientToPdfOptions): Promise<void> {
  const [
    clientRes,
    cabinetRes,
    collabRes,
    rolesRes,
    regimesRes,
    depotsRes,
    officersRes,
    legalActsRes,
    revenueDeclRes,
    relancesRes,
    meetingNotes,
    ardRes,
  ] = await Promise.all([
    supabase.from('clients').select('*').eq('id', clientId).maybeSingle(),
    supabase.from('cabinets').select('nom, adresse, siret, email, telephone').order('created_at').limit(1).maybeSingle(),
    supabase
      .from('client_collaborators')
      .select('id, role, created_at, user_id, user:profiles(prenom, nom, email, job_role)')
      .eq('client_id', clientId),
    supabase.from('cabinet_collaborator_roles').select('key, label'),
    supabase.from('regimes_fiscaux').select('value, label'),
    supabase
      .from('bodacc_depot_comptes')
      .select('date_cloture, date_parution, type_depot, tribunal, numero_annonce')
      .eq('client_id', clientId)
      .order('date_cloture', { ascending: false }),
    supabase
      .from('officer_companies')
      .select('role, start_date, end_date, company_officers(first_name, last_name, denomination, person_type)')
      .eq('client_id', clientId)
      .order('start_date', { ascending: false }),
    supabase
      .from('legal_acts')
      .select('act_type, act_date, act_category, deposit_date, inpi_reference')
      .eq('client_id', clientId)
      .order('act_date', { ascending: false })
      .limit(50),
    supabase
      .from('revenue_declarations')
      .select('id, annee, person_name, statut, commentaire')
      .eq('client_id', clientId)
      .order('annee', { ascending: false }),
    supabase
      .from('relance_invoices')
      .select('numero_facture, libelle, montant, montant_regle, date_facture, date_echeance, statut, nombre_relances, derniere_relance, mode_reglement, date_reglement')
      .eq('client_id', clientId)
      .order('date_facture', { ascending: false }),
    fetchMeetingNotes(clientId).catch(() => []),
    supabase
      .from('client_ard_calculations')
      .select('annee, ca, charges_totales, frais_compta, adhesion_cga, cfe, autres_charges')
      .eq('client_id', clientId)
      .order('annee', { ascending: true }),
  ]);

  if (clientRes.error) throw clientRes.error;
  const client = clientRes.data;
  if (!client) throw new Error('Client introuvable');

  const cabinet = cabinetRes.data ?? { nom: 'Cabinet', adresse: '', siret: '', email: '', telephone: '' };

  const directoryContacts = await fetchContactsForClient(client.siren, client.siret).catch(() => ({
    companyId: null,
    contacts: [],
  }));

  const roleMap = new Map<string, string>();
  for (const r of rolesRes.data ?? []) {
    roleMap.set((r as { key: string }).key, (r as { label: string }).label);
  }

  /*
   * Le libelle du regime fiscal, tel que le cabinet l'a defini.
   *
   * ⚠️ ON NE RECONSTITUE PAS « IS_REEL » EN « IS réel ». Une regle de decodage
   * devinerait l'accent, la casse et les abreviations ; elle donnerait
   * « Is reel » ou « IS reel » selon l'humeur, et se tromperait des qu'un
   * cabinet nommera un regime autrement. La table `regimes_fiscaux` porte le
   * libelle : on le lit. Si le code n'y figure pas, on imprime le code brut —
   * visiblement technique, donc signalant qu'il manque quelque chose.
   */
  const regimeMap = new Map<string, string>();
  for (const r of regimesRes.data ?? []) {
    regimeMap.set((r as { value: string }).value, (r as { label: string }).label);
  }

  const attachmentsByDeclaration = new Map<string, string[]>();
  for (const decl of revenueDeclRes.data ?? []) {
    const d = decl as { id: string };
    try {
      const atts = await listAttachments(d.id);
      attachmentsByDeclaration.set(d.id, atts.map((a) => a.file_name));
    } catch {
      attachmentsByDeclaration.set(d.id, []);
    }
  }

  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const marginX = 15;
  const cursor: SectionCursor = {
    doc,
    y: 20,
    pageWidth,
    marginX,
    maxWidth: pageWidth - marginX * 2,
    vides: [],
  };

  /*
   * L'EN-TETE.
   *
   * ⚠️ LE CLIENT EST LE TITRE, PAS « FICHE CLIENT ». L'ancien en-tete donnait
   * 22 pt a la mention generique et laissait le nom du dossier plus bas, plus
   * petit : le lecteur qui prend la feuille sur une pile cherchait de quel
   * client il s'agit, et l'oeil tombait sur ce qu'il savait deja.
   *
   * ⚠️ ET IL PREND 26 mm, PAS 45. Le bandeau occupait un sixieme de la page
   * pour trois lignes de coordonnees. Un cartouche fin suffit a signer le
   * document ; le reste de la hauteur revient a la donnee.
   */
  doc.setFillColor(...ACCENT);
  doc.rect(0, 0, pageWidth, 26, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.text(cabinet.nom || 'Cabinet', marginX, 11);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  const enTete = [cabinet.adresse, cabinet.telephone, cabinet.email].filter(Boolean).join('   ·   ');
  if (enTete) doc.text(enTete, marginX, 17);
  doc.setFontSize(8);
  doc.text('FICHE CLIENT', pageWidth - marginX, 11, { align: 'right' });
  // La date d'edition appartient a l'en-tete : c'est une propriete du tirage,
  // pas du client. A la minute — la seconde ne renseigne personne.
  doc.text(
    `Éditée le ${formatDateTime(new Date().toISOString()).replace(/:\d{2}$/, '')}`,
    pageWidth - marginX,
    17,
    { align: 'right' }
  );

  cursor.y = 42;
  doc.setTextColor(...ENCRE);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(19);
  const nameLines = doc.splitTextToSize(client.nom_entreprise || 'Client', cursor.maxWidth);
  for (const line of nameLines) {
    doc.text(line, marginX, cursor.y);
    cursor.y += 8;
  }

  /*
   * Les trois reperes du dossier, en pastilles.
   *
   * Numero, SIREN, statut : ce qu'on cite au telephone. Les separer par des
   * pastilles plutot que par des tirets leur donne le statut d'etiquettes,
   * qu'ils ont — et evite la ligne grise indifferenciee d'avant.
   *
   * Les trois reparaissent plus bas dans les rubriques, et c'est voulu : le
   * bandeau se lit d'un coup d'oeil, le tableau se lit ligne a ligne. Retirer
   * « SIREN » de la rubrique Identite ferait chercher ailleurs quelqu'un qui
   * la parcourt dans l'ordre.
   */
  cursor.y += 1;
  let px = marginX;
  doc.setFontSize(8);
  for (const [etiquette, valeur] of [
    ['Dossier', client.numero_dossier],
    ['SIREN', client.siren],
    ['Statut', client.statut ? capitaliser(client.statut) : null],
  ] as Array<[string, string | null]>) {
    if (!valeur) continue;
    const texte = `${etiquette} ${valeur}`;
    const largeur = doc.getTextWidth(texte) + 6;
    doc.setFillColor(...ACCENT_PALE);
    doc.roundedRect(px, cursor.y - 3.4, largeur, 5.6, 1.2, 1.2, 'F');
    doc.setTextColor(...ACCENT);
    doc.text(texte, px + 3, cursor.y);
    px += largeur + 3;
  }
  cursor.y += 9;
  doc.setTextColor(...ENCRE);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);

  drawSectionTitle(cursor, 'Identité');
  drawKeyValueGrid(cursor, [
    ['Raison sociale', sanitize(client.nom_entreprise)],
    // Le type de personne d'abord : il explique pourquoi les lignes suivantes
    // portent un nom et un prenom plutot qu'une raison sociale.
    ['Type', client.type_personne === 'physique' ? 'Personne physique' : client.type_personne === 'morale' ? 'Personne morale' : ABSENT],
    ['Nom commercial', sanitize(client.nom_commercial)],
    ['Numéro de dossier', sanitize(client.numero_dossier)],
    ['Forme juridique', sanitize(client.forme_juridique)],
    ['SIREN', sanitize(client.siren)],
    ['SIRET', sanitize(client.siret)],
    ['Numéro de TVA', sanitize(client.tva_intracom)],
    ['Code APE', sanitize(client.code_ape)],
    ['Capital social', formaterEuros(client.capital_social)],
    ['Dirigeant', sanitize(client.dirigeant)],
    ['Date de création', formatDate(client.date_creation_entreprise)],
    ['Dossier LMNP', client.is_lmnp ? 'Oui' : 'Non'],
  ]);

  drawSectionTitle(cursor, 'Adresse et contact');
  drawKeyValueGrid(cursor, [
    // Une cellule par composant : c'est ce qu'on recopie sur une enveloppe.
    // Repli sur la chaine heritee si le decoupage n'a pas eu lieu — six fiches
    // sur 649 sont dans ce cas, et leur adresse doit quand meme s'imprimer.
    ['Adresse', sanitize(client.adresse_ligne1 || client.adresse)],
    ['Complément', sanitize(client.adresse_complement)],
    ['Code postal / Ville', sanitize([client.code_postal, client.ville].filter(Boolean).join(' '))],
    // Le pays n'apparait que s'il n'est pas la France : l'implicite d'un cabinet
    // francais n'a pas besoin d'etre imprime.
    ...(client.pays && client.pays.toUpperCase() !== 'FRANCE'
      ? [['Pays', sanitize(client.pays)] as [string, string]]
      : []),
    ['Email', sanitize(client.email)],
    ['Email 2', sanitize(client.email_2)],
    ['Téléphone', sanitize(client.telephone)],
    ['Téléphone 2', sanitize(client.telephone_2)],
    ['Contact principal', sanitize(client.contact_principal)],
  ]);

  drawSectionTitle(cursor, 'Comptabilité et fiscalité');
  drawKeyValueGrid(cursor, [
    ['Mois de clôture', formatClosingMonthFromDate(client.date_cloture)],
    ['Clôture exercice social', formatClosingMonthFromDdMm(client.date_cloture_exercice_social)],
    ['Première clôture', formatDate(client.date_premiere_cloture)],
    // `IS_REEL` est un code technique : le lecteur d'une fiche imprimee
    // n'a pas a le decoder.
    ['Régime fiscal', (client.regime_fiscal && regimeMap.get(client.regime_fiscal)) || sanitize(client.regime_fiscal)],
    ['Statut', capitaliser(client.statut)],
    ['Entrée au cabinet', formatDate(client.date_entree_cabinet)],
    ['Sortie du cabinet', formatDate(client.date_sortie_cabinet)],
    /*
     * ⚠️ PAS DE LIGNE « IMPÔTS SUIVIS » ICI, ET CE N'EST PAS UN OUBLI. Elle
     * existait, alimentee par une liste codee vide depuis le retrait du module
     * d'echeances fiscales (les tables `fiscal_tax_types` et
     * `client_fiscal_tax_types` n'existent plus). Elle imprimait donc « — » sur
     * chaque fiche, ce qui se lit « le cabinet ne suit aucun impot pour ce
     * client » alors que la verite est « le produit ne sait plus le dire ».
     * Une rubrique qui ne peut jamais rien porter ment a chaque impression.
     */
  ]);
  if (client.description_activite) {
    ensureSpace(cursor, 6);
    cursor.doc.setFont('helvetica', 'bold');
    cursor.doc.setFontSize(9);
    cursor.doc.setTextColor(107, 114, 128);
    cursor.doc.text('Description de l\'activité', marginX, cursor.y);
    cursor.y += 4;
    cursor.doc.setFont('helvetica', 'normal');
    cursor.doc.setFontSize(9);
    cursor.doc.setTextColor(...ENCRE);
    drawParagraph(cursor, client.description_activite);
    cursor.y += 2;
  }

  const collabRows = (collabRes.data ?? []).map((c: LigneCollaborateur) => {
    const user = c.user;
    const fullName = user ? `${user.prenom ?? ''} ${user.nom ?? ''}`.trim() : ABSENT;
    const roleLabel = (c.role ? roleMap.get(c.role) : null) || c.role || '—';
    return [
      fullName || ABSENT,
      sanitize(user?.job_role),
      sanitize(user?.email),
      roleLabel,
      formatDate(c.created_at),
    ];
  });
  drawTableSection(cursor, 'Collaborateurs assignés',
    ['Collaborateur', 'Fonction', 'Email', 'Rôle', 'Affecté le'], collabRows);

  const contactsRows = directoryContacts.contacts.map((c) => [
    `${c.lastName} ${c.firstName}`.trim() || ABSENT,
    sanitize(c.roleInCompany),
    sanitize(c.email),
    sanitize(c.phone || c.mobile),
    c.isPrimary ? 'Oui' : 'Non',
  ]);
  drawTableSection(cursor, 'Contacts annuaire',
    ['Contact', 'Fonction', 'Email', 'Téléphone', 'Principal'], contactsRows);

  const officerRows = (officersRes.data ?? []).map((o: LigneDirigeant) => {
    const off = o.company_officers;
    const name = off
      ? off.person_type === 'morale'
        ? off.denomination || off.last_name || ABSENT
        : `${off.last_name ?? ''} ${off.first_name ?? ''}`.trim() || ABSENT
      : ABSENT;
    return [
      name,
      sanitize(o.role),
      formatDate(o.start_date),
      formatDate(o.end_date),
    ];
  });
  drawTableSection(cursor, 'Dirigeants',
    ['Dirigeant', 'Qualité', 'Début', 'Fin'], officerRows);

  const depotRows = (depotsRes.data ?? []).map((d: LigneDepot) => [
    formatDate(d.date_cloture),
    sanitize(d.type_depot),
    formatDate(d.date_parution),
    sanitize(d.tribunal),
    d.numero_annonce != null ? String(d.numero_annonce) : ABSENT,
  ]);
  drawTableSection(cursor, 'Dépôts de comptes (BODACC)',
    ['Clôture', 'Type', 'Parution', 'Tribunal', 'Annonce'], depotRows);

  const actRows = (legalActsRes.data ?? []).map((a: LigneActe) => [
    formatDate(a.act_date),
    sanitize(a.act_type),
    sanitize(a.act_category),
    formatDate(a.deposit_date),
    sanitize(a.inpi_reference),
  ]);
  drawTableSection(cursor, 'Actes juridiques',
    ['Date', 'Type', 'Catégorie', 'Dépôt', 'Référence INPI'], actRows);

  const declRows: string[][] = [];
  for (const decl of (revenueDeclRes.data ?? []) as LigneDeclarationRevenus[]) {
    const atts = attachmentsByDeclaration.get(decl.id) ?? [];
    const attText = atts.length > 0 ? atts.join('\n') : ABSENT;
    declRows.push([
      String(decl.annee),
      sanitize(decl.person_name),
      REVENUE_STATUS_LABELS[decl.statut as keyof typeof REVENUE_STATUS_LABELS] || decl.statut || ABSENT,
      sanitize(decl.commentaire),
      attText,
    ]);
  }
  drawTableSection(cursor, 'Déclarations de revenus',
    ['Année', 'Personne', 'Statut', 'Commentaire', 'Pièces jointes'], declRows);

  const relanceRows = (relancesRes.data ?? []).map((r: LigneRelance) => [
    sanitize(r.numero_facture),
    sanitize(r.libelle),
    formatDate(r.date_facture),
    formatDate(r.date_echeance),
    formaterEuros(r.montant),
    formaterEuros(r.montant_regle),
    sanitize(r.statut),
    r.nombre_relances != null ? String(r.nombre_relances) : '0',
  ]);
  drawTableSection(
    cursor,
    'Relances',
    ['Facture', 'Libellé', 'Date', 'Échéance', 'Montant', 'Réglé', 'Statut', 'Relances'],
    relanceRows
  );

  /*
   * Les calculs ARD ne concernent que les dossiers LMNP : la section n'est
   * meme pas comptee parmi les rubriques vides pour les autres, ou elle n'a
   * aucun sens.
   */
  if (ardRes.data && ardRes.data.length > 0) {
    const ardRows = ardRes.data.map((a: LigneArd) => [
      String(a.annee),
      formaterEuros(a.ca),
      formaterEuros(a.charges_totales),
      formaterEuros(a.frais_compta),
      formaterEuros(a.adhesion_cga),
      formaterEuros(a.cfe),
      formaterEuros(a.autres_charges),
    ]);
    drawTableSection(
      cursor,
      'Calculs ARD (LMNP)',
      ['Année', 'CA', 'Charges', 'Frais compta', 'Adhésion CGA', 'CFE', 'Autres'],
      ardRows
    );
  }

  if (meetingNotes.length === 0) {
    cursor.vides.push('Comptes-rendus de réunion');
  } else {
    drawSectionTitle(cursor, 'Comptes-rendus de réunion');
    for (const note of meetingNotes) {
      ensureSpace(cursor, 22);
      cursor.doc.setFont('helvetica', 'bold');
      cursor.doc.setFontSize(10);
      cursor.doc.setTextColor(...ACCENT);
      const titleLines = cursor.doc.splitTextToSize(note.objet || 'Compte-rendu', cursor.maxWidth);
      for (const l of titleLines) {
        ensureSpace(cursor, 5);
        cursor.doc.text(l, marginX, cursor.y);
        cursor.y += 5;
      }
      cursor.doc.setTextColor(107, 114, 128);
      cursor.doc.setFont('helvetica', 'normal');
      cursor.doc.setFontSize(9);
      const metaParts: string[] = [formatDate(note.date_rdv)];
      if (note.type_rdv) metaParts.push(note.type_rdv);
      if (note.author) {
        const author = `${note.author.prenom ?? ''} ${note.author.nom ?? ''}`.trim();
        if (author) metaParts.push(`par ${author}`);
      }
      cursor.doc.text(metaParts.join('  -  '), marginX, cursor.y);
      cursor.y += 4;
      if (note.participants) {
        const partLines = cursor.doc.splitTextToSize(`Participants : ${note.participants}`, cursor.maxWidth);
        for (const pl of partLines) {
          ensureSpace(cursor, 4);
          cursor.doc.text(pl, marginX, cursor.y);
          cursor.y += 4;
        }
      }
      cursor.doc.setTextColor(...ENCRE);
      cursor.y += 1;
      const contenuText = stripHtml(note.contenu);
      if (contenuText) {
        drawParagraph(cursor, contenuText);
      }
      if (note.actions_a_suivre) {
        cursor.y += 1;
        cursor.doc.setFont('helvetica', 'bold');
        cursor.doc.setFontSize(9);
        ensureSpace(cursor, 5);
        cursor.doc.text('Actions à suivre :', marginX, cursor.y);
        cursor.y += 4;
        cursor.doc.setFont('helvetica', 'normal');
        drawParagraph(cursor, stripHtml(note.actions_a_suivre));
      }
      cursor.y += 4;
      cursor.doc.setDrawColor(229, 231, 235);
      cursor.doc.line(marginX, cursor.y, pageWidth - marginX, cursor.y);
      cursor.y += 4;
    }
  }

  drawRubriquesVides(cursor);

  addHeaderFooter(doc, cabinet.nom || 'Cabinet', client.nom_entreprise || 'Client');

  const datePart = new Date().toISOString().split('T')[0];
  const safeName = String(client.nom_entreprise || client.id)
    .replace(/[^a-zA-Z0-9_-]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 80);
  doc.save(`ficheclient_${safeName}_${datePart}.pdf`);
}
