/**
 * Ce que l'écran du connecteur dit pouvoir être écrit, tenu avec le serveur.
 * ---------------------------------------------------------------------------
 * Le serveur ne peut pas être importé par le front (`rootDir: "src"`), ni
 * l'inverse : on lit donc la source de `server/src/mcp/outils.ts` et l'on y
 * relève chaque outil dont le nom commence par `set_` — la convention de tous
 * les outils d'écriture. Même motif que `champs-fiche-jumelles.test.ts`.
 *
 * ⚠️ CE QUI TOMBE ICI, C'EST UN ÉCRAN DE SÉCURITÉ QUI MENT PAR OMISSION. Il a
 * dit deux fois moins que la vérité ; la troisième doit se voir en CI.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ECRITURES_CONNECTEUR, PORTEE_ECRITURE } from '../src/lib/porteeConnecteur';
import { OUTILS_MCP } from '../src/lib/outilsMcp';

const RACINE = resolve(dirname(fileURLToPath(import.meta.url)), '..');

function outilsEcritureDuServeur(): string[] {
  const source = readFileSync(resolve(RACINE, 'server/src/mcp/outils.ts'), 'utf8');
  return [...new Set([...source.matchAll(/nom:\s*'(set_[a-z_]+)'/g)].map((m) => m[1]!))].sort();
}

describe('la portee d ecriture annoncee par l ecran du connecteur', () => {
  it('lit bien des outils dans le serveur — le motif n a pas change', () => {
    expect(outilsEcritureDuServeur().length).toBeGreaterThan(0);
  });

  it('nomme exactement les outils d ecriture du serveur, ni plus ni moins', () => {
    const ecran = ECRITURES_CONNECTEUR.map((e) => e.outil).sort();
    expect(ecran).toEqual(outilsEcritureDuServeur());
  });

  /* L'ecran liste aussi les outils, avec un drapeau `ecrit` : trois listes, une verite. */
  it('s accorde avec les outils marques « ecrit » dans outilsMcp', () => {
    const marques = OUTILS_MCP.filter((o) => o.ecrit).map((o) => o.nom).sort();
    expect(ECRITURES_CONNECTEUR.map((e) => e.outil).sort()).toEqual(marques);
  });

  it('en fait une phrase qui les cite tous', () => {
    for (const e of ECRITURES_CONNECTEUR) expect(PORTEE_ECRITURE).toContain(e.libelle);
  });
});
