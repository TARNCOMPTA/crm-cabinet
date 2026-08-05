import { Mail, X } from 'lucide-react';
import { Button } from '../ui/Button';

interface BulkEmailBarProps {
  count: number;
  emails: string[];
  onClear: () => void;
}

export function BulkEmailBar({ count, emails, onClear }: BulkEmailBarProps) {
  if (count === 0) return null;

  const validEmails = emails.filter(Boolean);

  function handleSendEmail() {
    if (validEmails.length === 0) return;
    const encodedEmails = validEmails.map((e) => encodeURIComponent(e)).join(',');
    window.location.href = `mailto:${encodedEmails}`;
  }

  return (
    <div className="sticky top-0 z-20 flex items-center justify-between gap-4 px-4 py-2.5 bg-white/95 dark:bg-gray-900/95 backdrop-blur-sm border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg">
      <div className="flex items-center gap-3">
        <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-teal-100 dark:bg-teal-900/50 text-teal-700 dark:text-teal-300 text-xs font-bold">
          {count}
        </span>
        <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
          element{count > 1 ? 's' : ''} selectionne{count > 1 ? 's' : ''}
        </span>
      </div>
      <div className="flex items-center gap-2">
        <Button
          variant="primary"
          size="sm"
          onClick={handleSendEmail}
          disabled={validEmails.length === 0}
          title={validEmails.length === 0 ? 'Aucune adresse email disponible' : `Envoyer a ${validEmails.length} adresse${validEmails.length > 1 ? 's' : ''}`}
        >
          <Mail className="w-4 h-4 mr-1.5" />
          Email groupe ({validEmails.length})
        </Button>
        <button
          onClick={onClear}
          className="p-1.5 rounded-md text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
          title="Tout deselectionner"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
