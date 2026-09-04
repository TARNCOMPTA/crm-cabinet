import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

/**
 * Le typecheck du front doit viser `tsconfig.app.json`, jamais `tsconfig.json`.
 * ---------------------------------------------------------------------------
 * ⚠️ `tsconfig.json` PORTE `"files": []`. C'est un fichier de REFERENCES vers
 * `tsconfig.app.json` et `tsconfig.node.json` — il ne contient aucun fichier a
 * verifier. `tsc --noEmit -p tsconfig.json` controle donc ZERO fichier et rend
 * 0, quoi qu'il y ait dans le code.
 *
 * Ce n'est pas une hypothese : `scripts/verifier-tout.mjs` a ete livre le
 * 2026-08-29 avec exactement cette commande. Pendant cinq jours,
 * `npm run test:tout` a affiche « typecheck front et serveur » en vert sans
 * lire une ligne de TypeScript. Une vraie erreur — un `File[]` passe la ou une
 * `FileList` etait attendue — est passee au vert le 2026-09-03 et n'a ete vue
 * que par la CI.
 *
 * Une commande de verification qui ne verifie rien est pire qu'aucune : elle
 * rassure. Cette garde tient ensemble les trois endroits qui doivent viser la
 * meme configuration — le script npm, la CI, et la totale locale.
 */

const lire = (chemin: string) => readFileSync(chemin, 'utf8');

describe('typecheck du front', () => {
  it('confirme que tsconfig.json ne verifie aucun fichier par lui-meme', () => {
    const racine = JSON.parse(lire('tsconfig.json')) as {
      files?: unknown[];
      references?: unknown[];
    };
    // Si un jour cette configuration reprend des fichiers, la garde ci-dessous
    // n'a plus lieu d'etre — et ce test dira qu'il faut la revoir.
    expect(racine.files, 'tsconfig.json ne doit rester qu un fichier de references').toEqual([]);
    expect(racine.references?.length ?? 0).toBeGreaterThan(0);
  });

  it('fait viser tsconfig.app.json au script npm', () => {
    const pkg = JSON.parse(lire('package.json')) as { scripts: Record<string, string> };
    expect(pkg.scripts.typecheck).toContain('tsconfig.app.json');
  });

  it('fait viser tsconfig.app.json a la CI', () => {
    const ci = lire('.github/workflows/ci.yml');
    expect(ci).toContain('tsc --noEmit -p tsconfig.app.json');
  });

  /**
   * La totale locale ne doit pas diverger de la CI. Le `--prefix server` est
   * exclu : le serveur a son propre `tsconfig.json`, qui lui contient bien des
   * fichiers.
   */
  it('ne laisse aucune commande typechecker le front avec tsconfig.json', () => {
    const suspects: string[] = [];
    for (const chemin of ['scripts/verifier-tout.mjs', '.github/workflows/ci.yml', 'package.json']) {
      const lignes = lire(chemin).split('\n');
      lignes.forEach((ligne, i) => {
        const nue = ligne.trim();
        // Les commentaires parlent DE ce piege : ils ne l'exécutent pas.
        if (/^(\/\/|#|--|\*)/.test(nue)) return;
        if (!/tsconfig\.json/.test(nue)) return;
        if (!/\btsc\b|typecheck/.test(nue)) return;
        // Le serveur a son propre `tsconfig.json`, qui contient de vrais
        // fichiers. En YAML, son `working-directory` est sur une ligne voisine.
        const contexte = lignes.slice(Math.max(0, i - 3), i + 1).join(' ');
        if (/server/.test(contexte)) return;
        suspects.push(`${chemin}:${i + 1} ${nue}`);
      });
    }
    expect(suspects, `typecheck du front sur tsconfig.json :\n${suspects.join('\n')}`).toEqual([]);
  });
});
