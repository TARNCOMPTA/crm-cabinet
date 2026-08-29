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
   *
   * ⚠️ `link:` A ÉTÉ AJOUTÉ APRÈS COUP, ET IL A FALLU DEUX RÉCIDIVES POUR LE
   * VOIR. Ce test ne cherchait que `to:` et `to="`, les deux formes de
   * `<Link>` / `<NavLink>`. Or une destination peut aussi vivre dans une table
   * de configuration sous un autre nom, puis partir à `navigate()` — c'est le
   * cas des tuiles du tableau de bord et des cartes de la synthèse client. Deux
   * liens vers `/fiscal-deadlines` et `/documents`, écrans retirés du produit,
   * ont ainsi survécu sous le nez de ce test.
   *
   * La chaîne de requête est retirée avant comparaison : `/x?filtre=proche`
   * n'est pas une route distincte de `/x`, et l'un des deux liens morts la
   * portait — sans ce nettoyage il aurait échappé au contrôle une seconde fois.
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
      for (const m of contenu.matchAll(/\bto:\s*'(\/[a-z0-9/?=&-]*)'/g)) liens.add(m[1]);
      for (const m of contenu.matchAll(/\bto="(\/[a-z0-9/?=&-]*)"/g)) liens.add(m[1]);
      for (const m of contenu.matchAll(/\blink:\s*'(\/[a-z0-9/?=&-]*)'/g)) liens.add(m[1]);
    }

    // Les routes à paramètre (`/clients/:id`) sont ramenées à leur préfixe : un
    // lien construit dynamiquement vers `/clients/<uuid>` est légitime.
    const prefixes = [...routes].map((r) => r.replace(/\/:[^/]+/g, ''));
    const morts = [...liens]
      .map((l) => l.split('?')[0])
      .filter((l) => l !== '/' && !routes.has(l) && !prefixes.includes(l));

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

/**
 * Les variables d'environnement atteignent-elles le conteneur ?
 * ---------------------------------------------------------------------------
 * ⚠️ LES FICHIERS COMPOSE ÉNUMÈRENT LES VARIABLES UNE PAR UNE. Ce qui n'y est
 * pas nommé n'atteint jamais l'application, même écrit dans le `.env` — et rien
 * ne le signale : `optionnel()` rend sa valeur par défaut, `booleen()` rend
 * faux, le réglage est simplement ignoré. L'exploitant, lui, voit un logiciel
 * qui ne tient pas compte de ce qu'il vient d'écrire.
 *
 * ⚠️ ET IL Y EN A DEUX. `docker-compose.partage.yml` n'est PAS une surcharge de
 * `docker-compose.yml` : c'est une pile complète et parallèle, avec ses propres
 * services et son propre bloc `environment:`. Une instance démarre avec l'un OU
 * l'autre. Les tenir à jour ensemble n'est donc pas une élégance, c'est la
 * condition pour que le réglage existe partout.
 *
 * C'est arrivé à `JEDECLARE_MARQUAGE_AUTORISE_2`, DEUX FOIS de suite :
 *
 *   · d'abord absent des deux fichiers — livré, documenté, sans effet ;
 *   · puis ajouté au seul `docker-compose.yml`, avec une première version de ce
 *     test qui ne relisait que celui-là. Le test était vert, et l'instance qui
 *     tourne en mode partagé restait cassée.
 *
 * D'où la boucle sur TOUS les `docker-compose*.yml` : un contrôle qui ne couvre
 * qu'un fichier sur deux donne surtout l'illusion d'être couvert.
 */
describe('variables d’environnement', () => {
  const config = lire('server/src/config.ts');
  const composes = readdirSync(RACINE)
    .filter((f) => /^docker-compose.*\.ya?ml$/.test(f))
    .map((f) => ({ nom: f, texte: lire(f) }));

  /** Les noms lus par le serveur avec un suffixe de compte : `JEDECLARE_X${suffixe}`. */
  const basesSuffixees = [
    ...new Set(
      [...config.matchAll(/`([A-Z][A-Z0-9_]*)\$\{suffixe\}`/g)].map((m) => m[1])
    ),
  ];

  /** Les suffixes déclarés par un fichier donné, déduits d'une base connue. */
  const suffixesDe = (texte: string) => [
    ...new Set(
      [...texte.matchAll(/^\s{6}JEDECLARE_LOGIN(_\d+)?:/gm)].map((m) => m[1] ?? '')
    ),
  ];

  it('les deux piles compose sont bien presentes', () => {
    // Garde-fou du garde-fou. Si ce fichier était renommé, la boucle ci-dessous
    // ne parcourrait plus qu'une pile et redeviendrait le contrôle borgne qui a
    // laissé passer le défaut. Mieux vaut qu'il casse et qu'on le relise.
    expect(composes.map((c) => c.nom).sort()).toEqual([
      'docker-compose.partage.yml',
      'docker-compose.yml',
    ]);
  });

  it('le serveur lit bien une famille de comptes a suffixe', () => {
    expect(basesSuffixees).toContain('JEDECLARE_LOGIN');
    expect(basesSuffixees.length).toBeGreaterThanOrEqual(4);
    for (const { nom, texte } of composes) {
      const suffixes = suffixesDe(texte);
      expect(suffixes, `${nom} ne declare aucun compte de flux`).toContain('');
      expect(suffixes, `${nom} ne declare pas de second compte`).toContain('_2');
    }
  });

  it('chaque variable de compte est declaree dans CHAQUE pile compose', () => {
    const manquantes: string[] = [];
    for (const { nom, texte } of composes) {
      for (const base of basesSuffixees) {
        for (const suffixe of suffixesDe(texte)) {
          const variable = `${base}${suffixe}`;
          if (!new RegExp(`^\\s+${variable}:`, 'm').test(texte)) {
            manquantes.push(`${variable} (${nom})`);
          }
        }
      }
    }
    expect(
      manquantes,
      `inertes malgre le .env, faute d'etre declarees : ${manquantes.join(', ')}`
    ).toEqual([]);
  });
});
