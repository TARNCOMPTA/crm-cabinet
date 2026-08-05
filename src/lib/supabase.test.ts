import { describe, it, expect } from 'vitest';
import { supabase } from './supabase';

/**
 * Le client PostgREST doit pouvoir construire une requête.
 * ---------------------------------------------------------------------------
 * Ces trois assertions paraissent triviales. Elles rejouent pourtant la panne du
 * 2026-08-01, la plus difficile à diagnostiquer de la mise en production :
 * l'application se connectait, puis restait sur une roue qui tournait
 * indéfiniment, sans qu'aucune requête n'atteigne le serveur — donc sans la
 * moindre trace dans les journaux.
 *
 * La cause : le client était construit sur le chemin relatif `/rest/v1`, et
 * `postgrest-js` fait un `new URL()` sur cette base. À partir de la 2.111.0, un
 * chemin relatif y lève `TypeError: Invalid URL`. L'exception partait AVANT tout
 * appel réseau, remontait jusqu'au chargement du profil, et empêchait
 * `setLoading(false)`.
 *
 * Le défaut était latent depuis des semaines : le verrou épinglait la 2.110.2,
 * tolérante, pendant que `package.json` réclamait `^2.111.0`. Une simple montée
 * de version le réveillerait. D'où ce test, qui ne coûte rien et le rattrape.
 */
describe('client PostgREST', () => {
  it('construit une requête simple sans lever', () => {
    expect(() => supabase.from('clients').select('id').eq('id', 'x')).not.toThrow();
  });

  it('construit une requête avec jointure imbriquée sans lever', () => {
    expect(() =>
      supabase.from('clients').select('id, client_collaborators(id, user:profiles(prenom))')
    ).not.toThrow();
  });

  it('construit un appel de fonction sans lever', () => {
    expect(() => supabase.rpc('get_dashboard_stats', { p_user_id: 'x' })).not.toThrow();
  });
});
