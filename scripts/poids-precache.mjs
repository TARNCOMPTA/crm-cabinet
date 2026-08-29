/**
 * Le poids de ce que le service worker précharge, mesuré sur le disque.
 * ---------------------------------------------------------------------------
 * POURQUOI CE CLIQUET EXISTE. Le precache valait 3 190 Ko : TOUT le bundle, y
 * compris les morceaux que le code ne charge qu'à la demande. Le tableur
 * (420 Ko), l'export PDF d'une fiche client (424 Ko) et son moteur de capture
 * (200 Ko) étaient donc téléchargés par chaque appareil À CHAQUE MISE À JOUR de
 * l'instance — alors que la plupart des collaborateurs ne les ouvrent jamais.
 * `globIgnores` dans `vite.config.ts` les a écartés ; ce script empêche le
 * poids de remonter sans qu'on s'en aperçoive.
 *
 * ⚠️ LES TAILLES SONT LUES SUR LES FICHIERS, PAS DANS LE MANIFESTE. Celui-ci ne
 * porte que `url` et `revision` — aucune taille. Une première version cherchait
 * un champ `size` qui n'existe pas et rendait donc 0 Ko : un cliquet qui mesure
 * zéro passe toujours, ce qui est pire que pas de cliquet du tout. D'où le
 * refus explicite du total nul, plus bas.
 *
 * Employé par le job `build` de la CI, et lançable à la main après un
 * `npm run build` :  node scripts/poids-precache.mjs [plafondKo]
 */

import { readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const DIST = 'dist';
const plafondKo = Number(process.argv[2] ?? 0);

let sw;
try {
  sw = readFileSync(join(DIST, 'sw.js'), 'utf8');
} catch {
  console.error(`Aucun ${DIST}/sw.js : lance d'abord « npm run build ».`);
  process.exit(1);
}

const urls = [...sw.matchAll(/url:"([^"]+)"/g)].map((m) => m[1]);
if (urls.length === 0) {
  console.error('Manifeste de precache illisible : aucune entrée trouvée dans sw.js.');
  process.exit(1);
}

let octets = 0;
const manquants = [];
for (const url of urls) {
  try {
    octets += statSync(join(DIST, url)).size;
  } catch {
    manquants.push(url);
  }
}

const ko = Math.round(octets / 1024);
console.log(`Precache : ${urls.length} entrées, ${ko} Ko${plafondKo ? ` (plafond ${plafondKo} Ko)` : ''}`);

// Un total nul veut dire que la mesure est cassée, pas que le precache est vide.
if (octets === 0) {
  console.error('::error::Precache mesuré à 0 Ko : le cliquet ne mesure plus rien, corrige-le.');
  process.exit(1);
}
if (manquants.length) {
  console.error(`::error::${manquants.length} fichier(s) du manifeste absents de ${DIST} : ${manquants.slice(0, 5).join(', ')}`);
  process.exit(1);
}
if (plafondKo && ko > plafondKo) {
  console.error(`::error::Regression : precache de ${ko} Ko pour un plafond de ${plafondKo} Ko.`);
  process.exit(1);
}
