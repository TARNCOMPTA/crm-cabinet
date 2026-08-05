import { sanitizeHtml } from './sanitize';

function sanitizeHtmlForPrint(html: string): string {
  return sanitizeHtml(html);
}

interface CabinetInfo {
  nom: string;
  adresse?: string | null;
  email?: string | null;
  telephone?: string | null;
}

/**
 * Appelle le service de génération de PDF de l'instance.
 *
 * Aucun en-tête d'authentification : la session est un cookie httpOnly, que le
 * navigateur joint de lui-même puisque l'API est servie sur la même origine.
 *
 * Avant, cette fonction commençait par lire `session.access_token` et levait
 * « Session expiree » s'il manquait. Il manque toujours — le jeton a disparu
 * avec Supabase, et il n'est pas lisible en JavaScript par construction. Chaque
 * export PDF échouait donc, en accusant la session de l'utilisateur.
 */
async function callGeneratePdf(payload: {
  html?: string;
  markdown?: string;
  title: string;
}): Promise<Blob> {
  const apiUrl = `/api/generate-pdf`;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30000);

  try {
    const response = await fetch(apiUrl, {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => null);
      throw new Error(errorData?.error || `Erreur serveur (${response.status})`);
    }

    return await response.blob();
  } finally {
    clearTimeout(timeout);
  }
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

function sanitizeFilename(title: string): string {
  return title.replace(/[^a-zA-Z0-9_\-\s\u00C0-\u024F]/g, '').replace(/\s+/g, '_') + '.pdf';
}

export async function exportToPdf(
  html: string,
  title: string,
  cabinet?: CabinetInfo
): Promise<void> {
  if (!cabinet) {
    fallbackPrint(html, title, cabinet);
    return;
  }

  try {
    const blob = await callGeneratePdf({
      html,
      title,
    });
    downloadBlob(blob, sanitizeFilename(title));
  } catch {
    fallbackPrint(html, title, cabinet);
  }
}

export async function exportMarkdownToPdf(
  markdown: string,
  title: string,
  cabinet?: CabinetInfo
): Promise<void> {
  if (!cabinet) {
    const html = markdownToHtml(markdown);
    fallbackPrint(html, title, cabinet);
    return;
  }

  try {
    const blob = await callGeneratePdf({
      markdown,
      title,
    });
    downloadBlob(blob, sanitizeFilename(title));
  } catch {
    const html = markdownToHtml(markdown);
    fallbackPrint(html, title, cabinet);
  }
}

const PRINT_STYLES = `
  @media print {
    body * { visibility: hidden; }
    #print-container, #print-container * { visibility: visible; }
    #print-container {
      position: absolute;
      left: 0;
      top: 0;
      width: 100%;
    }
  }
  @page {
    size: A4;
    margin: 20mm 20mm 25mm 20mm;
  }
  #print-container {
    font-family: 'Segoe UI', Calibri, Arial, sans-serif;
    font-size: 11pt;
    line-height: 1.5;
    color: #1a1a1a;
    max-width: 210mm;
    margin: 0 auto;
  }
  #print-container .doc-header {
    text-align: right;
    padding-bottom: 12px;
    margin-bottom: 20px;
    border-bottom: 2px solid #7c2d5e;
  }
  #print-container .doc-header .cabinet-name {
    font-size: 14pt;
    font-weight: 700;
    color: #7c2d5e;
  }
  #print-container .doc-header .cabinet-details {
    font-size: 9pt;
    color: #666;
    margin-top: 2px;
  }
  #print-container .doc-body h1 {
    font-size: 18pt;
    font-weight: 700;
    margin: 20px 0 12px;
    color: #1a1a1a;
  }
  #print-container .doc-body h2 {
    font-size: 14pt;
    font-weight: 600;
    margin: 16px 0 8px;
    color: #333;
  }
  #print-container .doc-body h3 {
    font-size: 12pt;
    font-weight: 600;
    margin: 12px 0 6px;
    color: #444;
  }
  #print-container .doc-body p {
    margin: 6px 0;
  }
  #print-container .doc-body ol, #print-container .doc-body ul {
    padding-left: 24px;
    margin: 8px 0;
  }
  #print-container .doc-body li {
    margin: 3px 0;
  }
  #print-container .doc-body hr {
    border: none;
    border-top: 1px solid #ccc;
    margin: 16px 0;
  }
  #print-container .doc-body table {
    width: 100%;
    border-collapse: collapse;
    margin: 12px 0;
  }
  #print-container .doc-body td, #print-container .doc-body th {
    border: 1px solid #ddd;
    padding: 6px 8px;
    font-size: 10pt;
  }
  #print-container .doc-body th {
    background: #f5f5f5;
    font-weight: 600;
  }
  #print-container .doc-footer {
    margin-top: 32px;
    padding-top: 12px;
    border-top: 1px solid #ddd;
    text-align: center;
    font-size: 8pt;
    color: #999;
  }
  #print-container .doc-var-empty,
  #print-container .doc-var-missing {
    background: #FEF3C7;
    padding: 1px 4px;
    border-radius: 2px;
    color: #92400E;
    font-style: italic;
  }
`;

