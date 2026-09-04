#!/usr/bin/env node
/**
 * La totale, et surtout : ELLE ECHOUE SI UNE SUITE S'IGNORE.
 * ---------------------------------------------------------------------------
 *
 *   npm run test:tout
 *
 * ⚠️ CE QUE CETTE COMMANDE EXISTE POUR EMPECHER.
 *
 * `npm test` affiche « 643 passed | 110 skipped ». Les 110 ne sont pas des cas
 * marginaux : ce sont `schema.test.ts`, `mcp-sql.test.ts` et `e2e.test.ts`,
 * c'est-a-dire TOUTE la couche base de donnees et TOUTE la couche navigateur.
 * Elles s'ignorent d'elles-memes faute de `DATABASE_URL_TEST` et de
 * `E2E_BASE_URL`, exactement comme `describe.skip`.
 *
 * Le probleme n'est pas qu'elles s'ignorent — c'est raisonnable sur un poste
 * sans base. Le probleme est que SAUTER RESSEMBLE A REUSSIR : la sortie est
 * verte, le compte est gros, et rien ne distingue « tout va bien » de « on n'a
 * pas regarde ». Le 2026-08-29, une regression est partie en CI pour ce motif :
 * un test e2e cherchait « repartition » quand le produit ecrivait
 * « répartition ». Une instance tournait a portee de main.
 *
 * Ici, un test ignore est un ECHEC. C'est tout l'objet du fichier.
 *
 * Prealable : `sh scripts/harnais.sh`.
 */

import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const RACINE = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const PORT_PG = process.env.HARNAIS_PORT_PG ?? '5433';
const PORT_APP = process.env.HARNAIS_PORT_APP ?? '3100';
const SECRET = process.env.HARNAIS_SECRET ?? 'harnais-local-sans-valeur-hors-de-ce-poste';
const MAIL_ADMIN = process.env.HARNAIS_ADMIN ?? 'expert@cabinet-demo.invalid';
const BASE = process.env.E2E_BASE_URL ?? `http://localhost:${PORT_APP}`;

/** ⚠️ JAMAIS la base de l'instance : les suites de schema y font `DROP SCHEMA`. */
const URL_TEST =
  process.env.DATABASE_URL_TEST ?? `postgresql://postgres@127.0.0.1:${PORT_PG}/crmcabinet_test`;
const URL_APP = `postgresql://postgres@127.0.0.1:${PORT_PG}/crmcabinet`;

function sortir(message, conseil) {
  console.error(`\n  ✗ ${message}\n`);
  if (conseil) console.error(`    ${conseil}\n`);
  process.exit(1);
}

function etape(titre) {
  console.log(`\n─── ${titre}`);
}

function lancer(commande, args, options = {}) {
  const r = spawnSync(commande, args, { cwd: RACINE, stdio: 'inherit', ...options });
  return r.status === 0;
}

// --- 1. Le harnais repond-il ? ------------------------------------------------
etape('Harnais');
let sante;
try {
  const r = await fetch(`${BASE}/api/sante`, { signal: AbortSignal.timeout(5000) });
  sante = await r.json();
} catch {
  sortir(
    `Aucune instance ne repond sur ${BASE}.`,
    'Demarrez-la : sh scripts/harnais.sh'
  );
}
console.log(`  instance ${sante.version} sur ${BASE}`);

try {
  execFileSync('psql', [URL_TEST, '-tAc', 'SELECT 1'], { stdio: 'pipe' });
} catch {
  sortir(
    `La base d'essai est injoignable : ${URL_TEST}`,
    'Demarrez le harnais : sh scripts/harnais.sh'
  );
}
console.log('  base d’essai jetable : crmcabinet_test');

// --- 2. Un code d'enrolement frais --------------------------------------------
// Il est a usage unique et la suite e2e le consomme : il en faut un par
// execution, sinon le deuxieme lancement echoue sur l'enrolement et le journal
// accuse la passkey au lieu du code.
let code;
try {
  const sortie = execFileSync('node', ['server/dist/cli/enrolement.js', '--creer', MAIL_ADMIN, 'Camille', 'MARTY', 'admin'], {
    cwd: RACINE,
    encoding: 'utf8',
    env: { ...process.env, DATABASE_URL: URL_APP, SESSION_SECRET: SECRET },
  });
  code = sortie.match(/[A-Z0-9]{5}-[A-Z0-9]{5}/)?.[0];
} catch (e) {
  sortir("Impossible de delivrer un code d'enrolement.", String(e.message).split('\n')[0]);
}
if (!code) sortir("Le CLI d'enrolement n'a rendu aucun code.");
console.log(`  code d’enrolement : ${code}`);

