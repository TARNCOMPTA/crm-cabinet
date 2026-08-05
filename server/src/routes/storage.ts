/**
 * Stockage des fichiers sur disque.
 * ---------------------------------------------------------------------------
 * Remplace Supabase Storage. Les fichiers vivent sous STORAGE_DIR, dans un
 * volume Docker — jamais dans l'image, sinon une mise à jour les effacerait.
 *
 * Deux points de sécurité, tous deux déjà des sources d'incidents connues :
 *
 *   - Traversée de répertoire. Un chemin comme `../../etc/passwd` doit être
 *     refusé. On ne se contente pas de filtrer « .. » : on résout le chemin
 *     absolu et on vérifie qu'il reste sous la racine du bucket, seule
 *     verification qui resiste aux encodages exotiques.
 *
 *   - URLs signées. Elles portent une signature HMAC et une expiration, donc
 *     elles ne sont pas devinables et ne durent pas. C'est ce qui permet
 *     d'ouvrir une pièce jointe dans un onglet sans exposer le fichier
 *     publiquement.
 */

import { createHmac, timingSafeEqual } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { mkdir, rm, stat, writeFile } from 'node:fs/promises';
import { dirname, extname, join, resolve, sep } from 'node:path';
import type { FastifyInstance } from 'fastify';
import multipart from '@fastify/multipart';
import { config } from '../config.js';
import { exigerSession } from '../gardes.js';

/** Buckets connus. Un bucket inconnu est refusé plutôt que créé à la volée. */
const BUCKETS = new Set([
  'cabinet-logos',
  'task-attachments',
  'opportunity-attachments',
  'checklist-item-attachments',
  'bilan-checklist-attachments',
  'revenue-declaration-attachments',
  'tax-exemption-docs',
]);

/** Seul bucket lisible sans session : le logo apparaît sur la page de connexion. */
const BUCKETS_PUBLICS = new Set(['cabinet-logos']);

/**
 * Résout un chemin dans un bucket, en refusant toute sortie de la racine.
 * Renvoie null si le chemin est hors limites.
 */
function cheminSur(bucket: string, chemin: string): string | null {
  if (!BUCKETS.has(bucket)) return null;
  const racine = resolve(config.storage.racine, bucket);
  const absolu = resolve(racine, chemin);
  // Le séparateur final évite qu'un bucket « photos » laisse acceder a « photos-prives ».
  if (absolu !== racine && !absolu.startsWith(racine + sep)) return null;
  return absolu;
}

/**
 * Types servis sous leur vrai nom, et eux seuls.
 * ---------------------------------------------------------------------------
 * Fastify n'annonce AUCUN type pour une réponse en flux : la route rendait donc
 * chaque fichier sans `Content-Type`, et le navigateur, à qui Caddy interdit de
 * deviner (`X-Content-Type-Options: nosniff`), le traitait en binaire opaque.
 * Conséquence : ouvrir une pièce jointe la téléchargeait au lieu de l'afficher —
 * exactement ce que les URL signées étaient censées permettre.
 *
 * La liste est courte à dessein. Ces formats-là, le navigateur les REND ; il
 * n'exécute rien qui vienne du fichier. Annoncer de la même façon un `.html` ou
 * un `.svg` — qui portent du script et s'exécuteraient dans l'origine de
 * l'application, avec le cookie de session à portée — transformerait le dépôt
 * d'une pièce jointe en injection de code. Tout ce qui n'est pas ici reste donc
 * `application/octet-stream`, c'est-à-dire téléchargé, jamais interprété.
 */
const TYPES_AFFICHABLES: Record<string, string> = {
  '.pdf': 'application/pdf',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
};

/** Guillemet, barre oblique inverse et DEL : les trois hors-la-loi non nommables ici. */
const CARACTERES_INTERDITS = new Set([34, 92, 127]);

/**
 * Nom de fichier proposé au téléchargement, réduit à ce qui tient sans risque
 * entre guillemets dans un en-tête HTTP.
 *
 * Le nom vient du chemin de dépôt, donc de l'utilisateur. Un guillemet y
 * refermait la valeur de `filename` en avance — de quoi faire enregistrer la
 * pièce jointe sous un autre nom, et une extension choisie par le déposant. Les
 * caractères de contrôle, eux, feraient carrément échouer l'envoi : Node refuse
 * d'écrire un CR ou un LF dans un en-tête.
 */
function nomTelechargement(chemin: string): string {
  const brut = chemin.split('/').pop() ?? 'fichier';
  const propre = [...brut]
    .map((c) => {
      const code = c.codePointAt(0) ?? 0;
      return code < 32 || CARACTERES_INTERDITS.has(code) ? '_' : c;
    })
    .join('')
    .trim();
  return propre || 'fichier';
}

function signer(bucket: string, chemin: string, expire: number): string {
  return createHmac('sha256', config.session.secret)
    .update(`${bucket}:${chemin}:${expire}`)
    .digest('base64url');
}

