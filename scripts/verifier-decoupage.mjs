/**
 * Chaque morceau « vendor » contient-il ce que son nom annonce ?
 * ---------------------------------------------------------------------------
 * POURQUOI CE CONTRÔLE EXISTE. En passant à Vite 8, qui empaquette avec
 * Rolldown, le découpage manuel s'est cassé DEUX FOIS, et la seconde est celle
 * qui a motivé ce script :
 *
 *   1. la table de correspondance d'origine échouait franchement, sur
 *      « manualChunks is not a function » — un défaut visible ;
 *   2. réécrite en fonction, elle CONSTRUISAIT SANS ERREUR MAIS GROUPAIT FAUX.
 *      `vendor-react` tombait de 176 à 39 Ko pendant que `vendor-dnd` passait de
 *      52 à 183 Ko et se retrouvait porteur de `react-dom`. Aucune erreur, aucun
 *      test rouge, un bundle simplement mal découpé — donc un cache qui
 *      s'invalide de travers, sans que rien ne le signale.
 *
 * Un découpage muet et faux est pire que celui qui plante. D'où ce contrôle,
 * lancé par le job `build` de la CI, et à la main après `npm run build` :
 *   node scripts/verifier-decoupage.mjs
 *
 * ⚠️ LES MARQUEURS SONT CHOISIS POUR SURVIVRE À LA MINIFICATION, et vérifiés
 * comme tels : ce sont des chaînes littérales du code des bibliothèques, jamais
 * des noms d'identifiants — ceux-là sont renommés. Un nom d'export comme
 * `useSortable` ne prouve rien : il paraît aussi dans les morceaux qui
 * IMPORTENT le vendor, ce qui avait failli me faire conclure à une duplication
 * qui n'existait pas.
 */

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const DIR = 'dist/assets';

/** Le morceau, le marqueur qui prouve son contenu, et un plancher de taille. */
const ATTENDUS = [
  { nom: 'vendor-react', marqueur: 'Minified React error', minKo: 100 },
  { nom: 'vendor-postgrest', marqueur: 'PostgrestError', minKo: 5 },
  { nom: 'vendor-dnd', marqueur: 'DndContext', minKo: 20 },
  { nom: 'vendor-xlsx', marqueur: 'SheetJS', minKo: 200 },
];

let fichiers;
try {
  fichiers = readdirSync(DIR).filter((f) => f.endsWith('.js'));
} catch {
  console.error(`Aucun ${DIR} : lance d'abord « npm run build ».`);
  process.exit(1);
}

let echecs = 0;
for (const { nom, marqueur, minKo } of ATTENDUS) {
  const fichier = fichiers.find((f) => f.startsWith(`${nom}-`));
  if (!fichier) {
    console.error(`::error::Morceau ${nom} absent du bundle.`);
    echecs += 1;
    continue;
  }
  const chemin = join(DIR, fichier);
  const ko = Math.round(statSync(chemin).size / 1024);
  const contenu = readFileSync(chemin, 'utf8');

  if (!contenu.includes(marqueur)) {
    console.error(
      `::error::${nom} ne contient pas « ${marqueur} » : le morceau porte ce nom mais pas ce contenu.`
    );
    echecs += 1;
  } else if (ko < minKo) {
    // Le contenu est là mais amputé : c'est le symptome d'un groupe qui fuit
    // ailleurs, comme `vendor-react` tombé à 39 Ko lors de la bascule.
    console.error(`::error::${nom} ne pèse que ${ko} Ko, moins du plancher de ${minKo} Ko.`);
    echecs += 1;
  } else {
    console.log(`  ${nom.padEnd(18)} ${String(ko).padStart(4)} Ko  contenu conforme`);
  }
}

if (echecs) {
  console.error(`${echecs} morceau(x) mal découpé(s).`);
  process.exit(1);
}
console.log('Découpage conforme.');
