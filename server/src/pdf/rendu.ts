/**
 * Rendu PDF.
 * ---------------------------------------------------------------------------
 * Repris de l'Edge Function `generate-pdf`, dont tout le corps était du jsPDF
 * pur : seules l'authentification et la lecture du cabinet étaient spécifiques à
 * Deno. Le rendu lui-même — en-tête, pied de page, tableaux, conversion du HTML
 * et du Markdown en lignes — est conservé tel quel.
 *
 * Pourquoi jsPDF côté serveur et pas un navigateur sans interface : un Chromium
 * dans l'image Docker pèse quelques centaines de mégaoctets et demande des
 * bibliothèques système, pour produire les mêmes tableaux et paragraphes. Le
 * jour où il faudra un rendu HTML fidèle, la question se reposera.
 */

import { jsPDF } from 'jspdf';

export interface CabinetData {
  nom: string;
  adresse?: string | null;
  email?: string | null;
  telephone?: string | null;
  siret?: string | null;
  logo_url?: string | null;
}

const TEAL = [13, 148, 136] as const;
const DARK = [26, 26, 26] as const;
const GRAY = [102, 102, 102] as const;
const LIGHT_GRAY = [153, 153, 153] as const;

const PAGE_WIDTH = 210;
const PAGE_HEIGHT = 297;
const MARGIN_LEFT = 20;
const MARGIN_RIGHT = 20;
const MARGIN_TOP = 20;
const MARGIN_BOTTOM = 25;
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN_LEFT - MARGIN_RIGHT;
const HEADER_HEIGHT = 22;
const FOOTER_HEIGHT = 12;
const CONTENT_START_Y = MARGIN_TOP + HEADER_HEIGHT + 4;
const CONTENT_END_Y = PAGE_HEIGHT - MARGIN_BOTTOM - FOOTER_HEIGHT;

/**
 * Charge le logo du cabinet et le rend en base64, prêt pour jsPDF.
 *
 * L'original construisait la chaîne octet par octet avec `String.fromCharCode`
 * puis `btoa` — `btoa` n'existe pas en Node, et `Buffer` fait la conversion en
 * un appel. Le suffixe `##FORMAT` est une convention interne d'`addHeader`, qui
 * a besoin du format d'image en clair : jsPDF ne le devine pas.
 *
 * Un logo indisponible n'est pas une erreur : l'en-tête se contente alors du nom
 * du cabinet. Générer un PDF sans logo vaut mieux que ne pas le générer.
 */
export async function chargerLogo(url: string): Promise<string | null> {
  try {
    const controleur = new AbortController();
    const minuteur = setTimeout(() => controleur.abort(), 8000);
    let res: Response;
    try {
      res = await fetch(url, { signal: controleur.signal });
    } finally {
      clearTimeout(minuteur);
    }
    if (!res.ok) return null;

    const typeMime = res.headers.get('content-type') ?? 'image/png';
    const base64 = Buffer.from(await res.arrayBuffer()).toString('base64');
    // jsPDF ne sait pas lire du SVG : on l'annonce en PNG, ce que faisait déjà
    // l'original. Un logo SVG ne s'affichera donc pas — limite connue.
    const format = typeMime.includes('png') || typeMime.includes('svg') ? 'PNG' : 'JPEG';
    return `data:${typeMime};base64,${base64}##${format}`;
  } catch {
    return null;
  }
}

export function addHeader(
  doc: jsPDF,
  cabinet: CabinetData | null,
  logoData: string | null,
) {
  const y = MARGIN_TOP;

  if (logoData && cabinet) {
    // `logoData` est produit plus haut sous la forme « <data-uri>##<FORMAT> ».
    // L'indexation d'un tableau rend `string | undefined`, et jsPDF n'accepte pas
    // `undefined` : le vérifier ici est ce qui manquait pour que le serveur
    // repasse à zéro erreur de compilation — seuil que sa CI exige.
    const [dataUri, format] = logoData.split('##');
    if (dataUri) {
      try {
        const logoMaxH = 14;
        const logoMaxW = 30;
        doc.addImage(dataUri, format || 'PNG', MARGIN_LEFT, y - 2, logoMaxW, logoMaxH);
      } catch {
        // logo failed, skip
      }
    }
  }

  if (cabinet) {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12);
    doc.setTextColor(...TEAL);
    doc.text(cabinet.nom, PAGE_WIDTH - MARGIN_RIGHT, y + 2, { align: 'right' });

    const details = [cabinet.adresse, cabinet.email, cabinet.telephone].filter(Boolean).join(' | ');
    if (details) {
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7.5);
      doc.setTextColor(...GRAY);
      doc.text(details, PAGE_WIDTH - MARGIN_RIGHT, y + 7, { align: 'right' });
    }
  }

  doc.setDrawColor(...TEAL);
  doc.setLineWidth(0.5);
  doc.line(MARGIN_LEFT, y + HEADER_HEIGHT - 2, PAGE_WIDTH - MARGIN_RIGHT, y + HEADER_HEIGHT - 2);
}

