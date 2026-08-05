import { describe, it, expect } from 'vitest';
import { deciderAcces, nomTable } from './rest-droits';

/**
 * La règle d'accès du proxy PostgREST.
 * ---------------------------------------------------------------------------
 * Elle mérite ses propres tests pour une raison simple : elle est SEULE. La base
 * n'a plus une seule policy RLS et le rôle `authenticated` possède tous les
 * droits sur toutes les tables (schema/auth-interne.sql). Si cette fonction dit
 * oui, PostgREST exécute — il n'y a pas de second filet dessous.
 */

const UTILISATEUR = { roleApp: 'user', sub: '11111111-1111-1111-1111-111111111111' };
const AUTRUI = '22222222-2222-2222-2222-222222222222';

function patch(url: string, corps: unknown, qui = UTILISATEUR) {
  return deciderAcces({ methode: 'PATCH', url, corps, ...qui });
}

describe('nomTable', () => {
  it('lit la table d’une URL ordinaire', () => {
    expect(nomTable('/rest/v1/clients?select=id')).toBe('clients');
    expect(nomTable('/rest/v1/profiles')).toBe('profiles');
  });

  /**
   * Le défaut d'origine. PostgREST route sur le chemin DÉCODÉ : « pro%66iles »
   * y désigne `profiles`, mais la comparaison portait sur la chaîne brute, qui
   * n'était dans aucune liste. Un seul caractère encodé suffisait à sortir du
   * contrôle d'administration.
   */
  it('décode le chemin avant de nommer la table', () => {
    expect(nomTable('/rest/v1/pro%66iles?id=eq.1')).toBe('profiles');
    expect(nomTable('/rest/v1/%70rofiles')).toBe('profiles');
  });

  it('ramène la casse, que PostgREST n’a pas à trancher pour nous', () => {
    expect(nomTable('/rest/v1/Profiles')).toBe('profiles');
  });

  it('refuse ce qui ne ressemble pas à un nom de table', () => {
    expect(nomTable('/rest/v1/%ZZ')).toBeNull();
    expect(nomTable('/rest/v1/pro files')).toBeNull();
    expect(nomTable('/rest/v1/')).toBeNull();
  });
});

describe('écritures réservées aux administrateurs', () => {
  it('un collaborateur ne modifie pas les réglages du cabinet', () => {
    const v = patch('/rest/v1/app_config?key=eq.x', { value: '1' });
    expect(v.autorise).toBe(false);
  });

  it('un administrateur, si', () => {
    const v = patch('/rest/v1/app_config?key=eq.x', { value: '1' }, { roleApp: 'admin', sub: 'peu-importe' });
    expect(v.autorise).toBe(true);
  });

  /** Le contournement : la même écriture, un caractère encodé en plus. */
  it('l’encodage du chemin ne rouvre pas la table', () => {
    const v = patch(`/rest/v1/pro%66iles?id=eq.${UTILISATEUR.sub}`, { role: 'admin' });
    expect(v.autorise).toBe(false);
  });

  it('la lecture reste ouverte à tous', () => {
    const v = deciderAcces({ methode: 'GET', url: '/rest/v1/profiles?select=*', corps: undefined, ...UTILISATEUR });
    expect(v.autorise).toBe(true);
  });
});

