import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';

/**
 * Cohérences que le compilateur ne peut pas voir.
 * ---------------------------------------------------------------------------
 * Deux familles de défauts ont traversé toute la refonte sans qu'aucun outil ne
 * bronche, parce qu'elles vivent dans des CHAÎNES : une route écrite dans un
 * menu, un nom de fonction passé à `rpc()`. Le compilateur ne relit pas les
 * chaînes, et l'écran ne se plaint pas — il affiche simplement une entrée qui
 * ne mène nulle part, ou une liste vide.
 *
 * Ces tests lisent donc les sources comme du texte. C'est inhabituel, et c'est
 * assumé : c'est le seul angle depuis lequel ces incohérences sont visibles.
 */

const RACINE = resolve(__dirname, '..');

function lire(chemin: string): string {
  return readFileSync(resolve(RACINE, chemin), 'utf8');
}

function fichiersSources(dossier: string, acc: string[] = []): string[] {
  for (const entree of readdirSync(resolve(RACINE, dossier))) {
    const rel = join(dossier, entree);
    const abs = resolve(RACINE, rel);
    if (statSync(abs).isDirectory()) fichiersSources(rel, acc);
    else if (/\.tsx?$/.test(entree) && !/\.test\.tsx?$/.test(entree)) acc.push(rel);
  }
  return acc;
}

describe('navigation', () => {
  /**
   * Cinq entrées de menu — Assistant IA, Nouveautés, Documents, Échéances
   * fiscales, Support — pointaient vers des pages supprimées, dupliquées dans
   * la palette de commandes et dans les réglages : dix liens morts offerts à
   * l'utilisateur, qui tombaient sur la route attrape-tout.
   */
  it('chaque lien interne mène à une route déclarée', () => {
    const app = lire('src/App.tsx');

    const routes = new Set(
      [...app.matchAll(/path="([^"*]+)"/g)]
        .map((m) => m[1])
        .map((p) => (p.startsWith('/') ? p : `/${p}`))
    );

    const liens = new Set<string>();
    for (const fichier of fichiersSources('src')) {
      const contenu = lire(fichier);
      for (const m of contenu.matchAll(/\bto:\s*'(\/[a-z0-9/-]*)'/g)) liens.add(m[1]);
      for (const m of contenu.matchAll(/\bto="(\/[a-z0-9/-]*)"/g)) liens.add(m[1]);
    }

    // Les routes à paramètre (`/clients/:id`) sont ramenées à leur préfixe : un
    // lien construit dynamiquement vers `/clients/<uuid>` est légitime.
    const prefixes = [...routes].map((r) => r.replace(/\/:[^/]+/g, ''));
    const morts = [...liens].filter(
      (l) => l !== '/' && !routes.has(l) && !prefixes.includes(l)
    );

    expect(morts, `liens sans route : ${morts.join(', ')}`).toEqual([]);
  });
});

describe('politique de sécurité du contenu', () => {
  /**
   * La CSP existe en deux exemplaires : dans le `<meta>` d'index.html, qui
   * couvre le développement sans Caddy, et dans l'en-tête HTTP du Caddyfile,
   * seul endroit où `frame-ancestors` est réellement appliqué — les navigateurs
   * l'ignorent quand la politique arrive par un `<meta>`.
   *
   * Deux exemplaires peuvent diverger sans que rien ne le signale : on
   * resserrerait l'un en croyant resserrer les deux. D'où ce test.
   */
  it('le <meta> et l’en-tête Caddy portent la même politique', () => {
    const meta = lire('index.html').match(
      /http-equiv="Content-Security-Policy"\s+content="([^"]+)"/
    )?.[1];
    const entete = lire('Caddyfile').match(/Content-Security-Policy "([^"]+)"/)?.[1];

    expect(meta, 'CSP introuvable dans index.html').toBeTruthy();
    expect(entete, 'CSP introuvable dans le Caddyfile').toBeTruthy();

    // Comparaison directive par directive : l'ordre et les espaces ne comptent pas.
    const directives = (csp: string) =>
      csp
        .split(';')
        .map((d) => d.trim().replace(/\s+/g, ' '))
        .filter(Boolean)
        .sort();

    expect(directives(entete!)).toEqual(directives(meta!));
  });

  it('elle interdit le script en ligne et les cadres', () => {
    const entete = lire('Caddyfile').match(/Content-Security-Policy "([^"]+)"/)?.[1] ?? '';
    expect(entete).toContain("frame-ancestors 'none'");
    expect(entete).toContain("object-src 'none'");
    expect(entete).not.toContain("script-src 'self' 'unsafe-inline'");
    expect(entete).not.toContain('unsafe-eval');
  });
});

describe('appels de fonctions distantes', () => {
  /**
   * Trois `rpc()` ont été mutilés par la transformation mono-cabinet —
   * `p_p_user_id`, `p_p_regime`, et un `{ p_}` orphelin — et sont passés
   * jusqu'à l'exécution parce que `database.ts` ne déclarait AUCUNE fonction.
   * Le bloc `Functions` est désormais généré depuis la base ; ce test garde le
   * générateur, dont une régression rouvrirait l'angle mort.
   */
  it('database.ts déclare les fonctions appelables', () => {
    const types = lire('src/types/database.ts');
    const bloc = types.match(/Functions: \{([\s\S]*?)\n {4}\}/);

    expect(bloc, 'bloc Functions introuvable dans database.ts').not.toBeNull();
    expect(
      bloc![1].includes('[_ in never]: never'),
      'le bloc Functions est vide : les rpc() ne sont typés nulle part'
    ).toBe(false);
  });

  it('chaque rpc() appelé existe dans les types générés', () => {
    const types = lire('src/types/database.ts');
    const bloc = types.match(/Functions: \{([\s\S]*?)\n {4}\}/)?.[1] ?? '';
    const declarees = new Set(
      [...bloc.matchAll(/^ {6}([a-z_][a-z0-9_]*): \{/gm)].map((m) => m[1])
    );

    const appelees = new Set<string>();
    for (const fichier of fichiersSources('src')) {
      for (const m of lire(fichier).matchAll(/\.rpc\(\s*'([a-z_][a-z0-9_]*)'/g)) {
        appelees.add(m[1]);
      }
    }

    expect(appelees.size, 'aucun appel rpc() trouvé : le motif de recherche a dû changer').toBeGreaterThan(0);

    const inconnues = [...appelees].filter((f) => !declarees.has(f));
    expect(inconnues, `fonctions appelées mais absentes des types : ${inconnues.join(', ')}`).toEqual([]);
  });
});
