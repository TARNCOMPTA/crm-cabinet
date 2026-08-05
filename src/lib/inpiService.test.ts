import { describe, it, expect, vi, afterEach } from 'vitest';
import { searchCompaniesByName } from './inpiService';

/**
 * Le contrat entre le serveur porté et le front de Bolt.
 * ---------------------------------------------------------------------------
 * Ces appels passent par `fetch` : ils ne sont typés nulle part, et rien ne
 * garantit que le front lit la clé que le serveur écrit. C'est exactement ce qui
 * s'est produit — la recherche annonçait fidèlement « 4 entreprise(s)
 * trouvée(s) » et n'en affichait AUCUNE, parce que le serveur renvoie
 * `companies` et que le front lisait `data.results`.
 *
 * Le message passait, lui, puisqu'il vient de `data.message`. C'est ce qui rend
 * ce genre de défaut si difficile à voir : l'écran a l'air de fonctionner.
 *
 * La forme utilisée ici est celle que le serveur renvoie réellement — relevée
 * sur l'instance en production, pas déduite du code.
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

/** Réponse réelle de /api/inpi-api pour l'action search-companies. */
const REPONSE_SERVEUR = {
  success: true,
  message: '2 entreprise(s) trouvee(s).',
  // Societes fictives : ce depot est public, aucune donnee de client reel n'y a
  // sa place — pas meme un SIREN, qui identifie une entreprise existante.
  companies: [
    { siren: '000000001', denomination: 'SOCIETE D ESSAI PREMIERE' },
    { siren: '000000002', denomination: 'SOCIETE D ESSAI SECONDE' },
  ],
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('recherche d entreprises', () => {
  it('rend les entreprises que le serveur envoie sous « companies »', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) =>
        url.includes('/api/auth/session')
          ? repondre({ profil: { id: '1', email: 'a@b.fr', role: 'admin' } })
          : repondre(REPONSE_SERVEUR)
      )
    );

    const r = await searchCompaniesByName('SOCIETE D ESSAI');

    expect(r.success).toBe(true);
    // Le coeur du test : annoncer deux resultats et en rendre zero est
    // precisement le defaut qu'on empeche de revenir.
    expect(r.results).toHaveLength(2);
    expect(r.total).toBe(2);
    expect(r.results?.[0].siren).toBe('000000001');
  });

  it('refuse d appeler l INPI sans session, et le dit', async () => {
    const espion = vi.fn(async (url: string) =>
      url.includes('/api/auth/session')
        ? repondre({ message: 'Session requise.' }, false, 401)
        : repondre(REPONSE_SERVEUR)
    );
    vi.stubGlobal('fetch', espion);

    const r = await searchCompaniesByName('SOCIETE D ESSAI');

    expect(r.success).toBe(false);
    expect(r.message).toMatch(/session/i);
    // La garde doit epargner l'aller-retour, pas seulement ignorer la reponse.
    expect(espion.mock.calls.some(([u]) => String(u).includes('/api/inpi'))).toBe(false);
  });

  it('ne cherche pas sur une saisie trop courte', async () => {
    const espion = vi.fn(async () => repondre(REPONSE_SERVEUR));
    vi.stubGlobal('fetch', espion);

    const r = await searchCompaniesByName('T');

    expect(r.success).toBe(false);
    expect(espion).not.toHaveBeenCalled();
  });
});
