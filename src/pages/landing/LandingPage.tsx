import { useState } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { useTheme } from '../../contexts/ThemeContext';
import { Input } from '../../components/ui/Input';
import {
  Building2,
  Moon,
  Sun,
  AlertCircle,
  Fingerprint,
  KeyRound,
} from 'lucide-react';

/**
 * Écran d'accueil et de connexion (route `/`).
 * ---------------------------------------------------------------------------
 * Plus d'email ni de mot de passe : la connexion se fait par passkey. Le
 * navigateur propose lui-même les clés enregistrées pour ce domaine, il n'y a
 * donc rien à identifier au préalable — le champ email a disparu pour cette
 * raison, pas par oubli.
 *
 * Deux chemins, et deux seulement :
 *   - « Se connecter » pour un appareil déjà enrôlé ;
 *   - un code d'enrôlement pour le premier appareil, ou pour en ajouter un après
 *     avoir perdu le précédent. Ce code remplace le « mot de passe oublié » :
 *     l'administrateur le génère, il ne circule pas par email.
 *
 * Attention : une passkey est liée au domaine. Changer le domaine de l'instance
 * invalide toutes les passkeys existantes — d'où le code d'enrôlement toujours
 * accessible depuis cet écran.
 */
export function LandingPage() {
  const { profile, loading: authLoading, connexionParPasskey, enrolerPasskey } = useAuth();
  const { theme, toggleTheme } = useTheme();

  const [erreur, setErreur] = useState<string | null>(null);
  const [enCours, setEnCours] = useState(false);
  const [afficherCode, setAfficherCode] = useState(false);
  const [code, setCode] = useState('');
  const [libelle, setLibelle] = useState('');

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-950">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-teal-600" />
      </div>
    );
  }

  if (profile) {
    return <Navigate to="/dashboard" replace />;
  }

  const seConnecter = async () => {
    setErreur(null);
    setEnCours(true);
    const { error } = await connexionParPasskey();
    if (error) setErreur(error.message);
    // Succès : le contexte pose le profil, le rendu bascule sur <Navigate />.
    setEnCours(false);
  };

  const enroler = async (e: React.FormEvent) => {
    e.preventDefault();
    setErreur(null);
    setEnCours(true);
    const { error } = await enrolerPasskey({
      code: code.trim(),
      libelle: libelle.trim() || undefined,
    });
    if (error) setErreur(error.message);
    setEnCours(false);
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950 flex items-center justify-center px-4 relative overflow-hidden">
      <div className="absolute top-[-120px] right-[-80px] w-[400px] h-[400px] bg-teal-200/20 dark:bg-teal-900/15 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-[-100px] left-[-60px] w-[300px] h-[300px] bg-teal-100/30 dark:bg-teal-900/10 rounded-full blur-3xl pointer-events-none" />

      <button
        onClick={toggleTheme}
        className="fixed top-4 right-4 p-2.5 rounded-xl bg-white/80 dark:bg-gray-800/80 text-gray-500 dark:text-gray-400 hover:bg-white dark:hover:bg-gray-700 hover:text-gray-700 dark:hover:text-gray-200 transition-all shadow-sm backdrop-blur-sm z-20"
        aria-label="Changer de thème"
      >
        {theme === 'dark' ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
      </button>

      <div className="max-w-sm w-full relative z-10">
        <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-sm border border-gray-200/60 dark:border-gray-800 px-8 py-10 sm:px-10">
          <div className="text-center mb-8">
            <div className="inline-flex items-center gap-3 mb-4">
              <div className="w-11 h-11 bg-teal-600 rounded-xl flex items-center justify-center shadow-lg shadow-teal-600/20">
                <Building2 className="w-6 h-6 text-white" />
              </div>
              <span className="text-xl font-bold text-gray-900 dark:text-white tracking-tight">
                CRM Cabinet
              </span>
            </div>
            <p className="text-gray-500 dark:text-gray-400 text-sm">
              Connectez-vous pour accéder à votre espace.
            </p>
          </div>

          {!afficherCode ? (
            <div className="space-y-4">
              <button
                type="button"
                onClick={seConnecter}
                disabled={enCours}
                className="w-full py-3 px-4 bg-teal-600 hover:bg-teal-700 active:bg-teal-800 text-white font-medium rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-teal-500 focus:ring-offset-2 dark:focus:ring-offset-gray-900 disabled:opacity-50 disabled:cursor-not-allowed shadow-sm flex items-center justify-center gap-2"
              >
                <Fingerprint className="w-5 h-5" />
                {enCours ? 'Connexion...' : 'Se connecter'}
              </button>

              <p className="text-center text-sm text-gray-500 dark:text-gray-400">
                Empreinte, visage ou code de votre appareil.
              </p>

              <button
                type="button"
                onClick={() => {
                  setAfficherCode(true);
                  setErreur(null);
                }}
                /* `min-h-[44px]` et non un simple `pt-2` : mesure a 375 px, ce
                   bouton ne faisait que 28 px de haut. C'est le seul chemin
                   d'enrolement d'un nouvel appareil — donc, sur telephone, la
                   premiere chose qu'un utilisateur doit reussir a viser. */
                className="w-full min-h-[44px] py-2 text-sm text-teal-600 hover:text-teal-700 dark:text-teal-400 dark:hover:text-teal-300 font-medium transition-colors flex items-center justify-center gap-1.5"
              >
                <KeyRound className="w-4 h-4" />
                Premier appareil ou nouvel appareil ?
              </button>
            </div>
          ) : (
            <form onSubmit={enroler} className="space-y-4">
              <div>
                <Input
                  label="Code d'enrôlement"
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  placeholder="XXXXX-XXXXX"
                  autoComplete="one-time-code"
                  required
                />
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1.5">
                  Fourni par l&apos;administrateur de l&apos;instance. Valable une seule fois.
                </p>
              </div>

              <Input
                label="Nom de cet appareil (facultatif)"
                value={libelle}
                onChange={(e) => setLibelle(e.target.value)}
                placeholder="Portable du bureau"
              />

              <button
                type="submit"
                disabled={enCours}
                className="w-full py-2.5 px-4 bg-teal-600 hover:bg-teal-700 active:bg-teal-800 text-white font-medium rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-teal-500 focus:ring-offset-2 dark:focus:ring-offset-gray-900 disabled:opacity-50 disabled:cursor-not-allowed shadow-sm"
              >
                {enCours ? 'Enrôlement...' : 'Enrôler cet appareil'}
              </button>

              <button
                type="button"
                onClick={() => {
                  setAfficherCode(false);
                  setErreur(null);
                }}
                className="w-full text-sm text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 transition-colors"
              >
                Retour à la connexion
              </button>
            </form>
          )}

          {erreur && (
            <div className="mt-4 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800 rounded-lg px-4 py-3">
              <div className="flex items-start gap-3">
                <AlertCircle className="w-5 h-5 text-red-600 dark:text-red-400 flex-shrink-0 mt-0.5" />
                <p className="text-sm text-red-700 dark:text-red-400">{erreur}</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
