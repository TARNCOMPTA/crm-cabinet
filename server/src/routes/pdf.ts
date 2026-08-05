/**
 * Génération de PDF.
 * ---------------------------------------------------------------------------
 * Remplace l'Edge Function `generate-pdf`. Le rendu est inchangé (voir
 * pdf/rendu.ts) ; ce qui change ici, c'est l'entrée.
 *
 * L'original attendait un `cabinet_id` dans le corps de la requête. En
 * mono-cabinet il n'y a qu'une ligne dans `cabinets` : le paramètre disparaît,
 * et avec lui la possibilité — théorique dans l'original, puisque rien ne la
 * contrôlait — de demander l'en-tête d'un autre cabinet.
 *
 * Le logo est mis en cache : il est identique d'un document à l'autre, et le
 * retélécharger à chaque export ferait un aller-retour réseau par PDF.
 */

import type { FastifyInstance } from 'fastify';
import { jsPDF } from 'jspdf';
import { requeteUne } from '../db.js';
import { exigerSession } from '../gardes.js';
import {
  addFooter,
  addHeader,
  chargerLogo,
  htmlToPdfLines,
  markdownToPdfLines,
  renderPdfLines,
  type CabinetData,
} from '../pdf/rendu.js';

interface CorpsPdf {
  html?: string;
  markdown?: string;
  title?: string;
}

/** Logo en cache, avec l'URL qui l'a produit pour détecter un changement. */
let logoCache: { url: string; donnees: string | null } | null = null;

async function logoDuCabinet(url: string | null): Promise<string | null> {
  if (!url) return null;
  if (logoCache?.url === url) return logoCache.donnees;
  const donnees = await chargerLogo(url);
  logoCache = { url, donnees };
  return donnees;
}

/** Nom de fichier sûr : ni séparateur de chemin, ni caractère de contrôle. */
function nomFichier(titre: string): string {
  const base = titre
    .replace(/[^a-zA-Z0-9_\-\sÀ-ɏ]/g, '')
    .replace(/\s+/g, '_')
    .slice(0, 100);
  return `${base || 'document'}.pdf`;
}

export function enregistrerRoutesPdf(app: FastifyInstance): void {
  app.post<{ Body: CorpsPdf }>('/api/generate-pdf', async (request, reply) => {
    const session = await exigerSession(request, reply);
    if (!session) return;

    const { html, markdown, title } = request.body ?? {};
    if (!title) return reply.code(400).send({ error: 'title manquant.' });
    if (!html && !markdown) {
      return reply.code(400).send({ error: 'Contenu manquant : html ou markdown.' });
    }

    const cabinet = await requeteUne<CabinetData & { logo_url: string | null }>(
      `SELECT nom, adresse, email, telephone, siret, logo_url
         FROM cabinets
        ORDER BY created_at
        LIMIT 1`
    );

    const logo = await logoDuCabinet(cabinet?.logo_url ?? null);

    const lignes = markdown ? markdownToPdfLines(markdown) : htmlToPdfLines(html!);
    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });

    addHeader(doc, cabinet, logo);
    renderPdfLines(doc, lignes, cabinet, logo);

    // Les pieds de page sont posés après coup : le total de pages n'est connu
    // qu'une fois tout le contenu placé.
    const pages = doc.getNumberOfPages();
    for (let i = 1; i <= pages; i++) {
      doc.setPage(i);
      addFooter(doc, title, i, pages);
    }

    return reply
      .header('Content-Type', 'application/pdf')
      .header('Content-Disposition', `attachment; filename="${nomFichier(title)}"`)
      .send(Buffer.from(doc.output('arraybuffer')));
  });
}
