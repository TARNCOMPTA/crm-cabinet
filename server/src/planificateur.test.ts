/**
 * La purge des pièces de campagne orphelines.
 * ---------------------------------------------------------------------------
 * Cette fonction EFFACE DES FICHIERS, une fois par semaine, sans personne devant
 * l'écran. Les trois cas qu'elle doit distinguer sont donc éprouvés chacun pour
 * lui-même, sur un vrai répertoire — un test qui simulerait le système de
 * fichiers ne prouverait que la simulation.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdir, mkdtemp, rm, utimes, writeFile, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

process.env.DATABASE_URL ??= 'postgres://test-sans-connexion-reelle/test';
process.env.SESSION_SECRET ??= 'secret-de-test-jamais-utilise-pour-signer-32c';

const { purgerPiecesOrphelines, AGE_ORPHELINE_MS } = await import('./planificateur.js');

let racine: string;

/** Écrit un fichier et lui donne l'âge voulu, en jours. */
async function poser(chemin: string, ageJours: number) {
  const absolu = join(racine, chemin);
  await mkdir(join(absolu, '..'), { recursive: true });
  await writeFile(absolu, 'contenu');
  const quand = new Date(Date.now() - ageJours * 24 * 60 * 60 * 1000);
  await utimes(absolu, quand, quand);
}

async function fichiers(repertoire = racine): Promise<string[]> {
  const out: string[] = [];
  for (const e of await readdir(repertoire, { withFileTypes: true })) {
    const a = join(repertoire, e.name);
    if (e.isDirectory()) out.push(...(await fichiers(a)));
    else out.push(a.slice(racine.length + 1).split('\\').join('/'));
  }
  return out.sort();
}

beforeEach(async () => {
  racine = await mkdtemp(join(tmpdir(), 'purge-pieces-'));
});
afterEach(async () => {
  await rm(racine, { recursive: true, force: true });
});

describe('purgerPiecesOrphelines', () => {
  const limite = () => Date.now() - AGE_ORPHELINE_MS;

  it('supprime une piece que rien ne reference et qui a passe le delai', async () => {
    await poser('2026/abandonnee.pdf', 30);
    const n = await purgerPiecesOrphelines(racine, new Set(), limite());
    expect(n).toBe(1);
    expect(await fichiers()).toEqual([]);
  });

  /*
    ⚠️ LE CAS QUI PROTEGE L'HISTORIQUE. `mailing_campagnes.pieces_jointes` est la
    trace de ce qui est parti ; effacer le fichier qu'elle cite la rendrait
    mensongere. L'age n'y change rien.
  */
  it('GARDE une piece referencee par une campagne, meme tres vieille', async () => {
    await poser('2026/envoyee.pdf', 400);
    const n = await purgerPiecesOrphelines(racine, new Set(['2026/envoyee.pdf']), limite());
    expect(n).toBe(0);
    expect(await fichiers()).toEqual(['2026/envoyee.pdf']);
  });

  /*
    ⚠️ LE CAS QUI PROTEGE L'UTILISATEUR EN TRAIN D'ECRIRE. Une piece deposee il y
    a cinq minutes n'est referencee par aucune campagne — celle-ci n'est pas
    partie. Sans le delai, la purge l'effacerait sous ses doigts.
  */
  it('GARDE une piece recente, meme non referencee', async () => {
    await poser('2026/en-cours-de-redaction.pdf', 1);
    const n = await purgerPiecesOrphelines(racine, new Set(), limite());
    expect(n).toBe(0);
    expect(await fichiers()).toEqual(['2026/en-cours-de-redaction.pdf']);
  });

  it('descend dans les sous-repertoires', async () => {
    await poser('2026/09/a/b/perdue.pdf', 30);
    const n = await purgerPiecesOrphelines(racine, new Set(), limite());
    expect(n).toBe(1);
  });

  it('ne trebuche pas sur un bucket qui n existe pas encore', async () => {
    const n = await purgerPiecesOrphelines(join(racine, 'jamais-cree'), new Set(), limite());
    expect(n).toBe(0);
  });

  it('trie correctement un lot mele', async () => {
    await poser('2026/gardee-ref.pdf', 100);
    await poser('2026/gardee-recente.pdf', 2);
    await poser('2026/purgee-1.pdf', 100);
    await poser('2026/09/purgee-2.pdf', 8);

    const n = await purgerPiecesOrphelines(racine, new Set(['2026/gardee-ref.pdf']), limite());
    expect(n).toBe(2);
    expect(await fichiers()).toEqual(['2026/gardee-recente.pdf', '2026/gardee-ref.pdf']);
  });
});
