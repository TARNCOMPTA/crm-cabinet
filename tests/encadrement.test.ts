import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Les fichiers déposés doivent rester encadrables par ce site — et par lui seul.
 * ---------------------------------------------------------------------------
 * La fenêtre d'un bilan affiche la pièce survolée dans un `<iframe>` pointant
 * sur `/api/storage/...`, de même origine. `X-Frame-Options: DENY` et
 * `frame-ancestors 'none'` interdisent TOUT encadrement — l'origine identique
 * n'y change rien, c'est la définition de `DENY` et de `'none'`. Le navigateur
 * affiche alors un rectangle blanc, sans message visible.
 *
 * C'est arrivé : signalé en production le 2026-09-05, invisible en
 * développement puisque le serveur y répond sans Caddy devant. Reproduit
 * derrière un mandataire qui rejoue les deux en-têtes, corrigé en séparant le
 * chemin des fichiers du reste du site.
 *
 * ⚠️ CE TEST NE LANCE PAS CADDY, et il faut le savoir pour ne pas lui faire
 * dire plus qu'il ne dit. Il lit le texte des deux Caddyfile et vérifie qu'un
 * sélecteur les sépare, pas que Caddy se comporte comme prévu — la CI valide la
 * syntaxe (`caddy validate`), le comportement se constate à l'écran. Ce qu'il
 * empêche est précis et suffit : que quelqu'un remette `DENY` ou `'none'` dans
 * un bloc qui s'applique à tout, ce qui recasserait l'aperçu sans un mot.
 *
 * ⚠️ ET IL VÉRIFIE AUSSI L'INVERSE. Ouvrir les fichiers déposés à `'self'` est
 * un assouplissement ; il ne doit pas déborder sur l'application, qui garde
 * `DENY` et `'none'`. Un test qui ne surveillerait que l'aperçu laisserait
 * passer un `SAMEORIGIN` global, c'est-à-dire la protection perdue partout.
 */

const RACINE = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/** Les deux configurations livrées : VPS dédié, et Caddy déjà en place. */
const FICHIERS = ['Caddyfile', 'installation/Caddyfile.extrait'] as const;

/** Une ligne de configuration, commentaires et indentation retirés. */
function lignes(chemin: string): string[] {
  return readFileSync(resolve(RACINE, chemin), 'utf8')
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.length > 0 && !l.startsWith('#'));
}

describe.each(FICHIERS)('%s', (chemin) => {
  it('sépare le chemin des fichiers déposés du reste du site', () => {
    const l = lignes(chemin);
    expect(l).toContain('@fichiers path /api/storage/*');
    expect(l).toContain('@horsFichiers not path /api/storage/*');
  });

  it('n applique jamais X-Frame-Options sans sélecteur', () => {
    // Sans sélecteur, l'en-tête retombe sur toutes les réponses — y compris
    // celle du fichier qu'on veut afficher.
    const brut = readFileSync(resolve(RACINE, chemin), 'utf8');
    const poses = [...brut.matchAll(/^\s*header(?: (@\w+))?\s*(\{|X-Frame-Options)/gm)];
    const sansSelecteur = poses.filter((m) => !m[1] && m[2] === 'X-Frame-Options');
    expect(sansSelecteur).toHaveLength(0);

    // Et l'en-tête ne doit plus figurer dans un bloc `header { }` global.
    const blocsGlobaux = brut.match(/^\theader \{[\s\S]*?^\t\}/gm) ?? [];
    for (const bloc of blocsGlobaux) {
      expect(bloc).not.toContain('X-Frame-Options');
      expect(bloc).not.toContain('frame-ancestors');
    }
  });

  it('laisse ce site encadrer les fichiers déposés, et personne d autre', () => {
    const brut = readFileSync(resolve(RACINE, chemin), 'utf8');
    expect(brut).toMatch(/header @fichiers[\s\S]{0,200}X-Frame-Options "SAMEORIGIN"/);
    // `ALLOWALL` n'existe pas dans la norme et vaut, selon les navigateurs,
    // « aucune restriction ». Il n'a rien à faire ici.
    expect(brut).not.toContain('ALLOWALL');
  });

  it('garde DENY sur tout le reste', () => {
    const brut = readFileSync(resolve(RACINE, chemin), 'utf8');
    expect(brut).toMatch(/header @horsFichiers[\s\S]{0,200}X-Frame-Options "DENY"/);
  });
});

describe('Caddyfile — la politique de sécurité de contenu', () => {
  /*
    Seul le Caddyfile du VPS dédié pose une CSP en en-tête ; l'extrait destiné à
    un Caddy déjà en place ne la pose pas, pour ne pas écraser celle que ce
    Caddy sert peut-être à d'autres applications.
  */
  const brut = readFileSync(resolve(RACINE, 'Caddyfile'), 'utf8');

  it('refuse l encadrement de l application', () => {
    expect(brut).toMatch(/header @horsFichiers[\s\S]{0,900}frame-ancestors 'none'/);
  });

  it('autorise ce site à encadrer les fichiers déposés', () => {
    expect(brut).toMatch(/header @fichiers[\s\S]{0,900}frame-ancestors 'self'/);
  });

  it('ne relâche rien d autre sur les fichiers déposés', () => {
    // L'assouplissement porte sur `frame-ancestors`, et sur lui seul : les deux
    // politiques doivent être identiques partout ailleurs. Sans cette garde,
    // recopier la politique en y glissant `script-src 'unsafe-inline'` ferait
    // d'un fichier déposé un vecteur d'exécution.
    const politiques = [...brut.matchAll(/Content-Security-Policy "([^"]+)"/g)].map((m) => m[1]);
    expect(politiques).toHaveLength(2);
    const [a, b] = politiques.map((p) => p.replace(/frame-ancestors '[^']+'/, 'frame-ancestors ?'));
    expect(a).toBe(b);
  });

  it('garde nosniff hors du découpage, donc sur les fichiers déposés aussi', () => {
    // C'est l'en-tête qui compte le PLUS sur un contenu envoyé par un tiers :
    // il empêche le navigateur de deviner un type autre que celui annoncé.
    const blocGlobal = brut.match(/^\theader \{[\s\S]*?^\t\}/m)?.[0] ?? '';
    expect(blocGlobal).toContain('X-Content-Type-Options "nosniff"');
  });
});
