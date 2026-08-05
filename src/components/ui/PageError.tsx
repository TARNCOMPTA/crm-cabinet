import { AlertTriangle } from 'lucide-react';
import { Button } from './Button';

interface PageErrorProps {
  title?: string;
  message?: string;
  onRetry?: () => void;
}

export function PageError({
  title = 'Erreur de chargement',
  message = 'Une erreur est survenue lors du chargement des données.',
  onRetry,
}: PageErrorProps) {
  return (
    <div className="flex flex-col items-center justify-center py-16 px-4">
      <div className="bg-red-50 dark:bg-red-900/20 rounded-full p-4 mb-4">
        <AlertTriangle className="w-10 h-10 text-red-500 dark:text-red-400" />
      </div>
      <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100 mb-2 text-center">
        {title}
      </h2>
      <p className="text-gray-500 dark:text-gray-400 text-center max-w-md mb-6">
        {message}
      </p>
      {onRetry && (
        <Button onClick={onRetry} variant="primary">
          Réessayer
        </Button>
      )}
    </div>
  );
}
