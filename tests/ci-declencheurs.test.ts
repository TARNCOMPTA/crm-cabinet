import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * La CI ne doit pas s'exécuter deux fois sur le même code.
 * ---------------------------------------------------------------------------
 * ⚠️ CE DÉPÔT EST PRIVÉ : LES MINUTES ACTIONS SONT FACTURÉES, et le
 * 2026-08-29 au matin le compte avait atteint sa limite de dépense — plus aucun
 * job ne démarrait, sur aucune branche. GitHub ne l'écrit pas dans le journal,
 * qui reste vide, mais en annotation du job : la CI a l'air en échec alors
 * qu'elle n'a simplement pas eu lieu.
 *
 * Deux gaspillages y menaient, mesurés :
 *   · `push: ['**']` faisait tourner la CI sur la branche de travail PUIS sur
 *     `main` après le fast-forward — deux fois le même commit, vingt minutes
 *     pour un seul état du code ;
 *   · une branche Dependabot déclenchait `push` ET `pull_request`. Le
 *     2026-08-28 au soir, leur activation a produit 20 exécutions sur 10
 *     branches, dont 10 en pure perte.
 *
 * `push` limité à `main` règle les deux d'un coup : les branches passent par
 * `pull_request`, une fois.
 *
 * ⚠️ LECTURE TEXTUELLE, PAS D'ANALYSEUR YAML, et c'est délibéré : `js-yaml`
 * n'est ici qu'une dépendance transitive de la chaîne de construction. S'y
 * appuyer ferait tomber ce test le jour où un verrou de dépendances change,
 * pour une raison sans aucun rapport avec ce qu'il garde. Même parti pris que
 * `tests/epinglage.test.ts`.
 */

const RACINE = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const ci = readFileSync(resolve(RACINE, '.github/workflows/ci.yml'), 'utf8');
const dependabot = readFileSync(resolve(RACINE, '.github/dependabot.yml'), 'utf8');

/**
 * Les lignes filles d'une clé de deuxième niveau (`  push:` → tout ce qui est
 * indenté davantage). Découpage par lignes plutôt que par expression
 * régulière : une regex sur un bloc YAML se trompe de frontière dès qu'un
 * commentaire s'y glisse, et rendait ici une chaîne vide — donc un test qui
 * passait en ne regardant rien.
 */
function sousBloc(texte: string, cle: string): string {
  const lignes = texte.split('\n');
  const debut = lignes.findIndex((l) => l.startsWith(`  ${cle}:`));
  if (debut === -1) return '';
  const filles: string[] = [];
  for (let i = debut + 1; i < lignes.length; i += 1) {
    const l = lignes[i];
    if (l.trim() === '' || l.startsWith('    ')) filles.push(l);
    else break;
  }
  return filles.join('\n');
}

const blocPush = sousBloc(ci, 'push');

describe('declencheurs de la CI', () => {
  it('ne declenche sur poussee que pour main', () => {
    // Sans cette premiere assertion, une extraction cassee rendrait le reste
    // du test muet : c'est exactement ce qui est arrive en l'ecrivant.
    expect(blocPush.trim().length, 'le bloc push doit avoir ete extrait').toBeGreaterThan(0);
    expect(blocPush, 'push doit se limiter a main').toMatch(/branches:\s*\[main\]/);
    // Une branche de travail poussee seule ne doit plus rien declencher : c'est
    // la depense supprimee.
    expect(blocPush).not.toMatch(/\*\*/);
  });

  /**
   * ⚠️ `branches` ET `branches-ignore` SONT EXCLUSIFS chez GitHub. Les deux
   * ensemble rendent le workflow invalide, et il ne se déclenche plus DU TOUT
   * — un silence qui ressemble à s'y méprendre à une CI qui passe.
   */
  it('ne melange pas branches et branches-ignore', () => {
    expect(blocPush).not.toMatch(/branches-ignore:/);
  });

  it('couvre tout de meme ces branches, par la demande de fusion', () => {
    expect(ci).toMatch(/^\s{2}pull_request:/m);
  });

  it('annule une execution rendue caduque par la poussee suivante', () => {
    expect(ci).toMatch(/^concurrency:/m);
    /**
     * ⚠️ JAMAIS SUR `main`. La garde du déploiement lit les exécutions du
     * COMMIT : une exécution annulée y compte comme un échec, et refuserait un
     * déploiement légitime.
     */
    expect(ci).toMatch(/cancel-in-progress:.*github\.ref != 'refs\/heads\/main'/);
  });
});

describe('Dependabot', () => {
  const limites = [...dependabot.matchAll(/^\s*open-pull-requests-limit:\s*(\d+)/gm)]
    .map((m) => Number(m[1]));

  it('declare une limite pour chaque ecosysteme suivi', () => {
    const ecosystemes = [...dependabot.matchAll(/^\s*-\s*package-ecosystem:/gm)].length;
    expect(ecosystemes).toBeGreaterThan(0);
    expect(limites).toHaveLength(ecosystemes);
  });

  it('plafonne ce qu il ouvre : chaque demande coute une CI complete', () => {
    for (const l of limites) expect(l).toBeLessThanOrEqual(3);
    // La volée du 2026-08-28 en avait ouvert dix d'un coup.
    expect(limites.reduce((a, b) => a + b, 0)).toBeLessThanOrEqual(12);
  });
});

/**
 * Les quatre jobs `build`, `serveur`, `quality` et `test` ont été réunis en un
 * seul — quatre arrondis à la minute et cinq `npm ci` pour trois minutes de
 * travail réel. La fusion a été vérifiée commande par commande : 105 avant,
 * 105 après.
 *
 * ⚠️ CE QUI PEUT ARRIVER ENSUITE, ET QUE CE TEST GARDE : dans un job unique de
 * quinze étapes, en retirer une ne se voit pas. Un job entier qui disparaît se
 * remarque ; une étape au milieu d'une liste, non.
 */
describe('le job de verification porte encore tous les controles', () => {
  const ci = readFileSync(resolve(RACINE, '.github/workflows/ci.yml'), 'utf8');

  it.each([
    ['la construction du front', 'npm run build'],
    ['le poids du precache', 'scripts/poids-precache.mjs'],
    ['le decoupage du bundle', 'scripts/verifier-decoupage.mjs'],
    ['les tests unitaires', 'npm test'],
    ['le cliquet typecheck', 'MAX_TSC_ERRORS'],
    ['le cliquet eslint', 'MAX_ESLINT_ERRORS'],
    ['la recherche de secrets en dur', 'Aucun secret en dur'],
    ['le typecheck du serveur', 'tsconfig.json'],
    ['les dependances du serveur', 'working-directory: server'],
  ])('garde %s', (_quoi, marqueur) => {
    expect(ci).toContain(marqueur);
  });
});
