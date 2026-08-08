import { describe, it, expect } from 'vitest';
import { createHash, randomBytes } from 'node:crypto';
import {
  verifierPkce,
  redirectionAutorisee,
  uriRedirectionValide,
  echapperHtml,
} from '../mcp/oauth-regles.js';

/**
 * Les décisions de sécurité d'OAuth, isolées de la base et du serveur.
 * ---------------------------------------------------------------------------
 * Ces quatre fonctions portent seules ce qui distingue une implémentation
 * correcte d'une passoire. Elles sont pures, donc testables sans rien monter —
 * et c'est la raison pour laquelle elles ont été écrites à part.
 *
 * Chaque cas ci-dessous correspond à une faille réelle, documentée, de serveurs
 * OAuth : ce ne sont pas des hypothèses.
 */

/** Fabrique un couple (verifieur, defi) valide, comme le fait un vrai client. */
function couplePkce(): { verifieur: string; defi: string } {
  const verifieur = randomBytes(48).toString('base64url');
  return { verifieur, defi: createHash('sha256').update(verifieur).digest('base64url') };
}

describe('verifierPkce', () => {
  it('accepte un verifieur qui correspond au defi', () => {
    const { verifieur, defi } = couplePkce();
    expect(verifierPkce(verifieur, defi, 'S256')).toBe(true);
  });

  it('refuse un verifieur qui ne correspond pas', () => {
    const { defi } = couplePkce();
    const autre = randomBytes(48).toString('base64url');
    expect(verifierPkce(autre, defi, 'S256')).toBe(false);
  });

  /**
   * ⭐ `plain` NE PROUVE RIEN : le défi y est le verifieur lui-même, donc quiconque
   * a intercepté l'URL d'autorisation peut le rejouer. La méthode existe dans la
   * RFC pour des raisons historiques ; l'accepter annulerait PKCE.
   */
  it('refuse la methode plain, meme quand verifieur et defi sont egaux', () => {
    const v = randomBytes(48).toString('base64url');
    expect(verifierPkce(v, v, 'plain')).toBe(false);
  });

  it('refuse une methode inconnue ou vide', () => {
    const { verifieur, defi } = couplePkce();
    expect(verifierPkce(verifieur, defi, 'S512')).toBe(false);
    expect(verifierPkce(verifieur, defi, '')).toBe(false);
  });

  /** La RFC 7636 impose 43 à 128 caractères : plus court est devinable. */
  it('refuse un verifieur trop court ou trop long', () => {
    const court = 'a'.repeat(42);
    const long = 'a'.repeat(129);
    expect(verifierPkce(court, createHash('sha256').update(court).digest('base64url'), 'S256')).toBe(
      false
    );
    expect(verifierPkce(long, createHash('sha256').update(long).digest('base64url'), 'S256')).toBe(
      false
    );
  });

  it('refuse un defi vide', () => {
    const { verifieur } = couplePkce();
    expect(verifierPkce(verifieur, '', 'S256')).toBe(false);
  });
});

describe('redirectionAutorisee', () => {
  const enregistrees = ['https://claude.ai/api/mcp/auth_callback'];

  it('accepte une correspondance exacte', () => {
    expect(redirectionAutorisee('https://claude.ai/api/mcp/auth_callback', enregistrees)).toBe(true);
  });

  /**
   * ⭐ LES CINQ VARIANTES QUI ONT SERVI A VOLER DES CODES.
   *
   * Chacune passerait une comparaison par préfixe, par « commence par », ou une
   * tolérance sur la barre finale. Toutes doivent échouer.
   */
  it('refuse tout ce qui n est pas identique au caractere pres', () => {
    for (const hostile of [
      'https://claude.ai/api/mcp/auth_callback/',           // barre finale
      'https://claude.ai/api/mcp/auth_callback?x=1',        // parametre ajoute
      'https://claude.ai/api/mcp/auth_callback.attaquant.fr', // suffixe de domaine
      'https://claude.ai.attaquant.fr/api/mcp/auth_callback', // domaine englobant
      'https://claude.ai/api/mcp/auth_callback#f',          // fragment
      'http://claude.ai/api/mcp/auth_callback',             // schema abaisse
      'https://CLAUDE.AI/api/mcp/auth_callback',            // casse du domaine
    ]) {
      expect(redirectionAutorisee(hostile, enregistrees), hostile).toBe(false);
    }
  });

  it('refuse une URI vide ou absente d une liste vide', () => {
    expect(redirectionAutorisee('', enregistrees)).toBe(false);
    expect(redirectionAutorisee('https://claude.ai/api/mcp/auth_callback', [])).toBe(false);
  });
});

describe('uriRedirectionValide', () => {
  it('accepte https', () => {
    expect(uriRedirectionValide('https://claude.ai/api/mcp/auth_callback')).toBe(true);
  });

  /** Un poste de developpement n'a pas de certificat : la boucle locale est admise. */
  it('accepte http sur la boucle locale seulement', () => {
    expect(uriRedirectionValide('http://localhost:3000/cb')).toBe(true);
    expect(uriRedirectionValide('http://127.0.0.1:3000/cb')).toBe(true);
    expect(uriRedirectionValide('http://ailleurs.fr/cb')).toBe(false);
  });

  /** Un fragment ne survit pas a une redirection : sa presence signale une erreur. */
  it('refuse un fragment', () => {
    expect(uriRedirectionValide('https://claude.ai/cb#jeton')).toBe(false);
  });

  it('refuse ce qui n est pas une URL absolue', () => {
    for (const mauvais of ['', '/cb', 'claude.ai/cb', 'javascript:alert(1)', 'data:text/html,x']) {
      expect(uriRedirectionValide(mauvais), mauvais).toBe(false);
    }
  });

  it('refuse ce qui n est pas une chaine', () => {
    for (const mauvais of [null, undefined, 42, {}, []]) {
      expect(uriRedirectionValide(mauvais)).toBe(false);
    }
  });
});

describe('echapperHtml', () => {
  /**
   * ⭐ `client_name` VIENT DE L'ENREGISTREMENT DYNAMIQUE, donc du dehors, et il
   * s'affiche sur l'écran de consentement — la page même où l'utilisateur accorde
   * un accès. Une injection y serait au pire endroit possible.
   */
  it('neutralise une tentative d injection dans le nom du client', () => {
    expect(echapperHtml('<script>alert(1)</script>')).toBe(
      '&lt;script&gt;alert(1)&lt;/script&gt;'
    );
    expect(echapperHtml('" onload="x')).toBe('&quot; onload=&quot;x');
    expect(echapperHtml("' onerror='x")).toBe('&#39; onerror=&#39;x');
  });

  it('echappe l esperluette avant le reste, pour ne pas doubler les entites', () => {
    expect(echapperHtml('&lt;')).toBe('&amp;lt;');
  });

  it('laisse un texte ordinaire intact', () => {
    expect(echapperHtml('Claude (claude.ai)')).toBe('Claude (claude.ai)');
  });
});
