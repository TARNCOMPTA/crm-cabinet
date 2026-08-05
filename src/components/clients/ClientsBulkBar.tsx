import { CheckSquare, Users, X } from 'lucide-react';
import { Button } from '../ui/Button';

interface ClientsBulkBarProps {
  selectedCount: number;
  onAssignCollaborators: () => void;
  onClearSelection: () => void;
}

export function ClientsBulkBar({
  selectedCount,
  onAssignCollaborators,
  onClearSelection,
}: ClientsBulkBarProps) {
  if (selectedCount === 0) return null;

  return (
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 animate-slide-up">
      <div className="flex items-center gap-3 bg-gray-900 dark:bg-gray-800 text-white px-5 py-3 rounded-xl shadow-2xl border border-gray-700 dark:border-gray-600">
        <div className="flex items-center gap-2 text-sm font-medium whitespace-nowrap">
          <CheckSquare className="w-4 h-4 text-teal-400" />
          <span>
            {selectedCount} client{selectedCount > 1 ? 's' : ''}
          </span>
        </div>

        <div className="h-5 w-px bg-gray-600" />

        <Button
          size="sm"
          onClick={onAssignCollaborators}
          className="bg-teal-600 hover:bg-teal-500 border-none text-white text-sm gap-1.5"
        >
          <Users className="w-3.5 h-3.5" />
          Affecter collaborateurs
        </Button>

        <button
          onClick={onClearSelection}
          className="p-1.5 text-gray-400 hover:text-white transition-colors rounded-md hover:bg-gray-700"
          title="Tout deselectionner"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
