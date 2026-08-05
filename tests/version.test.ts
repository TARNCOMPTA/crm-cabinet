import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Le numéro de version, et ses quatre copies.
 * ---------------------------------------------------------------------------
 * Il est écrit à cinq endroits sans lien entre eux :
 *
 *   · `version.json`          — l'autorité. C'est lui que la CI confronte au tag ;
 *   · `update/version.json`   — le manifeste que LES INSTANCES INTERROGENT ;
 *   · `package.json`          — le paquet du front ;
 *   · `server/package.json`   — celui du serveur ;
 *   · `CHANGELOG.md`          — la section du haut.
 *
 * Rien ne les tenait ensemble. Ils avaient déjà divergé : les deux `package.json`
 * annonçaient `0.0.0` quand tout le reste disait `2.0.0`.
 *
 * La CI comparait bien le tag à `version.json` et à `update/version.json` — mais
 * seulement au moment de PUBLIER, dans le job `image` déclenché par un tag. Entre
 * deux publications, la dérive était invisible ; on ne la découvrait qu'en
 * poussant le tag, c'est-à-dire au pire moment.
 *
 * D'où ce test, qui tourne à chaque poussée. Le mode de défaillance qu'il
 * couvre est celui-ci, et il est silencieux : `update/version.json` resté en
 * arrière fait qu'AUCUNE instance ne voit la mise à jour — elles interrogent un
 * manifeste qui annonce la version qu'elles ont déjà. Le produit continue de
 * fonctionner, personne ne se plaint, et les cabinets restent sur une version
 * périmée sans le savoir.
 *
 * C'est le parti pris de `tests/version.test.ts` de TNS Pilot, où la même dérive
 * avait laissé une page de connexion demander ses feuilles de style sous une clé
 * de cache périmée pendant deux versions.
 */

const RACINE = resolve(dirname(fileURLToPath(import.meta.url)), '..');

function lire(chemin: string): string {
  return readFileSync(resolve(RACINE, chemin), 'utf8');
}

function versionDe(cheminJson: string): unknown {
  return (JSON.parse(lire(cheminJson)) as { version?: unknown }).version;
}

const REFERENCE = String(versionDe('version.json'));

describe('numéro de version', () => {
  it('est un numéro sémantique', () => {
    expect(REFERENCE, 'version.json ne porte pas un numéro X.Y.Z').toMatch(
      /^\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?$/
    );
  });

  for (const fichier of ['package.json', 'server/package.json', 'update/version.json']) {
    it(`est le même dans ${fichier}`, () => {
      expect(
        versionDe(fichier),
        `${fichier} annonce une autre version que version.json (${REFERENCE}). ` +
          `Passez par « node scripts/version.mjs <version> » plutôt qu'à la main.`
      ).toBe(REFERENCE);
    });
  }

  /**
   * Le manifeste est le SEUL fichier que les instances lisent. Une note vide, et
   * l'administrateur voit « une mise à jour existe » sans savoir ce qu'elle
   * apporte — donc il ne l'applique pas.
   */
  it('le manifeste public porte une note et une adresse', () => {
    const manifeste = JSON.parse(lire('update/version.json')) as {
      notes?: string;
      url?: string;
    };
    expect(manifeste.notes?.trim(), 'update/version.json sans note').toBeTruthy();
    expect(manifeste.url, 'update/version.json sans url').toMatch(/^https:\/\//);
  });

  /**
   * Le journal doit ANNONCER la version en cours de préparation, pas la
   * précédente. Sans cela, publier une version dont le journal ne parle pas :
   * l'administrateur lit des notes qui décrivent ce qu'il a déjà.
   */
  it('la première section du CHANGELOG est celle-ci', () => {
    const premiere = lire('CHANGELOG.md').match(/^## (\d+\.\d+\.\d+[^\s—-]*)/m)?.[1];

    expect(premiere, 'aucune section « ## X.Y.Z » dans CHANGELOG.md').toBeTruthy();
    expect(
      premiere,
      `CHANGELOG.md ouvre sur ${premiere}, alors que la version préparée est ${REFERENCE}`
    ).toBe(REFERENCE);
  });
});
