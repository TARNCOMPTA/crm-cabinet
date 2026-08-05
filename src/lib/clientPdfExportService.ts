import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { supabase } from './supabase';
import { fetchContactsForClient } from './contactsDirectoryService';
import { fetchMeetingNotes } from './meetingNotesService';
import { listAttachments, STATUS_LABELS as REVENUE_STATUS_LABELS } from './revenueDeclarationService';

const MONTHS_FR = [
  'Janvier', 'Fevrier', 'Mars', 'Avril', 'Mai', 'Juin',
  'Juillet', 'Aout', 'Septembre', 'Octobre', 'Novembre', 'Decembre',
];

const TEAL: [number, number, number] = [13, 148, 136];
const DARK_GREY: [number, number, number] = [55, 65, 81];
const LIGHT_GREY: [number, number, number] = [243, 244, 246];

function formatDate(d: string | null | undefined): string {
  if (!d) return '-';
  try {
    return new Date(d).toLocaleDateString('fr-FR');
  } catch {
    return '-';
  }
}

function formatDateTime(d: string | null | undefined): string {
  if (!d) return '-';
  try {
    return new Date(d).toLocaleString('fr-FR');
  } catch {
    return '-';
  }
}

function formatClosingMonthFromDate(dateString: string | null | undefined): string {
  if (!dateString) return '-';
  const date = new Date(dateString);
  if (isNaN(date.getTime())) return '-';
  return MONTHS_FR[date.getMonth()];
}

