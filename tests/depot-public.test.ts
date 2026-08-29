import { describe, it, expect } from 'vitest';
import { execFileSync } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { EXCLUS } from '../scripts/publication-exclus.mjs';

/**
 * Rien de ce qu'on publie ne doit renvoyer au dépôt PRIVÉ.
 * ---------------------------------------------------------------------------
 * ⚠️ LE CRM ÉTAIT IMPOSSIBLE À INSTALLER POUR QUI N'EST PAS TARN COMPTA, et
 * personne ne pouvait s'en apercevoir d'ici. Cinq renvois visaient
 * `TARNCOMPTA/crmcabinet`, qui est privé :
 *
 *   · la commande d'installation du README et de la notice — 404 ;
 *   · `REPO=` dans `install.sh`, donc un `git clone` refusé pour celui qui
 *     trouvait tout de même le script ;
 *   · le lien du journal des versions, dans l'application elle-même.
 *
 * Un logiciel sous licence MIT que personne ne peut installer. Le mode de
 * défaillance est parfait : rien ne casse chez nous, tout marche chez nous, et
 * le confrère abandonne sans rien dire.
 *
 * ⚠️ CE DÉFAUT AVAIT DÉJÀ ÉTÉ CORRIGÉ UNE FOIS. `server/src/config.ts` porte le
 * constat, mot pour mot : « Un tiret séparait les deux dépôts. » La correction
 * n'avait pas été balayée sur les cinq autres renvois — c'est précisément ce
 * qu'un test attrape et qu'une relecture manque.
 *
 * La règle est étroite à dessein : on interdit les URL SUIVABLES, pas les
 * mentions. `README.md` doit pouvoir nommer le dépôt privé pour expliquer
 * pourquoi il existe, et `config.ts` pour raconter l'incident.
 */

const RACINE = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const PRIVE = /https:\/\/(raw\.githubusercontent\.com|github\.com)\/TARNCOMPTA\/crmcabinet/;
const PUBLIC_DEPOT = 'https://github.com/TARNCOMPTA/crm-cabinet';
const PUBLIC_BRUT = 'https://raw.githubusercontent.com/TARNCOMPTA/crm-cabinet';

/** Exactement ce que `scripts/publier.mjs` recopiera : suivis moins les gardes. */
function fichiersPublies(): string[] {
  const suivis = execFileSync('git', ['ls-files'], { cwd: RACINE, encoding: 'utf8' })
    .split('\n')
    .filter(Boolean);
  return suivis.filter(
    (f) => !EXCLUS.some((e: string) => (e.endsWith('/') ? f.startsWith(e) : f === e))
  );
}

/** Texte seulement : les binaires n'ont pas d'URL à suivre. */
const BINAIRE = /\.(png|jpe?g|gif|webp|ico|woff2?|pdf|zip|gz|xz|csv)$/i;

describe('ce que le depot public contiendra', () => {
  const fichiers = fichiersPublies();

  it('trouve bien un arbre a controler', () => {
    // Sans cette assertion, une selection cassee ferait passer la suite en ne
    // regardant rien — le pire des verts.
    expect(fichiers.length).toBeGreaterThan(300);
    expect(fichiers).toContain('installation/install.sh');
    expect(fichiers).toContain('README.md');
    // Et ce qui reste prive doit bien en etre absent.
    expect(fichiers).not.toContain('MIGRATION.md');
    expect(fichiers).not.toContain('src/components/habilitations/ServicesUsager.csv');
  });

  it('ne renvoie nulle part au depot prive', () => {
    const fautifs: string[] = [];
    for (const f of fichiers) {
      if (BINAIRE.test(f)) continue;
      const chemin = resolve(RACINE, f);
      if (!existsSync(chemin)) continue;
      readFileSync(chemin, 'utf8')
        .split('\n')
        .forEach((ligne, i) => {
          if (PRIVE.test(ligne)) fautifs.push(`${f}:${i + 1}  ${ligne.trim().slice(0, 90)}`);
        });
    }
    expect(fautifs, 'URL vers le depot prive dans un fichier publie').toEqual([]);
  });
});

describe('les trois chemins qu un confrere suit', () => {
  it('install.sh clone le depot public', () => {
    const s = readFileSync(resolve(RACINE, 'installation/install.sh'), 'utf8');
    expect(s).toContain(`REPO="${PUBLIC_DEPOT}.git"`);
  });

  it('la commande d installation du README et de la notice vise le depot public', () => {
    for (const f of ['README.md', 'installation/NOTICE-INSTALLATION.md']) {
      const s = readFileSync(resolve(RACINE, f), 'utf8');
      expect(s, f).toContain(`${PUBLIC_BRUT}/main/installation/install.sh`);
    }
  });

  /**
   * Celui-ci n'est pas une commande mais un lien DANS L'APPLICATION : le
   * confrère qui clique sur « journal des versions » depuis son instance.
   */
  it('le journal des versions est atteignable depuis l application', () => {
    const s = readFileSync(resolve(RACINE, 'src/pages/settings/SettingsMiseAJour.tsx'), 'utf8');
    expect(s).toContain(`${PUBLIC_DEPOT}/blob/main/CHANGELOG.md`);
  });

  /** Le seul qui était déjà correct — et dont la correction n'avait pas été balayée. */
  it('le manifeste de mise a jour vise toujours le depot public', () => {
    const s = readFileSync(resolve(RACINE, 'server/src/config.ts'), 'utf8');
    expect(s).toContain(`${PUBLIC_BRUT}/main/update/version.json`);
  });
});