// --- 2 bis. Remettre la fiche temoin a vide ------------------------------------
// ⚠️ SANS CELA, LA COMMANDE NE PASSE QU'UNE FOIS. Le test « permet de completer
// les champs manquants » REMPLIT `SANS EMAIL SARL` — e-mail, numero de dossier,
// regime, cloture — puis verifie apres rechargement que les valeurs viennent
// bien de la base. Au deuxieme lancement la fiche n'a plus de champ vide a
// completer, et l'echec accuse l'ecran de saisie au lieu de l'etat de la base.
//
// On ne rase pas toute la base pour autant : quelqu'un peut etre en train de
// se promener dans l'instance. On remet a zero ce que la suite ecrit, rien de
// plus.
try {
  execFileSync(
    'psql',
    [
      URL_APP,
      '-q',
      '-c',
      `UPDATE clients SET email = NULL, numero_dossier = NULL, regime_fiscal = NULL,
         date_cloture = NULL WHERE nom_entreprise = 'SANS EMAIL SARL'`,
    ],
    { stdio: 'pipe' }
  );
  console.log('  fiche temoin « SANS EMAIL SARL » remise a vide');
} catch (e) {
  sortir('Impossible de remettre la fiche temoin a vide.', String(e.message).split('\n')[0]);
}

// --- 3. Types et style ---------------------------------------------------------
etape('Types et style');
// ⚠️ `npm run typecheck`, ET SURTOUT PAS `tsc -p tsconfig.json`.
//
// `tsconfig.json` porte `"files": []` : c'est un fichier de REFERENCES vers
// `tsconfig.app.json` et `tsconfig.node.json`, il ne verifie aucun fichier par
// lui-meme. `tsc --noEmit -p tsconfig.json` controle donc ZERO fichier et rend
// toujours 0 — un vert qui ne veut rien dire.
//
// C'est ce que faisait cette ligne depuis 8b00d80, et ca s'est vu le
// 2026-09-03 : une vraie erreur de type dans `BilanCardDetailModal.tsx`
// passait `npm run test:tout` au vert. Seule la CI l'a vue, parce qu'elle
// lance `tsc -p tsconfig.app.json`. Une commande de verification qui ne
// verifie rien est pire qu'aucune : elle rassure.
//
// `npm run typecheck` est la MEME commande que la CI et que le README.
if (!lancer('npm', ['run', 'typecheck'])) sortir('Le typecheck du front echoue.');
if (!lancer('npm', ['run', 'typecheck', '--prefix', 'server'])) sortir('Le typecheck du serveur echoue.');
if (!lancer('npx', ['eslint', '.'])) sortir('eslint signale des erreurs.');

// --- 4. Les tests, TOUS ---------------------------------------------------------
etape('Tests');
const dossier = mkdtempSync(join(tmpdir(), 'crm-verif-'));
const rapport = join(dossier, 'vitest.json');
const env = {
  ...process.env,
  DATABASE_URL_TEST: URL_TEST,
  E2E_BASE_URL: BASE,
  E2E_CODE_ENROLEMENT: code,
};
const ok = lancer('npx', ['vitest', 'run', '--reporter=default', '--reporter=json', `--outputFile=${rapport}`], { env });

let resultat;
try {
  resultat = JSON.parse(readFileSync(rapport, 'utf8'));
} catch {
  rmSync(dossier, { recursive: true, force: true });
  sortir('Le rapport JSON de vitest est illisible.');
}
rmSync(dossier, { recursive: true, force: true });

// --- 5. LA GARDE : un test ignore est un echec ------------------------------------
const ignores = [];
for (const fichier of resultat.testResults ?? []) {
  for (const cas of fichier.assertionResults ?? []) {
    if (cas.status === 'pending' || cas.status === 'skipped' || cas.status === 'todo') {
      ignores.push(`${fichier.name.replace(RACINE + '/', '')} › ${cas.fullName ?? cas.title}`);
    }
  }
}

console.log('');
if (ignores.length > 0) {
  const fichiers = [...new Set(ignores.map((l) => l.split(' › ')[0]))];
  console.error(`  ✗ ${ignores.length} test(s) ignore(s), dans ${fichiers.length} fichier(s) :\n`);
  for (const f of fichiers) console.error(`      ${f}`);
  console.error(
    '\n    Un test ignore n’est pas un test qui passe. Ces suites attendent une\n' +
      '    variable d’environnement ; le harnais est cense la fournir.\n'
  );
  process.exit(1);
}

if (!ok) sortir('Des tests echouent.');

console.log(`  ✓ ${resultat.numPassedTests} tests passes, aucun ignore.`);
console.log('  ✓ typecheck front et serveur, eslint.\n');
