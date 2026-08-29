import { useState, useRef, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Search,
  Briefcase,
  Users,
  Building2,
  CheckSquare,
  Scale,
  ShieldCheck,
  Monitor,
  Target,
  Loader2,
  X,
} from 'lucide-react';
import {
  globalSearch,
  getTotalResultCount,
  type SearchResults,
  type SearchResultItem,
  type SearchCategory,
} from '../../lib/globalSearchService';


const CATEGORY_META: Record<SearchCategory, { label: string; icon: typeof Search }> = {
  clients: { label: 'Clients', icon: Briefcase },
  contacts: { label: 'Contacts', icon: Users },
  companies: { label: 'Societes', icon: Building2 },
  tasks: { label: 'Tâches', icon: CheckSquare },
  legalActs: { label: 'Juridique', icon: Scale },
  habilitations: { label: 'Habilitations', icon: ShieldCheck },
  software: { label: 'Logiciels', icon: Monitor },
  opportunities: { label: 'Opportunités', icon: Target },
};

const CATEGORY_ORDER: SearchCategory[] = [
  'clients',
  'opportunities',
  'contacts',
  'companies',
  'tasks',
  'legalActs',
  'habilitations',
  'software',
];

export function DashboardSearch() {
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResults | null>(null);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();

  const flatResults = results
    ? CATEGORY_ORDER.flatMap((cat) => results[cat])
    : [];

  const performSearch = useCallback(
    async (q: string) => {
      if (q.trim().length < 2) {
        setResults(null);
        setOpen(false);
        return;
      }
      setLoading(true);
      try {
        const r = await globalSearch(q);
        setResults(r);
        setOpen(true);
        setActiveIndex(-1);
      } catch {
        setResults(null);
      } finally {
        setLoading(false);
      }
    },
    []
  );

  const handleChange = (value: string) => {
    setQuery(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => performSearch(value), 300);
  };

  const handleSelect = (item: SearchResultItem) => {
    setQuery('');
    setResults(null);
    setOpen(false);
    navigate(item.route);
  };

  const handleClear = () => {
    setQuery('');
    setResults(null);
    setOpen(false);
    inputRef.current?.focus();
  };

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    const handleGlobalKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        inputRef.current?.focus();
        inputRef.current?.select();
      }
    };
    document.addEventListener('keydown', handleGlobalKey);
    return () => document.removeEventListener('keydown', handleGlobalKey);
  }, []);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      setOpen(false);
      inputRef.current?.blur();
      return;
    }
    if (!open || flatResults.length === 0) return;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIndex((prev) => (prev < flatResults.length - 1 ? prev + 1 : 0));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIndex((prev) => (prev > 0 ? prev - 1 : flatResults.length - 1));
    } else if (e.key === 'Enter' && activeIndex >= 0) {
      e.preventDefault();
      handleSelect(flatResults[activeIndex]);
    }
  };

  useEffect(() => {
    if (activeIndex >= 0) {
      const el = document.getElementById(`search-result-${activeIndex}`);
      el?.scrollIntoView({ block: 'nearest' });
    }
  }, [activeIndex]);

  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  const totalCount = results ? getTotalResultCount(results) : 0;
  const showDropdown = open && query.trim().length >= 2;

  return (
    <div ref={containerRef} className="relative w-full">
      <div
        className={`
          relative flex items-center w-full bg-white dark:bg-gray-900
          border rounded-xl shadow-sm transition-all duration-200
          ${showDropdown
            ? 'border-teal-500 dark:border-teal-500 ring-2 ring-teal-500/20 rounded-b-none shadow-lg'
            : 'border-gray-200 dark:border-gray-800 hover:border-gray-300 dark:hover:border-gray-700'
          }
        `}
      >
        <div className="pl-4 flex items-center pointer-events-none">
          {loading ? (
            <Loader2 className="w-5 h-5 text-teal-500 animate-spin" />
          ) : (
            <Search className="w-5 h-5 text-gray-400 dark:text-gray-500" />
          )}
        </div>
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => handleChange(e.target.value)}
          onFocus={() => {
            if (results && query.trim().length >= 2) setOpen(true);
          }}
          onKeyDown={handleKeyDown}
          placeholder="Rechercher un client, un contact, une tache, un acte..."
          className="
            flex-1 py-3.5 px-3 bg-transparent text-gray-900 dark:text-gray-100
            placeholder-gray-400 dark:placeholder-gray-500
            text-[15px] focus:outline-none
          "
        />
        <div className="flex items-center gap-2 pr-4">
          {query && (
            <button
              onClick={handleClear}
              className="p-1 rounded-md text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          )}
          <kbd className="hidden sm:inline-flex items-center gap-1 px-2 py-1 text-xs font-medium text-gray-400 dark:text-gray-500 bg-gray-100 dark:bg-gray-800 rounded-md border border-gray-200 dark:border-gray-700">
            <span className="text-[10px]">Ctrl</span>
            <span>K</span>
          </kbd>
        </div>
      </div>

      {showDropdown && (
        <div className="absolute z-50 w-full bg-white dark:bg-gray-900 border border-t-0 border-teal-500 dark:border-teal-500 rounded-b-xl shadow-xl max-h-[420px] overflow-y-auto">
          {totalCount === 0 && !loading && (
            <div className="px-6 py-8 text-center">
              <Search className="w-8 h-8 text-gray-300 dark:text-gray-600 mx-auto mb-2" />
              <p className="text-sm text-gray-500 dark:text-gray-400">
                Aucun resultat pour "{query}"
              </p>
            </div>
          )}

          {totalCount > 0 && (
            <div className="py-2">
              {CATEGORY_ORDER.map((cat) => {
                const items = results![cat];
                if (items.length === 0) return null;
                const meta = CATEGORY_META[cat];
                const Icon = meta.icon;

                return (
                  <div key={cat}>
                    <div className="px-4 py-2 flex items-center gap-2 sticky top-0 bg-gray-50 dark:bg-gray-800/80 backdrop-blur-sm">
                      <Icon className="w-3.5 h-3.5 text-gray-400 dark:text-gray-500" />
                      <span className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                        {meta.label}
                      </span>
                      <span className="text-xs text-gray-400 dark:text-gray-500">
                        ({items.length})
                      </span>
                    </div>
                    {items.map((item) => {
                      const globalIdx = flatResults.indexOf(item);
                      return (
                        <button
                          key={item.id}
                          id={`search-result-${globalIdx}`}
                          onClick={() => handleSelect(item)}
                          onMouseEnter={() => setActiveIndex(globalIdx)}
                          className={`
                            w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors
                            ${globalIdx === activeIndex
                              ? 'bg-teal-50 dark:bg-teal-900/20'
                              : 'hover:bg-gray-50 dark:hover:bg-gray-800/50'
                            }
                          `}
                        >
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">
                              {item.label}
                            </p>
                            {item.sublabel && (
                              <p className="text-xs text-gray-500 dark:text-gray-400 truncate mt-0.5">
                                {item.sublabel}
                              </p>
                            )}
                          </div>
                          <span className="flex-shrink-0 text-[10px] font-medium text-gray-400 dark:text-gray-500 bg-gray-100 dark:bg-gray-800 px-2 py-0.5 rounded-full">
                            {meta.label}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                );
              })}
            </div>
          )}

          {totalCount > 0 && (
            <div className="px-4 py-2 border-t border-gray-100 dark:border-gray-800 flex items-center justify-between">
              <span className="text-xs text-gray-400 dark:text-gray-500">
                {totalCount} resultat{totalCount > 1 ? 's' : ''}
              </span>
              <div className="flex items-center gap-3 text-xs text-gray-400 dark:text-gray-500">
                <span className="flex items-center gap-1">
                  <kbd className="px-1.5 py-0.5 bg-gray-100 dark:bg-gray-800 rounded text-[10px] border border-gray-200 dark:border-gray-700">
                    ↑↓
                  </kbd>
                  naviguer
                </span>
                <span className="flex items-center gap-1">
                  <kbd className="px-1.5 py-0.5 bg-gray-100 dark:bg-gray-800 rounded text-[10px] border border-gray-200 dark:border-gray-700">
                    ↵
                  </kbd>
                  ouvrir
                </span>
                <span className="flex items-center gap-1">
                  <kbd className="px-1.5 py-0.5 bg-gray-100 dark:bg-gray-800 rounded text-[10px] border border-gray-200 dark:border-gray-700">
                    esc
                  </kbd>
                  fermer
                </span>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
