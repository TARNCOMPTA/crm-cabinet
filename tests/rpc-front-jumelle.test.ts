/**
 * Les fonctions que le front appelle, et celles que le proxy laisse passer.
 * ---------------------------------------------------------------------------
 * `RPC_OUVERTES` (server/src/rest-droits.ts) se décrit lui-même comme « la
 * liste des appels réels du front ». Rien ne la tenait : `get_bilan_progression`
 * est arrivée avec l'incrément 017, le tableau de bord l'a appelée, et le proxy
 * l'a refusée en 403 pendant dix-huit jours — un bloc vide, sans message.
 *
 * Ce test lit chaque `.rpc('…')` du front et tombe, EN LE NOMMANT, sur un appel
 * que le proxy refuserait. L'inverse — une fonction ouverte que plus personne
 * n'appelle — tombe aussi : une porte ouverte sans usage n'a pas à le rester.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { RPC_OUVERTES } from '../server/src/rest-droits';

const RACINE = resolve(dirname(fileURLToPath(import.meta.url)), '..');

function fichiers(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    if (statSync(p).isDirectory()) return fichiers(p);
    return /\.(ts|tsx)$/.test(n) && !/\.test\.tsx?$/.test(n) ? [p] : [];
  });
}

function appelsDuFront(): string[] {
  const noms = new Set<string>();
  for (const f of fichiers(resolve(RACINE, 'src'))) {
    for (const m of readFileSync(f, 'utf8').matchAll(/\.rpc\(\s*['"`]([a-z_0-9]+)['"`]/g)) noms.add(m[1]!);
  }
  return [...noms].sort();
}

describe('les RPC du front et la liste du proxy', () => {
  it('lit bien des appels — le motif n a pas change', () => {
    expect(appelsDuFront().length).toBeGreaterThan(3);
  });

  it('laisse passer chaque fonction que le front appelle', () => {
    const refusees = appelsDuFront().filter((n) => !RPC_OUVERTES.has(n));
    expect(refusees, `le proxy refuserait en 403 : ${refusees.join(', ')}`).toEqual([]);
  });

  it("n'ouvre aucune fonction que le front n'appelle plus", () => {
    const front = new Set(appelsDuFront());
    const orphelines = [...RPC_OUVERTES].filter((n) => !front.has(n));
    expect(orphelines, `ouvertes sans appelant : ${orphelines.join(', ')}`).toEqual([]);
  });
});
