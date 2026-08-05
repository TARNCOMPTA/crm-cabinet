import { useState } from 'react';
import { X, CheckCircle2, Ban } from 'lucide-react';
import { AVANCEMENT_OPTIONS } from '../../lib/habilitationsConstants';

interface HabilitationsBulkBarProps {
  selectedCount: number;
  onClearSelection: () => void;
  onBulkAvancement: (value: string) => void;
  onBulkNonConcerne: (value: boolean) => void;
}

export function HabilitationsBulkBar({
  selectedCount,
  onClearSelection,
  onBulkAvancement,
  onBulkNonConcerne,
}: HabilitationsBulkBarProps) {
  const [showAvancementMenu, setShowAvancementMenu] = useState(false);

  if (selectedCount === 0) return null;

  return (
    <div className="sticky bottom-4 z-40 mx-4">
      <div className="bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900 rounded-xl shadow-2xl px-5 py-3 flex items-center justify-between gap-4 animate-in slide-in-from-bottom-2 duration-200">
        <div className="flex items-center gap-3">
          <button
            onClick={onClearSelection}
            className="p-1.5 hover:bg-white/10 dark:hover:bg-black/10 rounded-lg transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
          <span className="text-sm font-medium">
            {selectedCount} client{selectedCount > 1 ? 's' : ''} selectionne{selectedCount > 1 ? 's' : ''}
          </span>
        </div>

        <div className="flex items-center gap-2">
          <div className="relative">
            <button
              onClick={() => setShowAvancementMenu(!showAvancementMenu)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-teal-600 hover:bg-teal-500 text-white rounded-lg transition-colors"
            >
              <CheckCircle2 className="w-3.5 h-3.5" />
              Changer l'avancement
            </button>
            {showAvancementMenu && (
              <>
                <div className="fixed inset-0 z-10" onClick={() => setShowAvancementMenu(false)} />
                <div className="absolute bottom-full mb-2 right-0 z-20 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-xl py-1 min-w-[140px]">
                  {AVANCEMENT_OPTIONS.map((opt) => (
                    <button
                      key={opt.value}
                      onClick={() => {
                        onBulkAvancement(opt.value);
                        setShowAvancementMenu(false);
                      }}
                      className="w-full text-left px-3 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>

          <button
            onClick={() => onBulkNonConcerne(true)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-slate-600 hover:bg-slate-500 text-white rounded-lg transition-colors"
          >
            <Ban className="w-3.5 h-3.5" />
            Non concerne
          </button>
        </div>
      </div>
    </div>
  );
}
