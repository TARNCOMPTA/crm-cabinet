import { createContext, useContext, useEffect, useState, useMemo, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { Database } from '../types/database';

type Profile = Database['public']['Tables']['profiles']['Row'];

/**
 * Contexte d'authentification.
 * ---------------------------------------------------------------------------
 * Réécrit pour les passkeys. Ce qui a disparu, et pourquoi :
 *
 *   - `session` et `user` distincts du profil. La session vit désormais dans un
 *     cookie httpOnly que le JavaScript ne peut pas lire ; il n'y a donc plus
 *     d'objet session à exposer. `profile` suffit, et `user` en est un alias
 *     conservé pour ne pas réécrire les 60 fichiers qui s'en servent.
 *
 *   - `signIn(email, password)`, `signUp`, `resetPassword`. Sans mot de passe,
 *     ils n'ont plus d'objet. La connexion se fait par passkey ; la création
 *     d'un compte et la récupération d'accès passent par un code d'enrôlement.
 *
 *   - `ensure_profile_exists`. Ce rattrapage existait parce que Supabase Auth
 *     créait l'utilisateur avant son profil, laissant une fenêtre où le compte
 *     existait sans profil. Ici `profiles` EST la table des comptes : la fenêtre
 *     n'existe plus.
 */

interface AuthContextType {
  /** Alias de `profile`. Conservé pour la compatibilité des appelants. */
  user: Profile | null;
  profile: Profile | null;
  loading: boolean;
  profileMissing: boolean;
  isAdmin: boolean;
  connexionParPasskey: () => Promise<{ error: { message: string } | null }>;
  enrolerPasskey: (options?: {
    code?: string;
    libelle?: string;
  }) => Promise<{ error: { message: string } | null }>;
  signOut: () => Promise<void>;
  updateShowMyDossiers: (value: boolean) => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

/**
 * `*` et non une liste de colonnes.
 *
 * La liste explicite est en général préférable — elle documente ce dont on a
 * besoin et évite de tirer des colonnes lourdes. Ici elle ne l'est pas : le type
 * `Profile` est la ligne complète, et une liste partielle produit un objet qui
 * n'y correspond pas. Or ce `profile` est lu par une soixantaine de fichiers, et
 * chaque colonne oubliée dans la liste devient une erreur de type chez eux.
 *
 * `profiles` n'a ni colonne volumineuse ni secret, et il n'y a qu'une ligne à
 * charger : le coût est nul.
 */
const PROFILE_COLUMNS = '*';

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  const chargerProfil = useCallback(async (id: string) => {
    const { data } = await supabase
      .from('profiles')
      .select(PROFILE_COLUMNS)
      .eq('id', id)
      .maybeSingle();

    // Un compte désactivé ne doit pas garder de session ouverte.
    if (data && !data.is_active) {
      await supabase.auth.signOut();
      setProfile(null);
      return;
    }
    setProfile(data ?? null);
  }, []);

  const rafraichir = useCallback(async () => {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (session?.profil) {
      await chargerProfil(session.profil.id);
    } else {
      setProfile(null);
    }
    setLoading(false);
  }, [chargerProfil]);

  useEffect(() => {
    void rafraichir();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((evenement, profil) => {
      if (evenement === 'SIGNED_OUT' || !profil) {
        setProfile(null);
        setLoading(false);
        return;
      }
      void chargerProfil(profil.id).finally(() => setLoading(false));
    });

    return () => subscription.unsubscribe();
  }, [rafraichir, chargerProfil]);

  const connexionParPasskey = useCallback(async () => {
    const { error } = await supabase.auth.connexionParPasskey();
    return { error };
  }, []);

  const enrolerPasskey = useCallback(
    async (options: { code?: string; libelle?: string } = {}) => {
      const { error } = await supabase.auth.enrolerPasskey(options);
      return { error };
    },
    []
  );

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
    setProfile(null);
  }, []);

  const updateShowMyDossiers = useCallback(
    async (value: boolean) => {
      if (!profile) return;
      const precedent = profile.show_my_dossiers;
      // Optimiste : l'affichage suit immédiatement, la base rattrape ensuite.
      setProfile((prev) => (prev ? { ...prev, show_my_dossiers: value } : prev));

      // ... mais l'optimisme doit savoir reculer. L'écriture partait sans que
      // personne n'en lise le résultat : quand elle échouait, le bouton restait
      // allumé et ne se démentait qu'au rechargement suivant, laissant croire à
      // un réglage enregistré qui ne l'était pas.
      const { error } = await supabase
        .from('profiles')
        .update({ show_my_dossiers: value })
        .eq('id', profile.id);

      if (error) {
        setProfile((prev) => (prev ? { ...prev, show_my_dossiers: precedent } : prev));
      }
    },
    [profile]
  );

  const isAdmin = profile?.role === 'admin';

  const value = useMemo(
    () => ({
      user: profile,
      profile,
      loading,
      // Sans table de comptes distincte, un profil absent signifie simplement
      // « pas connecté » — ce n'est plus un état incohérent à rattraper.
      profileMissing: false,
      isAdmin,
      connexionParPasskey,
      enrolerPasskey,
      signOut,
      updateShowMyDossiers,
    }),
    [profile, loading, isAdmin, connexionParPasskey, enrolerPasskey, signOut, updateShowMyDossiers]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
