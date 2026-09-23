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

/**
 * Les appels RPC.
 * ---------------------------------------------------------------------------
 * ⚠️ TOUT PASSAIT. `nomTable()` rend « rpc » pour n'importe quelle fonction, et
 * cette pseudo-table n'etant dans aucune liste, le proxy relayait sans controle
 * les huit fonctions du schema `public`.
 *
 * La consequence n'etait pas theorique : `create_notification` est
 * SECURITY DEFINER, son declencheur AFTER INSERT remplit `email_queue`, et
 * l'ordonnanceur la vide toutes les deux minutes. N'importe quel collaborateur
 * connecte faisait donc partir un courriel DEPUIS LE SMTP DU CABINET, vers
 * n'importe quel utilisateur, avec le titre, le message et le lien de son choix.
 */
describe('deciderAcces — les appels RPC', () => {
  const appel = (url: string, roleApp = 'user') =>
    deciderAcces({ methode: 'POST', url, roleApp, sub: 'moi', corps: {} });

  it('laisse passer les quatre fonctions que le front appelle vraiment', () => {
    for (const f of [
      'get_dashboard_stats',
      'initialize_bilan_defaults',
      'initialize_opportunity_defaults',
      'replace_client_collaborators',
    ]) {
      expect(appel(`/rest/v1/rpc/${f}`).autorise, f).toBe(true);
    }
  });

  /** ⭐ LE DEFAUT CORRIGE : l'envoi de courriel au nom du cabinet. */
  it('REFUSE create_notification, meme a un administrateur', () => {
    const u = appel('/rest/v1/rpc/create_notification');
    expect(u.autorise, 'un collaborateur peut ecrire au nom du cabinet').toBe(false);
    // L'administrateur non plus : le navigateur n'a aucune raison de l'appeler,
    // et le serveur ne passe pas par ce proxy.
    expect(appel('/rest/v1/rpc/create_notification', 'admin').autorise).toBe(false);
  });

  it('refuse les autres fonctions internes', () => {
    for (const f of ['process_email_digest', 'auto_archive_done_tasks', 'build_notification_email_html']) {
      expect(appel(`/rest/v1/rpc/${f}`).autorise, f).toBe(false);
    }
  });

  /**
   * Le chemin est decode AVANT d'etre decoupe : PostgREST route sur le chemin
   * decode, donc `rpc%2fcreate_notification` y designe bien la fonction.
   */
  it('n est pas contournable par un separateur encode', () => {
    for (const u of [
      '/rest/v1/rpc%2fcreate_notification',
      '/rest/v1/rpc%2Fcreate_notification',
    ]) {
      expect(appel(u).autorise, u).toBe(false);
    }
  });

  it('refuse une fonction inconnue plutot que de la relayer', () => {
    expect(appel('/rest/v1/rpc/fonction_ajoutee_demain').autorise).toBe(false);
  });

  /** Le refus doit nommer la fonction : un 403 muet ne se diagnostique pas. */
  it('nomme la fonction refusee', () => {
    const v = appel('/rest/v1/rpc/create_notification');
    expect(v.autorise).toBe(false);
    if (!v.autorise) expect(v.message).toMatch(/create_notification/);
  });

  /** Une table qui commencerait par « rpc » n'est pas un appel RPC. */
  it('ne confond pas une table nommee rpc_quelque_chose avec un appel', () => {
    expect(appel('/rest/v1/rpc_journal?select=*').autorise).toBe(true);
  });
});

/**
 * Les trois failles relevées à l'audit du 2026-09-22, et vérifiées sur le
 * harnais depuis une VRAIE session de collaborateur `role = 'user'` avant
 * d'être fermées ici. Chacune répondait alors 201 ou 204.
 */
