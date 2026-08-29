import { useEffect } from 'react';
import { CheckCircle, XCircle, AlertCircle, Info, X, Loader2 } from 'lucide-react';
import { useToast, ToastType } from '../../contexts/ToastContext';

const toastIcons: Record<ToastType, typeof CheckCircle> = {
  success: CheckCircle,
  error: XCircle,
  warning: AlertCircle,
  info: Info,
  progress: Loader2,
};

const toastColors: Record<ToastType, string> = {
  success: 'bg-green-50 border-green-500 text-green-900 dark:bg-green-950/60 dark:border-green-600 dark:text-green-200',
  error: 'bg-red-50 border-red-500 text-red-900 dark:bg-red-950/60 dark:border-red-600 dark:text-red-200',
  warning: 'bg-yellow-50 border-yellow-500 text-yellow-900 dark:bg-yellow-950/60 dark:border-yellow-600 dark:text-yellow-200',
  info: 'bg-teal-50 border-teal-500 text-teal-900 dark:bg-teal-950/60 dark:border-teal-600 dark:text-teal-200',
  progress: 'bg-white border-teal-500 text-gray-900 dark:bg-gray-900 dark:border-teal-500 dark:text-gray-100',
};

const iconColors: Record<ToastType, string> = {
  success: 'text-green-600 dark:text-green-400',
  error: 'text-red-600 dark:text-red-400',
  warning: 'text-yellow-600 dark:text-yellow-400',
  info: 'text-teal-600 dark:text-teal-400',
  progress: 'text-teal-600 dark:text-teal-400 animate-spin',
};

/**
 * Les bandeaux de notification.
 * ---------------------------------------------------------------------------
 * ⚠️ RIEN ICI N'ÉTAIT ANNONCÉ. Le conteneur n'avait ni `role` ni `aria-live` :
 * un bandeau apparaissait, restait cinq secondes, disparaissait — et un lecteur
 * d'écran n'en disait pas un mot. Or c'est par là que passe TOUT le retour du
 * logiciel : « Affectations mises à jour », « Droits insuffisants », « Serveur
 * injoignable ». Un utilisateur non voyant cliquait « Sauvegarder » et
 * n'apprenait jamais si ça avait marché.
 *
 * Le conteneur est rendu en permanence, même vide, et c'est la condition pour
 * que ça marche : une région live doit exister AVANT que son contenu n'arrive.
 * Créer la région et le message en même temps ne déclenche aucune annonce.
 */
export function ToastContainer() {
  const { toasts, removeToast } = useToast();

  return (
    <div
      role="region"
      aria-label="Notifications"
      // `polite` sur le conteneur : le niveau par défaut. Chaque bandeau le
      // surcharge selon son type, juste en dessous.
      aria-live="polite"
      // `false` : on annonce le bandeau qui arrive, pas la pile entière à
      // chaque fois. Trois notifications de suite se liraient sinon trois fois.
      aria-atomic="false"
      className="fixed top-4 right-4 z-50 flex flex-col gap-2 max-w-md w-full pointer-events-none"
    >
      {toasts.map((toast) => (
        <ToastItem
          key={toast.id}
          id={toast.id}
          message={toast.message}
          type={toast.type}
          progress={toast.progress}
          sticky={toast.sticky}
          onClose={removeToast}
        />
      ))}
    </div>
  );
}

interface ToastItemProps {
  id: string;
  message: string;
  type: ToastType;
  progress?: { current: number; total: number };
  sticky?: boolean;
  onClose: (id: string) => void;
}

function ToastItem({ id, message, type, progress, sticky, onClose }: ToastItemProps) {
  const Icon = toastIcons[type];

  useEffect(() => {
    if (sticky || type === 'progress') return;
    const timer = setTimeout(() => {
      onClose(id);
    }, 5000);
    return () => clearTimeout(timer);
  }, [id, onClose, sticky, type]);

  const percent =
    progress && progress.total > 0
      ? Math.min(100, Math.round((progress.current / progress.total) * 100))
      : null;

  /**
   * ⚠️ TROIS NIVEAUX, ET LE TROISIÈME EST LE PLUS IMPORTANT.
   *
   *   · `alert` (assertif) pour ce qui interrompt : une erreur, un
   *     avertissement. Le lecteur coupe sa lecture en cours pour le dire.
   *   · `status` (poli) pour une réussite ou une information : annoncé à la
   *     prochaine respiration, sans couper la parole.
   *   · RIEN du tout pour une barre de progression. Elle se met à jour à chaque
   *     pièce traitée — parfois des centaines de fois — et chaque changement
   *     serait annoncé. Une région live sur un compteur qui défile rend le
   *     logiciel inutilisable au lecteur d'écran, ce qui est pire que le
   *     silence d'origine. `aria-live="off"` surcharge le `polite` du
   *     conteneur ; le bandeau de fin, lui, sera un `status` ordinaire.
   */
  const enProgression = type === 'progress';
  const alerte = type === 'error' || type === 'warning';

  return (
    <div
      role={enProgression ? undefined : alerte ? 'alert' : 'status'}
      aria-live={enProgression ? 'off' : undefined}
      className={`
        ${toastColors[type]}
        border-l-4 p-4 rounded-xl shadow-elevated dark:shadow-dark-card
        flex items-start gap-3 pointer-events-auto
        animate-in slide-in-from-right duration-300
      `}
    >
      <Icon className={`w-5 h-5 flex-shrink-0 mt-0.5 ${iconColors[type]}`} />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium">{message}</p>
        {progress && (
          <div className="mt-2">
            <div className="flex items-center justify-between text-xs text-gray-600 dark:text-gray-400 mb-1">
              <span>
                {progress.current} / {progress.total}
              </span>
              {percent !== null && <span>{percent}%</span>}
            </div>
            <div className="h-1.5 w-full bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
              <div
                className="h-full bg-teal-500 dark:bg-teal-400 transition-all duration-200"
                style={{ width: percent !== null ? `${percent}%` : '0%' }}
              />
            </div>
          </div>
        )}
      </div>
      {!sticky && type !== 'progress' && (
        <button
          onClick={() => onClose(id)}
          className="flex-shrink-0 hover:opacity-70 transition-opacity"
          aria-label="Fermer"
        >
          <X className="w-4 h-4" />
        </button>
      )}
    </div>
  );
}
