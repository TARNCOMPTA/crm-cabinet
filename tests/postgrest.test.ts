import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * La version de PostgREST, et ses trois copies.
 * ---------------------------------------------------------------------------
 * Elle est épinglée à trois endroits sans lien entre eux :
 *
 *   · `docker-compose.yml`         — l'autorité : ce qu'un cabinet installe ;
 *   · `docker-compose.partage.yml` — la variante mutualisée ;
 *   · `.github/workflows/ci.yml`   — le binaire que le job `navigateur` tire de
 *     GitHub pour monter la pile.
 *
 * Rien ne les tenait ensemble, et ils avaient divergé : la CI exerçait le
 * produit contre la v14.16 pendant que les instances tournaient en v12.2.3.
 *
 * Ce qui rend cet écart-là dangereux, c'est qu'il ne se signale pas. Le job
 * restait vert, le produit fonctionnait, et le parcours de bout en bout —
 * précisément celui qui doit prouver que l'application marche telle qu'elle est
 * livrée — la prouvait contre un PostgREST que personne n'installe. Le front
 * compte 70 requêtes qui reposent sur la sémantique de PostgREST : filtres
 * `or`, sélections imbriquées, `count=exact`. Une divergence sur l'une d'elles
 * ne se serait vue ni ici ni en CI, mais chez le cabinet.
 *
 * Même parti pris que `tests/version.test.ts` : deux littéraux à tenir ensemble
 * ne le garantissent pas, un test le garantit.
 */

const RACINE = resolve(dirname(fileURLToPath(import.meta.url)), '..');

function lire(chemin: string): string {
  return readFileSync(resolve(RACINE, chemin), 'utf8');
}

/** `image: postgrest/postgrest:v12.2.3` */
function versionDuCompose(chemin: string): string | undefined {
  return lire(chemin).match(/postgrest\/postgrest:(v[\d.]+)/)?.[1];
}

const REFERENCE = versionDuCompose('docker-compose.yml');
const CI = lire('.github/workflows/ci.yml');

describe('version de PostgREST', () => {
  it('est épinglée dans docker-compose.yml', () => {
    expect(REFERENCE, 'docker-compose.yml n’épingle aucune version de PostgREST').toMatch(
      /^v\d+\.\d+\.\d+$/
    );
  });

  it('est la même dans docker-compose.partage.yml', () => {
    expect(
      versionDuCompose('docker-compose.partage.yml'),
      `docker-compose.partage.yml épingle une autre version que docker-compose.yml (${REFERENCE}).`
    ).toBe(REFERENCE);
  });

  /**
   * Le point de tout ce fichier : la CI monte la pile pour exercer le produit
   * tel qu'un cabinet l'exécute. Contre un autre PostgREST, elle valide une
   * sémantique qui n'est pas celle de la production.
   */
  it('est celle que la CI télécharge', () => {
    const tag = CI.match(/PostgREST\/postgrest\/releases\/download\/(v[\d.]+)\//)?.[1];

    expect(tag, 'ci.yml ne télécharge aucune version de PostgREST').toBeTruthy();
    expect(
      tag,
      `ci.yml prend PostgREST ${tag}, la production ${REFERENCE}. Le job « navigateur » ` +
        'exercerait alors une sémantique que personne n’installe.'
    ).toBe(REFERENCE);
  });

  /**
   * ⚠️ Le nom de l'archive a CHANGÉ entre les versions majeures : la v12 la
   * publie en `-linux-static-x64`, la v14 en `-linux-static-x86-64`. Recopier le
   * numéro sans relire le nom donne un 404 — donc un job rouge sur une étape qui
   * n'a rien à voir avec le code proposé, et un quart d'heure perdu à chercher
   * ailleurs.
   */
  it('porte le même numéro dans l’adresse et dans le nom de l’archive', () => {
    const archive = CI.match(/postgrest-(v[\d.]+)-linux-static-[\w-]+\.tar\.xz/)?.[1];

    expect(archive, 'ci.yml ne nomme aucune archive PostgREST').toBeTruthy();
    expect(
      archive,
      `l’adresse demande ${REFERENCE} et le fichier s’appelle ${archive} : ` +
        'la publication GitHub répondra 404.'
    ).toBe(REFERENCE);
  });
});