describe('la file d envoi et le journal, fermes a l audit du 2026-09-22', () => {
  const requete = (methode: string, url: string, corps: unknown = null, roleApp = 'user') =>
    deciderAcces({ methode, url, corps, roleApp, sub: UTILISATEUR.sub });

  /*
    ⚠️ LA PLUS GRAVE DES TROIS. `email_queue` porte `to_email`, `subject` et
    `html_body`, et l'ordonnanceur la vide par le SMTP du cabinet : un POST
    suffisait a envoyer n'importe quoi a n'importe qui, signe du domaine du
    cabinet.
  */
  it('refuse toute ecriture dans email_queue, meme a un administrateur', () => {
    for (const role of ['user', 'admin']) {
      const v = requete('POST', '/rest/v1/email_queue', { to_email: 'x@y.z' }, role);
      expect(v.autorise, role).toBe(false);
    }
  });

  it('refuse aussi de LIRE email_queue : aucun ecran ne passe par la', () => {
    expect(requete('GET', '/rest/v1/email_queue?select=*').autorise).toBe(false);
    expect(requete('GET', '/rest/v1/email_queue?select=*', null, 'admin').autorise).toBe(false);
  });

  /*
    Ecrire `statut = 'succes'` sur une tache qui n'a pas tourne fait taire le
    seul endroit qui signale une panne d'ordonnanceur.
  */
  it('ferme taches_planifiees : le compte rendu de l ordonnanceur', () => {
    expect(requete('PATCH', '/rest/v1/taches_planifiees?nom=eq.file-emails', { statut: 'succes' }).autorise).toBe(false);
    expect(requete('GET', '/rest/v1/taches_planifiees?select=*', null, 'admin').autorise).toBe(false);
  });

  it('ferme email_digests par le meme raisonnement', () => {
    expect(requete('GET', '/rest/v1/email_digests?select=*').autorise).toBe(false);
    expect(requete('POST', '/rest/v1/email_digests', {}).autorise).toBe(false);
  });

  /*
    Le contournement par caractere encode doit tomber ici AUSSI : PostgREST
    route sur le chemin decode, et `email%5fqueue` y designe bien la table.
  */
  it('n est pas contournable par un caractere encode', () => {
    expect(requete('POST', '/rest/v1/email%5fqueue', { to_email: 'x@y.z' }).autorise).toBe(false);
  });

  it('laisse AJOUTER dans audit_logs — sinon archiver un client ne trace plus', () => {
    const v = requete('POST', '/rest/v1/audit_logs', { action: 'archive_client' });
    expect(v.autorise).toBe(true);
  });

  /*
    Une trace effacee laisse un trou qu'on peut remarquer ; une trace RECRITE
    ne laisse rien. Les deux sont refusees, aux administrateurs compris : un
    journal que son lecteur le plus puissant peut corriger ne prouve rien.
  */
  it('refuse d effacer ou de recrire une trace, a tout le monde', () => {
    for (const methode of ['DELETE', 'PATCH', 'PUT']) {
      for (const role of ['user', 'admin']) {
        const v = requete(methode, '/rest/v1/audit_logs?action=eq.x', { action: 'y' }, role);
        expect(v.autorise, `${methode} ${role}`).toBe(false);
      }
    }
  });

  it('dit POURQUOI un journal refuse : un 403 muet ne se diagnostique pas', () => {
    const v = requete('DELETE', '/rest/v1/audit_logs?id=eq.1');
    expect(v.autorise).toBe(false);
    if (!v.autorise) expect(v.message).toMatch(/journal/i);
  });
});

describe('le lien d une notification', () => {
  const poser = (corps: unknown) =>
    deciderAcces({
      methode: 'POST',
      url: '/rest/v1/notifications',
      corps,
      roleApp: 'user',
      sub: UTILISATEUR.sub,
    });

  it('accepte les chemins internes que le front utilise', () => {
    for (const link of ['/tasks', '/bilans', null, undefined, '']) {
      expect(poser({ user_id: 'x', link }).autorise, String(link)).toBe(true);
    }
  });

  /*
    ⚠️ `build_notification_email_html` refuse deja `javascript:` et `data:`,
    mais ACCEPTE `https://` : le lien devient le bouton « Voir le detail » d'un
    courriel envoye par le cabinet. La confiance dans l'expediteur fait le
    reste.
  */
  it('REFUSE un lien qui sort du site', () => {
    for (const link of ['https://exemple.invalid/piege', 'http://exemple.invalid', '//exemple.invalid']) {
      expect(poser({ user_id: 'x', link }).autorise, link).toBe(false);
    }
  });

  it('refuse aussi quand le lien se cache dans un lot de plusieurs lignes', () => {
    const v = poser([
      { user_id: 'a', link: '/tasks' },
      { user_id: 'b', link: 'https://exemple.invalid/piege' },
    ]);
    expect(v.autorise).toBe(false);
  });

  it('refuse un lien qui n est pas du texte', () => {
    expect(poser({ user_id: 'x', link: { toString: 'piege' } }).autorise).toBe(false);
  });

  /* Marquer comme lu reste un PATCH ordinaire : la regle ne porte que sur la pose. */
  it('ne gene pas le marquage comme lu', () => {
    const v = deciderAcces({
      methode: 'PATCH',
      url: '/rest/v1/notifications?id=eq.1',
      corps: { is_read: true },
      roleApp: 'user',
      sub: UTILISATEUR.sub,
    });
    expect(v.autorise).toBe(true);
  });
});
