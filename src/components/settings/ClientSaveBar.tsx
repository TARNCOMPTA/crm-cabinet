import { Button } from '../ui/Button';
import { Save, X, Loader } from 'lucide-react';

interface ClientSaveBarProps {
  changeCount: number;
  saving: boolean;
  onSave: () => void;
  onCancel: () => void;
}

export function ClientSaveBar({ changeCount, saving, onSave, onCancel }: ClientSaveBarProps) {
  return (
    <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 px-6 py-4 flex items-center justify-between shadow-lg z-50 animate-slide-up">
      <div className="flex items-center gap-3">
        <div className="flex items-center justify-center w-8 h-8 bg-teal-100 rounded-full">
          <span className="text-sm font-semibold text-teal-700">{changeCount}</span>
        </div>
        <span className="font-medium text-sm text-gray-700">
          {changeCount} modification{changeCount > 1 ? 's' : ''} en attente
        </span>
      </div>

      <div className="flex items-center gap-3">
        <Button
          variant="outline"
          size="sm"
          onClick={onCancel}
          disabled={saving}
          className="border-gray-300 text-gray-700 hover:bg-gray-50"
        >
          <X className="w-4 h-4 mr-1.5" />
          Annuler
        </Button>
        <Button
          variant="primary"
          size="sm"
          onClick={onSave}
          disabled={saving}
          className="bg-teal-600 hover:bg-teal-700 text-white"
        >
          {saving ? (
            <>
              <Loader className="w-4 h-4 mr-1.5 animate-spin" />
              Enregistrement...
            </>
          ) : (
            <>
              <Save className="w-4 h-4 mr-1.5" />
              Enregistrer
            </>
          )}
        </Button>
      </div>
    </div>
  );
}