function signatureValide(bucket: string, chemin: string, expire: number, signature: string): boolean {
  if (!Number.isFinite(expire) || expire * 1000 < Date.now()) return false;
  const attendue = Buffer.from(signer(bucket, chemin, expire));
  const fournie = Buffer.from(signature);
  // Comparaison à temps constant : une comparaison naïve fuit la signature
  // attendue octet par octet.
  if (attendue.length !== fournie.length) return false;
  return timingSafeEqual(attendue, fournie);
}

export async function enregistrerRoutesStorage(app: FastifyInstance): Promise<void> {
  await app.register(multipart, {
    limits: { fileSize: config.storage.tailleMaxOctets, files: 1 },
  });

  // ---- Dépôt --------------------------------------------------------------
  app.post<{ Params: { bucket: string; '*': string } }>(
    '/api/storage/:bucket/*',
    async (request, reply) => {
      if (!(await exigerSession(request, reply))) return;

      const { bucket } = request.params;
      const chemin = request.params['*'];
      const cible = cheminSur(bucket, chemin);
      if (!cible) return reply.code(400).send({ message: 'Chemin ou bucket invalide.' });

      const fichier = await request.file();
      if (!fichier) return reply.code(400).send({ message: 'Aucun fichier recu.' });

      const contenu = await fichier.toBuffer();
      if (contenu.length > config.storage.tailleMaxOctets) {
        return reply.code(413).send({ message: 'Fichier trop volumineux.' });
      }

      await mkdir(dirname(cible), { recursive: true });
      await writeFile(cible, contenu);

      return reply.code(201).send({
        chemin,
        bucket,
        taille: contenu.length,
        mimetype: fichier.mimetype,
      });
    }
  );

  // ---- URL signée ---------------------------------------------------------
  app.post<{ Params: { bucket: string; '*': string }; Body: { dureeSecondes?: number } }>(
    '/api/storage/signer/:bucket/*',
    async (request, reply) => {
      if (!(await exigerSession(request, reply))) return;

      const { bucket } = request.params;
      const chemin = request.params['*'];
      if (!cheminSur(bucket, chemin)) {
        return reply.code(400).send({ message: 'Chemin ou bucket invalide.' });
      }

      const duree = Math.min(Math.max(request.body?.dureeSecondes ?? 3600, 30), 86_400);
      const expire = Math.floor(Date.now() / 1000) + duree;
      const signature = signer(bucket, chemin, expire);

      return {
        url: `/api/storage/${bucket}/${chemin}?expire=${expire}&signature=${signature}`,
        expire,
      };
    }
  );

  // ---- Lecture ------------------------------------------------------------
  // Deux voies d'accès : une session valide, ou une URL signée non expirée.
  app.get<{
    Params: { bucket: string; '*': string };
    Querystring: { expire?: string; signature?: string; telecharger?: string };
  }>('/api/storage/:bucket/*', async (request, reply) => {
    const { bucket } = request.params;
    const chemin = request.params['*'];
    const cible = cheminSur(bucket, chemin);
    if (!cible) return reply.code(400).send({ message: 'Chemin ou bucket invalide.' });

    const { expire, signature } = request.query;
    const parSignature =
      expire !== undefined &&
      signature !== undefined &&
      signatureValide(bucket, chemin, Number(expire), signature);

    if (!parSignature && !BUCKETS_PUBLICS.has(bucket)) {
      // `exigerSession` repond lui-meme en 401, et verifie au passage que le
      // compte n'a pas ete ferme entre-temps.
      if (!(await exigerSession(request, reply))) return;
    }

    let infos;
    try {
      infos = await stat(cible);
    } catch {
      return reply.code(404).send({ message: 'Fichier introuvable.' });
    }
    if (!infos.isFile()) return reply.code(404).send({ message: 'Fichier introuvable.' });

    reply.header('content-length', infos.size);

    // `?telecharger` prime : on veut l'enregistrement, pas l'aperçu.
    if (request.query.telecharger !== undefined) {
      reply.header('content-type', 'application/octet-stream');
      reply.header('content-disposition', `attachment; filename="${nomTelechargement(chemin)}"`);
    } else {
      reply.header(
        'content-type',
        TYPES_AFFICHABLES[extname(chemin).toLowerCase()] ?? 'application/octet-stream'
      );
    }
    return reply.send(createReadStream(cible));
  });

  // ---- Suppression --------------------------------------------------------
  app.delete<{ Params: { bucket: string; '*': string } }>(
    '/api/storage/:bucket/*',
    async (request, reply) => {
      if (!(await exigerSession(request, reply))) return;

      const cible = cheminSur(request.params.bucket, request.params['*']);
      if (!cible) return reply.code(400).send({ message: 'Chemin ou bucket invalide.' });

      // force: true rend l'opération idempotente — supprimer deux fois ne doit
      // pas remonter une erreur au front.
      await rm(cible, { force: true });
      return { ok: true };
    }
  );
}

/** Crée l'arborescence des buckets au démarrage. */
export async function preparerStockage(): Promise<void> {
  for (const bucket of BUCKETS) {
    await mkdir(join(config.storage.racine, bucket), { recursive: true });
  }
}