describe('tables d’identifiants', () => {
  /**
   * Le mot de passe SMTP est stocke en clair dans `cabinet_smtp_config`, et la
   * lecture etait ouverte a tout collaborateur. L'ecran est marque
   * `requiresAdmin`, mais c'est le navigateur qui masque l'entree de menu.
   */
  it('un collaborateur ne lit pas la configuration SMTP', () => {
    const v = deciderAcces({
      methode: 'GET',
      url: '/rest/v1/cabinet_smtp_config?select=*',
      corps: undefined,
      ...UTILISATEUR,
    });
    expect(v.autorise).toBe(false);
  });

  it('ni les cles du connecteur MCP', () => {
    const v = deciderAcces({
      methode: 'GET',
      url: '/rest/v1/mcp_api_keys?select=*',
      corps: undefined,
      ...UTILISATEUR,
    });
    expect(v.autorise).toBe(false);
  });

  it('un administrateur, si', () => {
    const v = deciderAcces({
      methode: 'GET',
      url: '/rest/v1/cabinet_smtp_config?select=*',
      corps: undefined,
      roleApp: 'admin',
      sub: 'peu-importe',
    });
    expect(v.autorise).toBe(true);
  });

  it('et l’encodage ne rouvre pas davantage la lecture que l’ecriture', () => {
    const v = deciderAcces({
      methode: 'GET',
      url: '/rest/v1/cabinet_smtp_confi%67?select=*',
      corps: undefined,
      ...UTILISATEUR,
    });
    expect(v.autorise).toBe(false);
  });

  it('les tables de travail restent lisibles par tous', () => {
    for (const table of ['clients', 'tasks', 'bilan_cards', 'profiles']) {
      const v = deciderAcces({
        methode: 'GET',
        url: `/rest/v1/${table}?select=*`,
        corps: undefined,
        ...UTILISATEUR,
      });
      expect(v.autorise, `${table} devrait rester lisible`).toBe(true);
    }
  });
});

describe('sa propre fiche de profil', () => {
  it('chacun corrige son état civil', () => {
    const v = patch(`/rest/v1/profiles?id=eq.${UTILISATEUR.sub}`, {
      prenom: 'Aymeric',
      display_name: 'A. T.',
      updated_at: '2026-08-02T10:00:00.000Z',
    });
    expect(v.autorise).toBe(true);
  });

  it('et sa préférence « mes dossiers »', () => {
    const v = patch(`/rest/v1/profiles?id=eq.${UTILISATEUR.sub}`, { show_my_dossiers: false });
    expect(v.autorise).toBe(true);
  });

  /** Le point entier de l'exception : elle ne doit pas ouvrir l'autorité. */
  it('mais personne ne se promeut administrateur', () => {
    const v = patch(`/rest/v1/profiles?id=eq.${UTILISATEUR.sub}`, { role: 'admin' });
    expect(v.autorise).toBe(false);
  });

  it('ni ne se réactive, ni ne change son adresse', () => {
    expect(patch(`/rest/v1/profiles?id=eq.${UTILISATEUR.sub}`, { is_active: true }).autorise).toBe(false);
    expect(patch(`/rest/v1/profiles?id=eq.${UTILISATEUR.sub}`, { email: 'x@y.fr' }).autorise).toBe(false);
  });

  it('une colonne permise ne fait pas passer sa voisine interdite', () => {
    const v = patch(`/rest/v1/profiles?id=eq.${UTILISATEUR.sub}`, { prenom: 'A', role: 'admin' });
    expect(v.autorise).toBe(false);
  });

  it('la fiche d’un autre reste hors de portée', () => {
    expect(patch(`/rest/v1/profiles?id=eq.${AUTRUI}`, { prenom: 'A' }).autorise).toBe(false);
  });

  it('un second filtre id ne dilue pas le premier', () => {
    const v = patch(`/rest/v1/profiles?id=eq.${UTILISATEUR.sub}&id=eq.${AUTRUI}`, { prenom: 'A' });
    expect(v.autorise).toBe(false);
  });

  it('sans filtre id, l’écriture viserait toute la table', () => {
    expect(patch('/rest/v1/profiles', { prenom: 'A' }).autorise).toBe(false);
    expect(patch('/rest/v1/profiles?is_active=eq.true', { prenom: 'A' }).autorise).toBe(false);
  });

  it('un tableau viserait plusieurs lignes', () => {
    const v = patch(`/rest/v1/profiles?id=eq.${UTILISATEUR.sub}`, [{ prenom: 'A' }]);
    expect(v.autorise).toBe(false);
  });

  it('l’exception ne vaut que pour PATCH', () => {
    const v = deciderAcces({
      methode: 'DELETE',
      url: `/rest/v1/profiles?id=eq.${UTILISATEUR.sub}`,
      corps: undefined,
      ...UTILISATEUR,
    });
    expect(v.autorise).toBe(false);
  });
});
