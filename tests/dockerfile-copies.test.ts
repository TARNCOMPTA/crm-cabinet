/**
 * Tout fichier que le Dockerfile copie doit exister.
 * ---------------------------------------------------------------------------
 * ⚠️ LA LISTE DU DOCKERFILE SE PÉRIME EN SILENCE. Les tests et la construction
 * locale tournent dans le dépôt COMPLET : un fichier supprimé, mais toujours
 * nommé par un `COPY`, n'y manque à personne. Le 2026-09-23, l'outil de
 * migration de Tailwind 4 a supprimé `tailwind.config.js` ; le Dockerfile le
 * copiait encore ; tous les tests étaient verts, et seule la construction de
 * l'image, en CI, a échoué — sur « "/tailwind.config.js": not found ».
 *
 * Ce test lit les `COPY` du Dockerfile et vérifie chaque source sur le disque,
 * sans Docker : le défaut tombe désormais avec `npm test`, avant la poussée.
 * Les copies entre étages (`COPY --from=…`) sont écartées : leurs sources
 * vivent dans l'image, pas dans le dépôt.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { resolve, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';

const RACINE = resolve(dirname(fileURLToPath(import.meta.url)), '..');

function sourcesCopiees(): string[] {
  const lignes = readFileSync(resolve(RACINE, 'Dockerfile'), 'utf8')
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => /^COPY\s/i.test(l) && !/--from=/i.test(l));
  return lignes.flatMap((l) => {
    const mots = l.replace(/^COPY\s+/i, '').split(/\s+/).filter((m) => !m.startsWith('--'));
    return mots.slice(0, -1); // le dernier mot est la destination
  });
}

/** Un motif `tsconfig*.json` doit correspondre à au moins un fichier. */
function existe(source: string): boolean {
  if (!source.includes('*')) return existsSync(resolve(RACINE, source));
  const dossier = dirname(source);
  const motif = new RegExp('^' + basename(source).replace(/\./g, '\\.').replace(/\*/g, '.*') + '$');
  return readdirSync(resolve(RACINE, dossier)).some((f) => motif.test(f));
}

describe('les copies du Dockerfile', () => {
  it('lit bien des COPY — le motif n a pas change', () => {
    expect(sourcesCopiees().length).toBeGreaterThan(5);
  });

  it('ne nomme aucun fichier absent du depot', () => {
    const absents = sourcesCopiees().filter((s) => !existe(s));
    expect(absents, `le Dockerfile copie des fichiers absents : ${absents.join(', ')}`).toEqual([]);
  });
});
