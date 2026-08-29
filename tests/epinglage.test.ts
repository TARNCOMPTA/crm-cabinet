import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Rien de ce qui s'exécute ici ne doit être désigné par une étiquette mobile.
 * ---------------------------------------------------------------------------
 * Une action GitHub tourne sur le runner AVEC le jeton du workflow, et l'image
 * de base devient ce que le cabinet exécute. Dans les deux cas, une étiquette
 * (`@v7`, `:22-alpine`) désigne ce que son auteur voudra bien y mettre demain :
 * la repointer sur un commit hostile ne demande aucune effraction de ce dépôt.
 *
 * ⚠️ CE TEST EST LA MOITIÉ D'UN COUPLE. `.github/dependabot.yml` est l'autre :
 * un épinglage sans mise à jour automatique fige les failles avec le reste.
 * Si l'un des deux disparaît, l'autre devient nuisible — d'où l'assertion qui
 * vérifie que le fichier Dependabot existe encore.
 *
 * Le contrôle est textuel et volontairement bête : il ne dit pas que le SHA est
 * le bon, il dit qu'il y en a un. Vérifier la correspondance étiquette → commit
 * demanderait d'interroger GitHub depuis la suite de tests, ce qui la rendrait
 * dépendante du réseau pour un gain nul — c'est le travail de Dependabot.
 */

const RACINE = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DOSSIER = resolve(RACINE, '.github/workflows');

const workflows = readdirSync(DOSSIER)
  .filter((f) => f.endsWith('.yml') || f.endsWith('.yaml'))
  .map((f) => ({ nom: f, texte: readFileSync(resolve(DOSSIER, f), 'utf8') }));

/** `uses: proprietaire/action@ref`, en ignorant les actions locales (`./`). */
function actionsDe(texte: string): { ligne: number; ref: string }[] {
  return texte
    .split('\n')
    .map((l, i) => ({ ligne: i + 1, l }))
    .filter(({ l }) => /^\s*-?\s*uses:\s*[^./]/.test(l))
    .map(({ ligne, l }) => ({ ligne, ref: l.replace(/^\s*-?\s*uses:\s*/, '').split('#')[0].trim() }));
}

describe('epinglage des actions GitHub', () => {
  it('trouve bien des actions a controler', () => {
    const total = workflows.reduce((n, w) => n + actionsDe(w.texte).length, 0);
    // Sans cette assertion, un changement de format ferait passer la suite en
    // ne trouvant plus rien — le pire des verts.
    expect(total).toBeGreaterThan(10);
  });

  for (const { nom, texte } of workflows) {
    it(`${nom} : chaque action est figee sur un SHA de commit`, () => {
      const mobiles = actionsDe(texte)
        .filter(({ ref }) => !/@[0-9a-f]{40}$/.test(ref))
        .map(({ ligne, ref }) => `${nom}:${ligne} ${ref}`);
      expect(mobiles, 'actions designees par une etiquette mobile').toEqual([]);
    });

    it(`${nom} : chaque SHA garde son etiquette en commentaire`, () => {
      // Le SHA seul est illisible : plus personne ne sait quelle version tourne,
      // et Dependabot lit ce commentaire pour proposer la suivante.
      const sansEtiquette = texte
        .split('\n')
        .map((l, i) => ({ ligne: i + 1, l }))
        .filter(({ l }) => /uses:\s*[^./].*@[0-9a-f]{40}/.test(l))
        .filter(({ l }) => !/#\s*v?\d/.test(l))
        .map(({ ligne, l }) => `${nom}:${ligne} ${l.trim()}`);
      expect(sansEtiquette).toEqual([]);
    });
  }
});

describe('epinglage de l image de base', () => {
  const dockerfile = readFileSync(resolve(RACINE, 'Dockerfile'), 'utf8');

  it('chaque FROM porte un digest', () => {
    const froms = dockerfile
      .split('\n')
      .map((l, i) => ({ ligne: i + 1, l }))
      .filter(({ l }) => /^FROM\s/.test(l));

    expect(froms.length).toBeGreaterThan(0);
    const sansDigest = froms
      .filter(({ l }) => !/@sha256:[0-9a-f]{64}/.test(l))
      .map(({ ligne, l }) => `Dockerfile:${ligne} ${l.trim()}`);
    expect(sansDigest, 'etages construits sur une etiquette mobile').toEqual([]);
  });

  it('les trois etages partent du MEME digest', () => {
    // Trois socles differents donneraient une image dont on ne sait plus de
    // quoi elle est faite, et tripleraient la surface a suivre.
    const digests = new Set(
      [...dockerfile.matchAll(/^FROM\s+\S+@(sha256:[0-9a-f]{64})/gm)].map((m) => m[1])
    );
    expect([...digests]).toHaveLength(1);
  });
});

describe('l autre moitie du couple', () => {
  it('la configuration Dependabot existe et couvre actions et docker', () => {
    const dependabot = readFileSync(resolve(RACINE, '.github/dependabot.yml'), 'utf8');
    expect(dependabot).toMatch(/package-ecosystem:\s*github-actions/);
    expect(dependabot).toMatch(/package-ecosystem:\s*docker/);
  });
});
