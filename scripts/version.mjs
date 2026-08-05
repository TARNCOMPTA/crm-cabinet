#!/usr/bin/env node
/**
 * Change le numéro de version, partout à la fois.
 * ---------------------------------------------------------------------------
 *
 *   node scripts/version.mjs 2.1.0
 *   node scripts/version.mjs 2.1.0 --notes "Suivi des echeances via jedeclare."
 *
 * Le numéro vit à SEPT endroits — deux `package.json`, leurs deux verrous,
 * `version.json`, `update/version.json` — et rien ne les tenait ensemble. Ils
 * avaient déjà divergé : les `package.json` annonçaient `0.0.0` quand le reste
 * disait `2.0.0`.
 *
 * Ce script est le seul endroit d'où on change le numéro ; `tests/version.test.ts`
 * est le filet qui casse la CI si quelqu'un l'a fait à la main quand même.
 *
 * CE QU'IL NE FAIT PAS, DÉLIBÉRÉMENT : ni commit, ni tag, ni poussée. Publier
 * est une décision, pas une conséquence de renommer un numéro — et le tag
 * déclenche la construction et la publication de l'image sur GHCR. Il affiche
 * la marche à suivre et s'arrête là.
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const RACINE = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const SEMVER = /^\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?$/;

function sortir(message) {
  console.error(`\n  ${message}\n`);
  process.exit(1);
}

const args = process.argv.slice(2);
const version = args[0];
const iNotes = args.indexOf('--notes');
const notes = iNotes === -1 ? null : args[iNotes + 1];

if (!version || version.startsWith('-')) {
  sortir(
    'Usage : node scripts/version.mjs <version> [--notes "…"]\n' +
      '  Exemple : node scripts/version.mjs 2.1.0'
  );
}
if (!SEMVER.test(version)) {
  sortir(`« ${version} » n'est pas un numéro semver (attendu X.Y.Z).`);
}

const lire = (chemin) => readFileSync(resolve(RACINE, chemin), 'utf8');

/**
 * Réécriture par expression régulière ANCRÉE sur la première clé du fichier,
 * et non par `JSON.parse` puis `stringify` : les verrous npm font des mégaoctets,
 * un aller-retour en réordonnerait les clés et produirait un diff illisible où
 * plus personne ne verrait la ligne qui compte.
 */
function remplacerVersion(chemin) {
  const avant = lire(chemin);
  const apres = avant.replace(/^(\s*"version":\s*)"[^"]*"/m, `$1"${version}"`);
  if (apres === avant) {
    const actuelle = avant.match(/^\s*"version":\s*"([^"]*)"/m)?.[1];
    if (actuelle === version) return false;
    sortir(`Aucune clé "version" modifiable dans ${chemin}.`);
  }
  writeFileSync(resolve(RACINE, chemin), apres);
  return true;
}

const FICHIERS = [
  'version.json',
  'package.json',
  'package-lock.json',
  'server/package.json',
  'server/package-lock.json',
];

const ancienne = JSON.parse(lire('version.json')).version;
const touches = FICHIERS.filter(remplacerVersion);

// Le manifeste porte aussi la note lue par les instances : c'est le seul texte
// qu'un administrateur voit avant de décider s'il met à jour.
const manifeste = JSON.parse(lire('update/version.json'));
manifeste.version = version;
if (notes) manifeste.notes = notes;
writeFileSync(
  resolve(RACINE, 'update/version.json'),
  `${JSON.stringify(manifeste, null, 2)}\n`
);
touches.push('update/version.json');

console.log(`\n  ${ancienne} → ${version}\n`);
for (const f of touches) console.log(`    ${f}`);

const premiereSection = lire('CHANGELOG.md').match(/^## (\d+\.\d+\.\d+[^\s—-]*)/m)?.[1];
const journalAJour = premiereSection === version;

if (!journalAJour) {
  console.log(
    `\n  ⚠ CHANGELOG.md ouvre sur « ${premiereSection ?? 'rien' } ».\n` +
      `    Ajoutez une section « ## ${version} — ${new Date().toISOString().slice(0, 10)} »\n` +
      `    avant de publier : le test de version refuse de passer sans elle.`
  );
}
if (!notes) {
  console.log(
    `\n  ⚠ La note du manifeste n'a pas été touchée. C'est le seul texte que\n` +
      `    l'administrateur d'un cabinet lit avant de décider de mettre à jour.\n` +
      `    Pour la changer : --notes "…"`
  );
}

console.log(
  `\n  Ensuite, et seulement quand tout est vert :\n\n` +
    `    git commit -am "Version ${version}"\n` +
    `    git tag v${version} && git push --tags\n\n` +
    `  Le tag déclenche la construction de l'image et sa publication sur GHCR,\n` +
    `  après les six jobs de la CI. Les instances verront la mise à jour dès que\n` +
    `  update/version.json sera sur la branche par défaut.\n`
);
