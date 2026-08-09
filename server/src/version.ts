/**
 * Détection de mise à jour.
 * ---------------------------------------------------------------------------
 * Lit un fichier de version sur GitHub et le compare à celle de l'instance.
 *
 * C'est le SEUL flux sortant du produit, en dehors des services que le cabinet
 * configure lui-même (SMTP, INPI, BODACC). Ce que cela implique, et qui n'est pas
 * négociable :
 *
 *   - la requête est un GET sur un fichier statique public. Rien n'est envoyé :
 *     ni identifiant d'instance, ni domaine, ni nombre d'utilisateurs, ni
 *     statistique. GitHub voit une adresse IP demander un fichier, comme
 *     n'importe quel visiteur ;
 *   - rien n'est appliqué automatiquement. La fonction dit qu'une version existe,
 *     l'administrateur décide ;
 *   - `UPDATE_DISABLED=1` coupe même cette lecture.
 *
 * Sans ces trois propriétés, l'auteur du logiciel redeviendrait sous-traitant
 * RGPD des cabinets qui l'installent — exactement ce que le passage en
 * auto-hébergé cherche à éviter.
 */

import { readFileSync } from 'node:fs';
import { config } from './config.js';

/**
 * La version de cette instance, lue dans l'image et non dans l'environnement.
 *
 * ⚠️ `APP_VERSION` NE PEUT PAS FAIRE FOI. `docker-compose.yml` l'alimente depuis
 * `VERSION` du `.env` — une valeur saisie à l'installation, que ni `maj.sh` ni
 * rien d'autre ne met à jour. Le front, lui, fige sa version au build. Toute
 * instance mise à jour dérivait donc, et l'écran « Version et mise à jour »
 * annonçait un serveur en 2.0.0 sous une interface en 2.1.0 — trouvé en
 * production le 2026-08-09.
 *
 * `version.json` est copié dans l'image finale (Dockerfile) et porte la version
 * du code qu'elle contient, qu'elle ait été construite sur place ou tirée de
 * GHCR. C'est la seule source qui ne peut pas mentir.
 *
 * `APP_VERSION` reste en repli : une exécution hors conteneur — `npm run dev`
 * depuis `server/` — n'a pas le fichier à cet emplacement.
 */
export function versionLocale(): string {
  // Deux emplacements, et il en faut deux : `../` depuis `dist/` vise
  // `/app/version.json` dans l'image ; `../../` depuis `src/` vise la racine du
  // dépôt quand le serveur tourne en développement, hors conteneur.
  for (const relatif of ['../version.json', '../../version.json']) {
    try {
      const brut = readFileSync(new URL(relatif, import.meta.url), 'utf8');
      const version = JSON.parse(brut)?.version;
      if (typeof version === 'string' && version) return version;
    } catch {
      // Fichier absent ou illisible : on essaie l'emplacement suivant.
    }
  }
  return process.env.APP_VERSION ?? 'dev';
}

export interface EtatVersion {
  /** Version de cette instance, lue dans `version.json` de l'image. */
  locale: string;
  /** Version publiée, ou null si la vérification est coupée ou a échoué. */
  distante: string | null;
  aJour: boolean;
  notes: string | null;
  /** Renseigné quand la vérification n'a pas abouti. */
  erreur: string | null;
}

interface Manifeste {
  version?: string;
  notes?: string;
}

/**
 * Compare deux numéros de version sémantiques.
 *
 * Rend un nombre positif si `a` est plus récente. La comparaison est numérique
 * segment par segment : `1.10.0` doit être vue comme plus récente que `1.9.0`,
 * ce qu'une comparaison de chaînes rate.
 */
function comparer(a: string, b: string): number {
  // Les suffixes de prerelease (`-rc.1`) sont écartés : une prerelease et sa
  // version finale portent le même numéro, et l'instance n'a pas à trancher
  // entre les deux — elle signale simplement qu'il y a du nouveau.
  // `?? v` couvre le cas d'une chaine sans tiret : split rend toujours au moins
  // un element, mais le compilateur ne le sait pas sous noUncheckedIndexedAccess.
  const seg = (v: string) =>
    (v.split('-')[0] ?? v).split('.').map((n) => Number.parseInt(n, 10) || 0);
  const sa = seg(a);
  const sb = seg(b);
  for (let i = 0; i < Math.max(sa.length, sb.length); i++) {
    const d = (sa[i] ?? 0) - (sb[i] ?? 0);
    if (d !== 0) return d;
  }
  return 0;
}

/** Résultat mis en cache : inutile d'interroger GitHub à chaque affichage. */
let cache: { valeur: EtatVersion; expireLe: number } | null = null;
const DUREE_CACHE_MS = 6 * 3600_000;

export async function etatVersion(forcer = false): Promise<EtatVersion> {
  const locale = versionLocale();

  if (config.maj.desactivee) {
    return {
      locale,
      distante: null,
      aJour: true,
      notes: null,
      erreur: null,
    };
  }

  if (!forcer && cache && Date.now() < cache.expireLe) return cache.valeur;

  let valeur: EtatVersion;
  try {
    const controleur = new AbortController();
    const minuteur = setTimeout(() => controleur.abort(), 8000);
    let rep: Response;
    try {
      rep = await fetch(config.maj.manifesteUrl, {
        signal: controleur.signal,
        // Pas de cache HTTP : la valeur est déjà mise en cache ici, et un
        // intermédiaire pourrait servir un manifeste périmé pendant des heures.
        headers: { 'Cache-Control': 'no-cache' },
      });
    } finally {
      clearTimeout(minuteur);
    }

    if (!rep.ok) throw new Error(`GitHub a repondu ${rep.status}`);

    const m = (await rep.json()) as Manifeste;
    const distante = m.version ?? null;

    valeur = {
      locale,
      distante,
      // `dev` n'est comparable à rien : en développement il n'y a pas de mise à
      // jour à proposer, et afficher un bandeau serait du bruit.
      aJour: locale === 'dev' || !distante || comparer(distante, locale) <= 0,
      notes: m.notes ?? null,
      erreur: null,
    };
  } catch (e) {
    // Une vérification impossible n'est pas un problème de l'instance : elle
    // fonctionne parfaitement sans. Le message est là pour qui se demande
    // pourquoi le bandeau n'apparaît pas.
    valeur = {
      locale,
      distante: null,
      aJour: true,
      notes: null,
      erreur: e instanceof Error ? e.message : 'Verification impossible',
    };
  }

  cache = { valeur, expireLe: Date.now() + DUREE_CACHE_MS };
  return valeur;
}
