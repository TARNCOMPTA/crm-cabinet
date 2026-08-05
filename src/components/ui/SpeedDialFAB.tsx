import { useState, useEffect, useRef } from 'react';
import { Plus, X, Building } from 'lucide-react';

interface SpeedDialAction {
  id: string;
  label: string;
  icon: typeof Building;
  onClick: () => void;
}

interface SpeedDialFABProps {
  actions: SpeedDialAction[];
}

export function SpeedDialFAB({ actions }: SpeedDialFABProps) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    function handleClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('keydown', handleKey);
    document.addEventListener('mousedown', handleClick);
    return () => {
      document.removeEventListener('keydown', handleKey);
      document.removeEventListener('mousedown', handleClick);
    };
  }, [open]);

  return (
    <div ref={containerRef} className="fixed bottom-24 right-6 z-[9999] flex flex-col items-end gap-3">
      {open && (
        <div className="flex flex-col items-end gap-2.5 mb-1">
          {actions.map((action, index) => {
            const Icon = action.icon;
            return (
              <button
                key={action.id}
                type="button"
                onClick={() => {
                  setOpen(false);
                  action.onClick();
                }}
                className="group flex items-center gap-3 animate-in slide-in-from-bottom-2 fade-in duration-200"
                style={{ animationDelay: `${index * 60}ms`, animationFillMode: 'backwards' }}
              >
                <span className="px-3 py-1.5 rounded-lg bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900 text-sm font-medium shadow-lg whitespace-nowrap opacity-0 group-hover:opacity-100 -translate-x-1 group-hover:translate-x-0 transition-all duration-200">
                  {action.label}
                </span>
                <span className="w-12 h-12 rounded-full bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 shadow-lg flex items-center justify-center text-gray-700 dark:text-gray-200 hover:bg-teal-50 dark:hover:bg-teal-900/30 hover:border-teal-300 dark:hover:border-teal-700 hover:text-teal-600 dark:hover:text-teal-400 transition-all duration-200">
                  <Icon className="w-5 h-5" />
                </span>
              </button>
            );
          })}
        </div>
      )}

      <button
        type="button"
        onClick={() => setOpen(!open)}
        className={`w-14 h-14 rounded-full shadow-lg hover:shadow-xl flex items-center justify-center transition-all duration-300 hover:scale-110 active:scale-95 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:ring-offset-2 dark:focus:ring-offset-gray-900 ${
          open
            ? 'bg-gray-700 dark:bg-gray-300 text-white dark:text-gray-900'
            : 'bg-teal-600 hover:bg-teal-700 text-white'
        }`}
      >
        {open ? (
          <X className="w-6 h-6 transition-transform duration-300" />
        ) : (
          <Plus className="w-6 h-6 transition-transform duration-300" />
        )}
      </button>
    </div>
  );
}
