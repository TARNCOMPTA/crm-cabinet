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

export function ToastContainer() {
  const { toasts, removeToast } = useToast();

  return (
    <div className="fixed top-4 right-4 z-50 flex flex-col gap-2 max-w-md w-full pointer-events-none">
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

  return (
    <div
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
