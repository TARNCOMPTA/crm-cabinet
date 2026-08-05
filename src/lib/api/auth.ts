/**
 * Client d'authentification de l'instance.
 * ---------------------------------------------------------------------------
 * Remplace `supabase.auth`. La forme des méthodes est volontairement calquée sur
 * celle de GoTrue — `{ data, error }` — pour que les 28 appels du front n'aient
 * pas à être réécrits un par un.
 *
 * Différence de fond : la session vit dans un cookie httpOnly posé par le
 * serveur. Le JavaScript de la page ne peut donc pas la lire, ce qui la met hors
 * de portée d'une XSS — contrairement à un jeton en localStorage. Corollaire :
 * `getSession()` interroge le serveur au lieu de lire un stockage local.
 */

import {
  startRegistration,
  startAuthentication,
} from '@simplewebauthn/browser';

export interface Profil {
  id: string;
  email: string;
  role: string;
  prenom: string | null;
  nom: string | null;
  avatar_url?: string | null;
  display_name?: string | null;
  job_role?: string | null;
  is_active?: boolean;
  show_my_dossiers?: boolean;
}

export interface ErreurApi {
  message: string;
  status?: number;
}

type Reponse<T> = { data: T; error: null } | { data: null; error: ErreurApi };

async function appeler<T>(
  chemin: string,
  options: RequestInit = {}
): Promise<Reponse<T>> {
  try {
    const rep = await fetch(chemin, {
      // Le cookie de session doit accompagner chaque appel. Le front et l'API
      // partageant la même origine, `same-origin` suffit.
      credentials: 'same-origin',
      headers: options.body ? { 'content-type': 'application/json' } : undefined,
      ...options,
    });

    if (!rep.ok) {
      let message = `Erreur ${rep.status}`;
      try {
        const corps = (await rep.json()) as { message?: string };
        if (corps.message) message = corps.message;
      } catch {
        /* corps non JSON : on garde le message par défaut */
      }
      return { data: null, error: { message, status: rep.status } };
    }

    // 204 et corps vide sont légitimes (déconnexion, suppression).
    const texte = await rep.text();
    return { data: (texte ? JSON.parse(texte) : null) as T, error: null };
  } catch (e) {
    return {
      data: null,
      error: { message: e instanceof Error ? e.message : 'Reseau injoignable' },
    };
  }
}

/**
 * Abonnés aux changements d'état d'authentification.
 *
 * Reproduit `onAuthStateChange` : les contextes React s'y branchent pour réagir
 * à une connexion ou une déconnexion sans recharger la page.
 */
type Ecouteur = (evenement: 'SIGNED_IN' | 'SIGNED_OUT', profil: Profil | null) => void;
const ecouteurs = new Set<Ecouteur>();

function notifier(evenement: 'SIGNED_IN' | 'SIGNED_OUT', profil: Profil | null): void {
  for (const e of ecouteurs) {
    try {
      e(evenement, profil);
    } catch {
      /* un écouteur en erreur ne doit pas empêcher les autres */
    }
  }
}

export const auth = {
  /** Session courante, telle que le serveur la voit. */
  async getSession(): Promise<{ data: { session: { profil: Profil } | null }; error: null }> {
    const r = await appeler<{ profil: Profil }>('/api/auth/session');
    // Une absence de session n'est pas une erreur : c'est l'état « déconnecté ».
    return { data: { session: r.data ?? null }, error: null };
  },

  async getUser(): Promise<{ data: { user: Profil | null }; error: null }> {
    const r = await appeler<{ profil: Profil }>('/api/auth/session');
    return { data: { user: r.data?.profil ?? null }, error: null };
  },

  /** Connexion par passkey. Aucun email à saisir : le navigateur propose ses clés. */
  async connexionParPasskey(): Promise<Reponse<{ profil: Profil }>> {
    const opts = await appeler<Record<string, unknown>>('/api/auth/connexion/options', {
      method: 'POST',
      body: '{}',
    });
    if (opts.error) return { data: null, error: opts.error };

    let reponse;
    try {
      reponse = await startAuthentication({ optionsJSON: opts.data as never });
    } catch (e) {
      // Annulation par l'utilisateur, ou aucune passkey pour ce domaine.
      return {
        data: null,
        error: {
          message:
            e instanceof Error && e.name === 'NotAllowedError'
              ? 'Connexion annulee.'
              : "Aucune passkey disponible pour ce site. Utilise un code d'enrolement.",
        },
      };
    }

    const r = await appeler<{ profil: Profil }>('/api/auth/connexion/verifier', {
      method: 'POST',
      body: JSON.stringify({ reponse }),
    });
    if (r.data) notifier('SIGNED_IN', r.data.profil);
    return r;
  },

  /**
   * Enrôlement d'une passkey. Avec un code pour la première, sans code pour
   * ajouter un appareil depuis une session ouverte.
   */
  async enrolerPasskey(
    options: { code?: string; libelle?: string } = {}
  ): Promise<Reponse<{ profil: Profil }>> {
    const opts = await appeler<Record<string, unknown>>('/api/auth/enrolement/options', {
      method: 'POST',
      body: JSON.stringify({ code: options.code }),
    });
    if (opts.error) return { data: null, error: opts.error };

    let reponse;
    try {
      reponse = await startRegistration({ optionsJSON: opts.data as never });
    } catch (e) {
      return {
        data: null,
        error: {
          message:
            e instanceof Error && e.name === 'InvalidStateError'
              ? 'Cet appareil est deja enrole sur ce compte.'
              : 'Enrolement annule.',
        },
      };
    }

    const r = await appeler<{ profil: Profil }>('/api/auth/enrolement/verifier', {
      method: 'POST',
      body: JSON.stringify({ reponse, libelle: options.libelle, code: options.code }),
    });
    if (r.data) notifier('SIGNED_IN', r.data.profil);
    return r;
  },

  async signOut(): Promise<{ error: null }> {
    await appeler('/api/auth/deconnexion', { method: 'POST' });
    notifier('SIGNED_OUT', null);
    return { error: null };
  },

  /** Passkeys enrôlées sur le compte courant. */
  async listerPasskeys() {
    return appeler<{
      passkeys: Array<{
        id: string;
        libelle: string | null;
        created_at: string;
        last_used_at: string | null;
      }>;
    }>('/api/auth/passkeys');
  },

  /** Le serveur refuse de retirer la dernière : ce serait un verrouillage définitif. */
  async supprimerPasskey(id: string) {
    return appeler<{ ok: true }>(`/api/auth/passkeys/${id}`, { method: 'DELETE' });
  },

  onAuthStateChange(rappel: Ecouteur) {
    ecouteurs.add(rappel);
    return {
      data: {
        subscription: {
          unsubscribe() {
            ecouteurs.delete(rappel);
          },
        },
      },
    };
  },
};