export function addFooter(doc: jsPDF, title: string, pageNum: number, totalPages: number) {
  const y = PAGE_HEIGHT - MARGIN_BOTTOM;

  doc.setDrawColor(221, 221, 221);
  doc.setLineWidth(0.3);
  doc.line(MARGIN_LEFT, y, PAGE_WIDTH - MARGIN_RIGHT, y);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7);
  doc.setTextColor(...LIGHT_GRAY);
  doc.text(title, MARGIN_LEFT, y + 5);

  const dateStr = new Date().toLocaleDateString('fr-FR');
  doc.text(dateStr, PAGE_WIDTH / 2, y + 5, { align: 'center' });

  doc.text(`Page ${pageNum} / ${totalPages}`, PAGE_WIDTH - MARGIN_RIGHT, y + 5, { align: 'right' });
}

/**
 * Une ligne à poser dans le document.
 *
 * `th-row` / `td-row` et les couleurs de tableau ont été retirés : le type les
 * déclarait, mais aucune fonction ne les produisait ni ne les dessinait — un
 * tableau HTML ou Markdown ressort donc en texte brut, cellule après cellule.
 * Limite connue, pas régression : elle existait déjà dans l'Edge Function.
 */
interface PdfLine {
  type: 'h1' | 'h2' | 'h3' | 'p' | 'li-ul' | 'li-ol' | 'hr' | 'blockquote' | 'empty';
  text: string;
  cells?: string[];
  indent?: number;
  bold?: boolean;
  olIndex?: number;
}

export function markdownToPdfLines(md: string): PdfLine[] {
  const lines: PdfLine[] = [];
  const rawLines = md.split('\n');
  let olCounter = 0;

  for (const line of rawLines) {
    if (line.startsWith('### ')) {
      olCounter = 0;
      lines.push({ type: 'h3', text: stripInline(line.slice(4)) });
    } else if (line.startsWith('## ')) {
      olCounter = 0;
      lines.push({ type: 'h2', text: stripInline(line.slice(3)) });
    } else if (line.startsWith('# ')) {
      olCounter = 0;
      lines.push({ type: 'h1', text: stripInline(line.slice(2)) });
    } else if (line.match(/^[-*]\s/)) {
      olCounter = 0;
      lines.push({ type: 'li-ul', text: stripInline(line.replace(/^[-*]\s/, '')) });
    } else if (line.match(/^\d+\.\s/)) {
      olCounter++;
      lines.push({ type: 'li-ol', text: stripInline(line.replace(/^\d+\.\s/, '')), olIndex: olCounter });
    } else if (line.trim() === '---' || line.trim() === '***') {
      olCounter = 0;
      lines.push({ type: 'hr', text: '' });
    } else if (line.startsWith('>')) {
      olCounter = 0;
      lines.push({ type: 'blockquote', text: stripInline(line.replace(/^>\s?/, '')) });
    } else if (line.trim() === '') {
      olCounter = 0;
      lines.push({ type: 'empty', text: '' });
    } else {
      olCounter = 0;
      lines.push({ type: 'p', text: stripInline(line) });
    }
  }

  return lines;
}

export function htmlToPdfLines(html: string): PdfLine[] {
  let text = html;
  text = text.replace(/<br\s*\/?>/gi, '\n');
  text = text.replace(/<\/p>/gi, '\n\n');
  text = text.replace(/<\/div>/gi, '\n');
  text = text.replace(/<\/li>/gi, '\n');
  text = text.replace(/<h1[^>]*>([\s\S]*?)<\/h1>/gi, '\n# $1\n');
  text = text.replace(/<h2[^>]*>([\s\S]*?)<\/h2>/gi, '\n## $1\n');
  text = text.replace(/<h3[^>]*>([\s\S]*?)<\/h3>/gi, '\n### $1\n');
  text = text.replace(/<hr\s*\/?>/gi, '\n---\n');
  text = text.replace(/<li[^>]*>/gi, '- ');
  text = text.replace(/<blockquote[^>]*>([\s\S]*?)<\/blockquote>/gi, '> $1');
  text = text.replace(/<strong[^>]*>([\s\S]*?)<\/strong>/gi, '**$1**');
  text = text.replace(/<b[^>]*>([\s\S]*?)<\/b>/gi, '**$1**');
  text = text.replace(/<em[^>]*>([\s\S]*?)<\/em>/gi, '*$1*');
  text = text.replace(/<i[^>]*>([\s\S]*?)<\/i>/gi, '*$1*');
  text = text.replace(/<[^>]+>/g, '');
  text = text.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&nbsp;/g, ' ').replace(/&#39;/g, "'").replace(/&quot;/g, '"');
  text = text.replace(/\n{3,}/g, '\n\n');

  return markdownToPdfLines(text);
}