function formatClosingMonthFromDdMm(ddmm: string | null | undefined): string {
  if (!ddmm || ddmm.length < 4) return '-';
  const idx = parseInt(ddmm.substring(2, 4), 10) - 1;
  if (idx < 0 || idx > 11) return '-';
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

function sanitize(value: string | null | undefined): string {
  if (value === null || value === undefined || value === '') return '-';
  return String(value);
}

interface SectionCursor {
  doc: jsPDF;
  y: number;
  pageWidth: number;
  marginX: number;
  maxWidth: number;
}

function ensureSpace(cursor: SectionCursor, needed: number) {
  const pageHeight = cursor.doc.internal.pageSize.getHeight();
  if (cursor.y + needed > pageHeight - 18) {
    cursor.doc.addPage();
    cursor.y = 20;
  }
}

function drawSectionTitle(cursor: SectionCursor, title: string) {
  ensureSpace(cursor, 16);
  cursor.doc.setFillColor(...TEAL);
  cursor.doc.rect(cursor.marginX, cursor.y, 3, 7, 'F');
  cursor.doc.setTextColor(...TEAL);
  cursor.doc.setFont('helvetica', 'bold');
  cursor.doc.setFontSize(13);
  cursor.doc.text(title, cursor.marginX + 6, cursor.y + 5.5);
  cursor.y += 10;
  cursor.doc.setTextColor(...DARK_GREY);
  cursor.doc.setFont('helvetica', 'normal');
  cursor.doc.setFontSize(10);
}

function drawKeyValueGrid(cursor: SectionCursor, rows: Array<[string, string]>) {
  if (rows.length === 0) return;
  autoTable(cursor.doc, {
    startY: cursor.y,
    body: rows.map(([k, v]) => [k, v]),
    theme: 'plain',
    styles: { fontSize: 9, cellPadding: 1.5, textColor: DARK_GREY, valign: 'top' },
    columnStyles: {
      0: { fontStyle: 'bold', cellWidth: 55, textColor: [107, 114, 128] },
      1: { cellWidth: 'auto' },
    },
    margin: { left: cursor.marginX, right: cursor.marginX },
  });
  // @ts-expect-error - lastAutoTable is attached by plugin
  cursor.y = cursor.doc.lastAutoTable.finalY + 4;
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

function drawEmpty(cursor: SectionCursor, msg: string) {
  ensureSpace(cursor, 6);
  cursor.doc.setTextColor(156, 163, 175);
  cursor.doc.setFont('helvetica', 'italic');
  cursor.doc.setFontSize(9);
  cursor.doc.text(msg, cursor.marginX, cursor.y);
  cursor.y += 6;
  cursor.doc.setTextColor(...DARK_GREY);
  cursor.doc.setFont('helvetica', 'normal');
  cursor.doc.setFontSize(10);
}

function drawTable(
  cursor: SectionCursor,
  head: string[],
  body: string[][]
) {
  if (body.length === 0) {
    drawEmpty(cursor, 'Aucune donnee');
    return;
  }
  autoTable(cursor.doc, {
    startY: cursor.y,
    head: [head],
    body,
    theme: 'striped',
    headStyles: { fillColor: TEAL, textColor: [255, 255, 255], fontSize: 9, fontStyle: 'bold' },
    bodyStyles: { fontSize: 9, textColor: DARK_GREY },
    alternateRowStyles: { fillColor: LIGHT_GREY },
    margin: { left: cursor.marginX, right: cursor.marginX },
  });
  // @ts-expect-error - lastAutoTable is attached by plugin
  cursor.y = cursor.doc.lastAutoTable.finalY + 6;
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
    doc.text(`Page ${i} / ${pageCount}`, pw / 2, ph - 8, { align: 'center' });
    doc.setTextColor(...DARK_GREY);
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

  // Les types d'impots fiscaux venaient du module « echeances fiscales », retire
  // du produit : les tables fiscal_tax_types et client_fiscal_tax_types
  // n'existent plus. La rubrique correspondante disparait donc de l'export.
  const clientTaxTypeLabels: string[] = [];

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
  };

  // Cover page
  doc.setFillColor(...TEAL);
  doc.rect(0, 0, pageWidth, 45, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.text(cabinet.nom || 'Cabinet', marginX, 15);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  if (cabinet.adresse) doc.text(cabinet.adresse, marginX, 21);
  const contactLine = [cabinet.telephone, cabinet.email].filter(Boolean).join('  -  ');
  if (contactLine) doc.text(contactLine, marginX, 27);
  doc.setFontSize(22);
  doc.setFont('helvetica', 'bold');
  doc.text('Fiche client', pageWidth - marginX, 28, { align: 'right' });

  cursor.y = 60;
  doc.setTextColor(...DARK_GREY);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(20);
  const nameLines = doc.splitTextToSize(client.nom_entreprise || 'Client', cursor.maxWidth);
  for (const line of nameLines) {
    doc.text(line, marginX, cursor.y);
    cursor.y += 8;
  }

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.setTextColor(107, 114, 128);
  const coverMeta: string[] = [];
  if (client.numero_dossier) coverMeta.push(`Dossier ${client.numero_dossier}`);
  if (client.siren) coverMeta.push(`SIREN ${client.siren}`);
  if (client.statut) coverMeta.push(`Statut ${client.statut}`);
  if (coverMeta.length > 0) {
    cursor.y += 2;
    doc.text(coverMeta.join('   -   '), marginX, cursor.y);
    cursor.y += 6;
  }
  doc.text(`Genere le ${formatDateTime(new Date().toISOString())}`, marginX, cursor.y);
  cursor.y += 12;
  doc.setTextColor(...DARK_GREY);

  // Section: Identite
  drawSectionTitle(cursor, 'Identite');
  drawKeyValueGrid(cursor, [
    ['Raison sociale', sanitize(client.nom_entreprise)],
    // Le type de personne d'abord : il explique pourquoi les lignes suivantes
    // portent un nom et un prenom plutot qu'une raison sociale.
    ['Type', client.type_personne === 'physique' ? 'Personne physique' : client.type_personne === 'morale' ? 'Personne morale' : '-'],
    ['Nom commercial', sanitize(client.nom_commercial)],
    ['Numero de dossier', sanitize(client.numero_dossier)],
    ['Forme juridique', sanitize(client.forme_juridique)],
    ['SIREN', sanitize(client.siren)],
    ['SIRET', sanitize(client.siret)],
    ['Numero de TVA', sanitize(client.tva_intracom)],
    ['Code APE', sanitize(client.code_ape)],
    ['Capital social', client.capital_social != null ? `${client.capital_social} EUR` : '-'],
    ['Dirigeant', sanitize(client.dirigeant)],
    ['Date de creation', formatDate(client.date_creation_entreprise)],
    ['Dossier LMNP', client.is_lmnp ? 'Oui' : 'Non'],
  ]);

  // Section: Adresse et contact
  drawSectionTitle(cursor, 'Adresse et contact');
  drawKeyValueGrid(cursor, [
    // Une cellule par composant : c'est ce qu'on recopie sur une enveloppe.
    // Repli sur la chaine heritee si le decoupage n'a pas eu lieu — six fiches
    // sur 649 sont dans ce cas, et leur adresse doit quand meme s'imprimer.
    ['Adresse', sanitize(client.adresse_ligne1 || client.adresse)],
    ['Complement', sanitize(client.adresse_complement)],
    ['Code postal / Ville', sanitize([client.code_postal, client.ville].filter(Boolean).join(' '))],
    // Le pays n'apparait que s'il n'est pas la France : l'implicite d'un cabinet
    // francais n'a pas besoin d'etre imprime.
    ...(client.pays && client.pays.toUpperCase() !== 'FRANCE'
      ? [['Pays', sanitize(client.pays)] as [string, string]]
      : []),
    ['Email', sanitize(client.email)],
    ['Telephone', sanitize(client.telephone)],
    ['Telephone 2', sanitize(client.telephone_2)],
    ['Contact principal', sanitize(client.contact_principal)],
  ]);

  // Section: Informations comptables et fiscales
  drawSectionTitle(cursor, 'Informations comptables et fiscales');
  drawKeyValueGrid(cursor, [
    ['Mois de cloture', formatClosingMonthFromDate(client.date_cloture)],
    ['Date de cloture exercice social', formatClosingMonthFromDdMm(client.date_cloture_exercice_social)],
    ['Date de premiere cloture', formatDate(client.date_premiere_cloture)],
    ['Regime fiscal', sanitize(client.regime_fiscal)],
    ['Statut', sanitize(client.statut)],
    ['Date entree cabinet', formatDate(client.date_entree_cabinet)],
    ['Date sortie cabinet', formatDate(client.date_sortie_cabinet)],
    ['Types d\'impots suivis', clientTaxTypeLabels.length > 0 ? clientTaxTypeLabels.join(', ') : '-'],
  ]);
  if (client.description_activite) {
    ensureSpace(cursor, 6);
    cursor.doc.setFont('helvetica', 'bold');
    cursor.doc.setFontSize(9);
    cursor.doc.setTextColor(107, 114, 128);
    cursor.doc.text('Description de l\'activite', marginX, cursor.y);
    cursor.y += 4;
    cursor.doc.setFont('helvetica', 'normal');
    cursor.doc.setFontSize(9);
    cursor.doc.setTextColor(...DARK_GREY);
    drawParagraph(cursor, client.description_activite);
    cursor.y += 2;
  }

  // Section: Collaborateurs
  drawSectionTitle(cursor, 'Collaborateurs assignes');
  const collabRows = (collabRes.data ?? []).map((c: any) => {
    const user = c.user;
    const fullName = user ? `${user.prenom ?? ''} ${user.nom ?? ''}`.trim() : '-';
    const roleLabel = roleMap.get(c.role) || c.role || '-';
    return [
      fullName || '-',
      sanitize(user?.job_role),
      sanitize(user?.email),
      roleLabel,
      formatDate(c.created_at),
    ];
  });
  drawTable(cursor, ['Collaborateur', 'Fonction', 'Email', 'Role', 'Affecte le'], collabRows);

  // Section: Contacts annuaire
  drawSectionTitle(cursor, 'Contacts annuaire');
  const contactsRows = directoryContacts.contacts.map((c) => [
    `${c.lastName} ${c.firstName}`.trim() || '-',
    sanitize(c.roleInCompany),
    sanitize(c.email),
    sanitize(c.phone || c.mobile),
    c.isPrimary ? 'Oui' : 'Non',
  ]);
  drawTable(cursor, ['Contact', 'Fonction', 'Email', 'Telephone', 'Principal'], contactsRows);

  // Section: Dirigeants
  drawSectionTitle(cursor, 'Dirigeants');
  const officerRows = (officersRes.data ?? []).map((o: any) => {
    const off = o.company_officers;
    const name = off
      ? off.person_type === 'morale'
        ? off.denomination || off.last_name || '-'
        : `${off.last_name ?? ''} ${off.first_name ?? ''}`.trim() || '-'
      : '-';
    return [
      name,
      sanitize(o.role),
      formatDate(o.start_date),
      formatDate(o.end_date),
    ];
  });
  drawTable(cursor, ['Dirigeant', 'Qualite', 'Date debut', 'Date fin'], officerRows);

  // Section: Depots de comptes
  drawSectionTitle(cursor, 'Depots de comptes (BODACC)');
  const depotRows = (depotsRes.data ?? []).map((d: any) => [
    formatDate(d.date_cloture),
    sanitize(d.type_depot),
    formatDate(d.date_parution),
    sanitize(d.tribunal),
    sanitize(d.numero_annonce),
  ]);
  drawTable(cursor, ['Cloture', 'Type', 'Parution', 'Tribunal', 'Annonce'], depotRows);

  // Section: Actes juridiques
  drawSectionTitle(cursor, 'Actes juridiques');
  const actRows = (legalActsRes.data ?? []).map((a: any) => [
    formatDate(a.act_date),
    sanitize(a.act_type),
    sanitize(a.act_category),
    formatDate(a.deposit_date),
    sanitize(a.inpi_reference),
  ]);
  drawTable(cursor, ['Date', 'Type', 'Categorie', 'Depot', 'Reference INPI'], actRows);

  // Section: Déclarations de revenus
  drawSectionTitle(cursor, 'Déclarations de revenus');
  const declRows: string[][] = [];
  for (const decl of (revenueDeclRes.data ?? []) as any[]) {
    const atts = attachmentsByDeclaration.get(decl.id) ?? [];
    const attText = atts.length > 0 ? atts.join('\n') : '-';
    declRows.push([
      String(decl.annee),
      sanitize(decl.person_name),
      REVENUE_STATUS_LABELS[decl.statut as keyof typeof REVENUE_STATUS_LABELS] || decl.statut,
      sanitize(decl.commentaire),
      attText,
    ]);
  }
  drawTable(cursor, ['Annee', 'Personne', 'Statut', 'Commentaire', 'Pieces jointes'], declRows);

  // Section: Relances
  drawSectionTitle(cursor, 'Relances');
  const relanceRows = (relancesRes.data ?? []).map((r: any) => [
    sanitize(r.numero_facture),
    sanitize(r.libelle),
    formatDate(r.date_facture),
    formatDate(r.date_echeance),
    r.montant != null ? `${Number(r.montant).toFixed(2)} EUR` : '-',
    r.montant_regle != null ? `${Number(r.montant_regle).toFixed(2)} EUR` : '-',
    sanitize(r.statut),
    r.nombre_relances != null ? String(r.nombre_relances) : '0',
  ]);
  drawTable(
    cursor,
    ['Facture', 'Libelle', 'Date', 'Echeance', 'Montant', 'Regle', 'Statut', 'Relances'],
    relanceRows
  );

  // Section: ARD calculations (LMNP)
  if (ardRes.data && ardRes.data.length > 0) {
    drawSectionTitle(cursor, 'Calculs ARD (LMNP)');
    const ardRows = ardRes.data.map((a: any) => [
      String(a.annee),
      `${Number(a.ca || 0).toFixed(2)}`,
      `${Number(a.charges_totales || 0).toFixed(2)}`,
      `${Number(a.frais_compta || 0).toFixed(2)}`,
      `${Number(a.adhesion_cga || 0).toFixed(2)}`,
      `${Number(a.cfe || 0).toFixed(2)}`,
      `${Number(a.autres_charges || 0).toFixed(2)}`,
    ]);
    drawTable(
      cursor,
      ['Annee', 'CA', 'Charges', 'Frais compta', 'Adhesion CGA', 'CFE', 'Autres'],
      ardRows
    );
  }

  // Section: Comptes-rendus de reunion
  drawSectionTitle(cursor, 'Comptes-rendus de reunion');
  if (meetingNotes.length === 0) {
    drawEmpty(cursor, 'Aucun compte-rendu');
  } else {
    for (const note of meetingNotes) {
      ensureSpace(cursor, 22);
      cursor.doc.setFont('helvetica', 'bold');
      cursor.doc.setFontSize(10);
      cursor.doc.setTextColor(...TEAL);
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
      cursor.doc.setTextColor(...DARK_GREY);
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
        cursor.doc.text('Actions a suivre :', marginX, cursor.y);
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

  addHeaderFooter(doc, cabinet.nom || 'Cabinet', client.nom_entreprise || 'Client');

  const datePart = new Date().toISOString().split('T')[0];
  const safeName = String(client.nom_entreprise || client.id)
    .replace(/[^a-zA-Z0-9_-]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 80);
  doc.save(`ficheclient_${safeName}_${datePart}.pdf`);
}
