import { describe, it, expect, vi, afterEach } from 'vitest';
import { auth } from './auth';

/**
 * Le contrat de session, et l'absence de jeton.
 * ---------------------------------------------------------------------------
 * Cinq écrans du CRM ont été hors service pendant des semaines pour la même
 * raison : ils lisaient `session.access_token`. Ce jeton a disparu avec
 * Supabase — la session est un cookie httpOnly, que le JavaScript de la page ne
 * peut PAS lire, et c'est précisément ce qui la met hors de portée d'une XSS.
 *
 * `access_token` valait donc `undefined` partout. Ce qui a décidé du sort de
 * chaque écran est fortuit : `if (!session)` passe, `if (!session?.access_token)`
 * bloque. L'export PDF et l'INPI entier tombaient ; l'invitation d'utilisateur
 * passait par chance, en envoyant un en-tête « Bearer undefined ».
 *
 * Le premier test fige donc le contrat : la session ne porte pas de jeton, et
 * tout code qui en cherche un est cassé par construction.
 */

function repondre(corps: unknown, ok = true, status = 200) {
  return {
    ok,
    status,
    text: async () => JSON.stringify(corps),
    json: async () => corps,
    headers: new Headers(),
  } as unknown as Response;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('session', () => {
  it('ne porte aucun jeton : chercher un access_token est une erreur', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => repondre({ profil: { id: '1', email: 'a@b.fr', role: 'admin' } }))
    );

    const { data } = await auth.getSession();

    expect(data.session).not.toBeNull();
    expect(data.session).not.toHaveProperty('access_token');
    expect(data.session).not.toHaveProperty('expires_at');
    expect(data.session?.profil.email).toBe('a@b.fr');
  });

  it('rend une session nulle quand le serveur refuse, sans lever', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => repondre({ message: 'Session requise.' }, false, 401))
    );

    const { data, error } = await auth.getSession();

    // Une absence de session n'est pas une erreur : c'est l'état « déconnecté ».
    expect(data.session).toBeNull();
    expect(error).toBeNull();
  });

  it('interroge /api/auth/session en emportant le cookie', async () => {
    const appels: Array<{ url: string; init?: RequestInit }> = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init?: RequestInit) => {
        appels.push({ url, init });
        return repondre({ profil: { id: '1', email: 'a@b.fr', role: 'admin' } });
      })
    );

    await auth.getSession();

    expect(appels[0].url).toBe('/api/auth/session');
    // Sans `credentials`, le cookie httpOnly ne suivrait pas et toute la
    // navigation retomberait sur des 401 — sans message clair.
    expect(appels[0].init?.credentials).toBe('same-origin');
  });
});