function stripInline(text: string): string {
  return text.replace(/\*\*(.+?)\*\*/g, '$1').replace(/\*(.+?)\*/g, '$1').replace(/`(.+?)`/g, '$1');
}

/**
 * Pose le contenu et rend le nombre de pages produites.
 *
 * Le titre n'est pas un paramètre : les pieds de page sont écrits par l'appelant
 * une fois le total de pages connu. L'original le recevait sans s'en servir.
 */
export function renderPdfLines(
  doc: jsPDF,
  pdfLines: PdfLine[],
  cabinet: CabinetData | null,
  logoData: string | null,
): number {
  let y = CONTENT_START_Y;
  let pageCount = 1;

  function checkNewPage(needed: number) {
    if (y + needed > CONTENT_END_Y) {
      doc.addPage();
      pageCount++;
      addHeader(doc, cabinet, logoData);
      y = CONTENT_START_Y;
    }
  }

  for (const line of pdfLines) {
    switch (line.type) {
      case 'h1': {
        checkNewPage(14);
        y += 6;
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(16);
        doc.setTextColor(...DARK);
        const h1Lines = doc.splitTextToSize(line.text, CONTENT_WIDTH);
        doc.text(h1Lines, MARGIN_LEFT, y);
        y += h1Lines.length * 7 + 4;
        break;
      }
      case 'h2': {
        checkNewPage(12);
        y += 5;
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(13);
        doc.setTextColor(51, 51, 51);
        const h2Lines = doc.splitTextToSize(line.text, CONTENT_WIDTH);
        doc.text(h2Lines, MARGIN_LEFT, y);
        y += h2Lines.length * 6 + 3;
        break;
      }
      case 'h3': {
        checkNewPage(10);
        y += 4;
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(11);
        doc.setTextColor(68, 68, 68);
        const h3Lines = doc.splitTextToSize(line.text, CONTENT_WIDTH);
        doc.text(h3Lines, MARGIN_LEFT, y);
        y += h3Lines.length * 5 + 2;
        break;
      }
      case 'p': {
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(10);
        doc.setTextColor(...DARK);
        const pLines = doc.splitTextToSize(line.text, CONTENT_WIDTH);
        checkNewPage(pLines.length * 4.5 + 2);
        doc.text(pLines, MARGIN_LEFT, y);
        y += pLines.length * 4.5 + 2;
        break;
      }
      case 'li-ul': {
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(10);
        doc.setTextColor(...DARK);
        const indent = 8;
        const bulletX = MARGIN_LEFT + indent - 3;
        const textLines = doc.splitTextToSize(line.text, CONTENT_WIDTH - indent);
        checkNewPage(textLines.length * 4.5 + 1);
        doc.setFillColor(...DARK);
        doc.circle(bulletX, y - 1.2, 0.8, 'F');
        doc.text(textLines, MARGIN_LEFT + indent, y);
        y += textLines.length * 4.5 + 1;
        break;
      }
      case 'li-ol': {
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(10);
        doc.setTextColor(...DARK);
        const olIndent = 8;
        const numStr = `${line.olIndex || 1}.`;
        const olTextLines = doc.splitTextToSize(line.text, CONTENT_WIDTH - olIndent);
        checkNewPage(olTextLines.length * 4.5 + 1);
        doc.text(numStr, MARGIN_LEFT + 2, y);
        doc.text(olTextLines, MARGIN_LEFT + olIndent, y);
        y += olTextLines.length * 4.5 + 1;
        break;
      }
      case 'blockquote': {
        doc.setFont('helvetica', 'italic');
        doc.setFontSize(10);
        doc.setTextColor(...GRAY);
        const bqIndent = 6;
        const bqLines = doc.splitTextToSize(line.text, CONTENT_WIDTH - bqIndent - 2);
        checkNewPage(bqLines.length * 4.5 + 2);
        doc.setDrawColor(...TEAL);
        doc.setLineWidth(1);
        doc.line(MARGIN_LEFT + 1, y - 3, MARGIN_LEFT + 1, y + bqLines.length * 4.5 - 1);
        doc.text(bqLines, MARGIN_LEFT + bqIndent, y);
        y += bqLines.length * 4.5 + 3;
        break;
      }
      case 'hr': {
        checkNewPage(6);
        y += 2;
        doc.setDrawColor(204, 204, 204);
        doc.setLineWidth(0.3);
        doc.line(MARGIN_LEFT, y, PAGE_WIDTH - MARGIN_RIGHT, y);
        y += 4;
        break;
      }
      case 'empty': {
        y += 3;
        break;
      }
    }
  }

  return pageCount;
}