function fallbackPrint(html: string, title: string, cabinet?: CabinetInfo): void {
  const printWindow = window.open('', '_blank');
  if (!printWindow) {
    alert('Veuillez autoriser les popups pour exporter en PDF.');
    return;
  }

  const headerHtml = cabinet
    ? `<div class="doc-header">
        <div class="cabinet-name">${escapeForPrint(cabinet.nom)}</div>
        <div class="cabinet-details">
          ${[cabinet.adresse, cabinet.email, cabinet.telephone]
            // `filter(Boolean)` ne restreint pas le type : il faut le predicat
            // pour que `escapeForPrint` recoive bien des chaines.
            .filter((v): v is string => Boolean(v))
            .map(escapeForPrint)
            .join(' | ')}
        </div>
      </div>`
    : '';

  const footerHtml = `<div class="doc-footer">${escapeForPrint(title)} - ${new Date().toLocaleDateString('fr-FR')}</div>`;

  printWindow.document.write(`<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>${escapeForPrint(title)}</title>
  <style>${PRINT_STYLES}</style>
</head>
<body>
  <div id="print-container">
    ${headerHtml}
    <div class="doc-body">${sanitizeHtmlForPrint(html)}</div>
    ${footerHtml}
  </div>
  <script>
    window.onload = function() {
      setTimeout(function() {
        window.print();
        window.onafterprint = function() { window.close(); };
      }, 300);
    };
  </script>
</body>
</html>`);
  printWindow.document.close();
}

function markdownToHtml(md: string): string {
  const lines = md.split('\n');
  const htmlLines: string[] = [];
  let inList = false;
  let listType = '';

  for (const line of lines) {
    if (line.startsWith('### ')) {
      if (inList) { htmlLines.push(`</${listType}>`); inList = false; }
      htmlLines.push(`<h3>${processInline(line.slice(4))}</h3>`);
    } else if (line.startsWith('## ')) {
      if (inList) { htmlLines.push(`</${listType}>`); inList = false; }
      htmlLines.push(`<h2>${processInline(line.slice(3))}</h2>`);
    } else if (line.startsWith('# ')) {
      if (inList) { htmlLines.push(`</${listType}>`); inList = false; }
      htmlLines.push(`<h1>${processInline(line.slice(2))}</h1>`);
    } else if (line.match(/^[-*]\s/)) {
      if (!inList || listType !== 'ul') {
        if (inList) htmlLines.push(`</${listType}>`);
        htmlLines.push('<ul>');
        inList = true;
        listType = 'ul';
      }
      htmlLines.push(`<li>${processInline(line.replace(/^[-*]\s/, ''))}</li>`);
    } else if (line.match(/^\d+\.\s/)) {
      if (!inList || listType !== 'ol') {
        if (inList) htmlLines.push(`</${listType}>`);
        htmlLines.push('<ol>');
        inList = true;
        listType = 'ol';
      }
      htmlLines.push(`<li>${processInline(line.replace(/^\d+\.\s/, ''))}</li>`);
    } else if (line.trim() === '---') {
      if (inList) { htmlLines.push(`</${listType}>`); inList = false; }
      htmlLines.push('<hr>');
    } else if (line.trim() === '') {
      if (inList) { htmlLines.push(`</${listType}>`); inList = false; }
    } else {
      if (inList) { htmlLines.push(`</${listType}>`); inList = false; }
      htmlLines.push(`<p>${processInline(line)}</p>`);
    }
  }

  if (inList) htmlLines.push(`</${listType}>`);
  return htmlLines.join('\n');
}

function processInline(text: string): string {
  let result = escapeForPrint(text);
  result = result.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  result = result.replace(/\*(.+?)\*/g, '<em>$1</em>');
  result = result.replace(/`(.+?)`/g, '<code>$1</code>');
  return result;
}

function escapeForPrint(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
