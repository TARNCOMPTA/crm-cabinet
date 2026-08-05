import { useEffect } from 'react';
import { X, Command, Keyboard } from 'lucide-react';

interface KeyboardShortcutsHelpProps {
  isOpen: boolean;
  onClose: () => void;
}

interface Shortcut {
  keys: string[];
  description: string;
}

interface ShortcutGroup {
  title: string;
  items: Shortcut[];
}

const SHORTCUT_GROUPS: ShortcutGroup[] = [
  {
    title: 'Global',
    items: [
      { keys: ['mod', 'K'], description: 'Ouvrir la palette de commandes' },
      { keys: ['mod', 'B'], description: 'Masquer / afficher la barre laterale' },
      { keys: ['?'], description: 'Afficher cette aide' },
      { keys: ['Esc'], description: 'Fermer une modale ou un menu' },
    ],
  },
  {
    title: 'Dans la palette de commandes',
    items: [
      { keys: ['Fleche haut', 'Fleche bas'], description: 'Naviguer entre les resultats' },
      { keys: ['Entree'], description: 'Selectionner le resultat' },
      { keys: ['Esc'], description: 'Fermer la palette' },
    ],
  },
  {
    title: 'Navigation rapide (via palette)',
    items: [
      { keys: ['mod', 'K'], description: 'Puis taper : clients, taches, bilans...' },
      { keys: ['mod', 'K'], description: 'Puis taper : nouveau client, nouvelle tache...' },
    ],
  },
];

function KeyCap({ children }: { children: React.ReactNode }) {
  const isMod = children === 'mod';
  return (
    <kbd className="inline-flex items-center justify-center min-w-[1.75rem] h-7 px-2 text-xs font-semibold rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-200 shadow-sm">
      {isMod ? (
        <span className="inline-flex items-center gap-0.5">
          <Command className="w-3 h-3" />
          <span className="sm:hidden">Ctrl</span>
        </span>
      ) : (
        children
      )}
    </kbd>
  );
}

export function KeyboardShortcutsHelp({ isOpen, onClose }: KeyboardShortcutsHelpProps) {
  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener('keydown', handler);
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', handler);
      document.body.style.overflow = 'unset';
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm animate-in fade-in"
        onClick={onClose}
      />
      <div className="relative w-full max-w-2xl bg-white dark:bg-gray-900 rounded-xl shadow-2xl border border-gray-200 dark:border-gray-800 max-h-[85vh] flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-800">
          <div className="flex items-center gap-3">
            <div className="flex items-center justify-center w-9 h-9 rounded-lg bg-teal-50 dark:bg-teal-950/60 text-teal-600 dark:text-teal-400">
              <Keyboard className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                Raccourcis clavier
              </h2>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Gagnez du temps avec ces combinaisons
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-md hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-500 dark:text-gray-400 transition-colors"
            aria-label="Fermer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="overflow-y-auto px-6 py-5 space-y-6">
          {SHORTCUT_GROUPS.map((group) => (
            <div key={group.title}>
              <h3 className="text-[11px] uppercase tracking-wider font-semibold text-gray-400 dark:text-gray-500 mb-2">
                {group.title}
              </h3>
              <div className="space-y-1">
                {group.items.map((shortcut, idx) => (
                  <div
                    key={idx}
                    className="flex items-center justify-between py-2 px-3 rounded-md hover:bg-gray-50 dark:hover:bg-gray-800/60 transition-colors"
                  >
                    <span className="text-sm text-gray-700 dark:text-gray-300">
                      {shortcut.description}
                    </span>
                    <div className="flex items-center gap-1">
                      {shortcut.keys.map((key, keyIdx) => (
                        <span key={keyIdx} className="inline-flex items-center">
                          {keyIdx > 0 && (
                            <span className="mx-1 text-xs text-gray-400">+</span>
                          )}
                          <KeyCap>{key}</KeyCap>
                        </span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        <div className="px-6 py-3 border-t border-gray-200 dark:border-gray-800 bg-gray-50/60 dark:bg-gray-950/40 text-xs text-gray-500 dark:text-gray-400">
          Appuyez sur <KeyCap>?</KeyCap> a tout moment pour rouvrir ce panneau.
        </div>
      </div>
    </div>
  );
}
