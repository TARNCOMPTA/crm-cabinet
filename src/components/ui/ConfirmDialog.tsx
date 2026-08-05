import { Modal } from './Modal';
import { Button } from './Button';
import { AlertTriangle } from 'lucide-react';

interface ConfirmDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  variant?: 'danger' | 'warning' | 'info';
  loading?: boolean;
}

export function ConfirmDialog({
  isOpen,
  onClose,
  onConfirm,
  title,
  message,
  confirmText = 'Confirmer',
  cancelText = 'Annuler',
  variant = 'danger',
  loading = false,
}: ConfirmDialogProps) {
  const variantStyles = {
    danger: {
      icon: 'text-red-600 bg-red-100 dark:text-red-400 dark:bg-red-900/40',
      button: 'danger' as const,
    },
    warning: {
      icon: 'text-yellow-600 bg-yellow-100 dark:text-yellow-400 dark:bg-yellow-900/40',
      button: 'warning' as const,
    },
    info: {
      icon: 'text-teal-600 bg-teal-100 dark:text-teal-400 dark:bg-teal-900/40',
      button: 'primary' as const,
    },
  };

  const style = variantStyles[variant];

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={title}>
      <div className="flex gap-4">
        <div className={`flex-shrink-0 w-12 h-12 rounded-full ${style.icon} flex items-center justify-center`}>
          <AlertTriangle className="w-6 h-6" />
        </div>
        <div className="flex-1">
          <p className="text-gray-700 dark:text-gray-300 mb-6">{message}</p>
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="secondary"
              onClick={onClose}
              disabled={loading}
            >
              {cancelText}
            </Button>
            <Button
              type="button"
              variant={style.button}
              onClick={onConfirm}
              disabled={loading}
            >
              {loading ? 'Chargement...' : confirmText}
            </Button>
          </div>
        </div>
      </div>
    </Modal>
  );
}
