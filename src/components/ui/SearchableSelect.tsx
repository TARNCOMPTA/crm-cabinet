import { useState, useRef, useEffect, useCallback } from 'react';
import { Search, X, ChevronDown } from 'lucide-react';

interface SearchableSelectOption {
  value: string;
  label: string;
  subtitle?: string;
}

interface SearchableSelectProps {
  label?: string;
  options: SearchableSelectOption[];
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  required?: boolean;
  error?: string;
  disabled?: boolean;
}

export function SearchableSelect({
  label,
  options,
  value,
  onChange,
  placeholder = 'Rechercher...',
  required,
  error,
  disabled,
}: SearchableSelectProps) {
  const [query, setQuery] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  const selectedOption = options.find((o) => o.value === value);

  const filtered = query
    ? options.filter(
        (o) =>
          o.label.toLowerCase().includes(query.toLowerCase()) ||
          o.subtitle?.toLowerCase().includes(query.toLowerCase())
      )
    : options;

  useEffect(() => {
    setHighlightedIndex(0);
  }, [query]);

  useEffect(() => {
    if (!isOpen) {
      setQuery('');
    }
  }, [isOpen]);

  const close = useCallback(() => {
    setIsOpen(false);
  }, []);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        close();
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [close]);

  useEffect(() => {
    if (isOpen && listRef.current) {
      const item = listRef.current.children[highlightedIndex] as HTMLElement | undefined;
      item?.scrollIntoView({ block: 'nearest' });
    }
  }, [highlightedIndex, isOpen]);

  function handleKeyDown(e: React.KeyboardEvent) {
    if (!isOpen) {
      if (e.key === 'ArrowDown' || e.key === 'Enter') {
        e.preventDefault();
        setIsOpen(true);
      }
      return;
    }

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setHighlightedIndex((i) => (i < filtered.length - 1 ? i + 1 : i));
        break;
      case 'ArrowUp':
        e.preventDefault();
        setHighlightedIndex((i) => (i > 0 ? i - 1 : 0));
        break;
      case 'Enter':
        e.preventDefault();
        if (filtered[highlightedIndex]) {
          selectOption(filtered[highlightedIndex].value);
        }
        break;
      case 'Escape':
        e.preventDefault();
        close();
        break;
    }
  }

  function selectOption(val: string) {
    onChange(val);
    close();
  }

  function clearSelection(e: React.MouseEvent) {
    e.stopPropagation();
    onChange('');
    setIsOpen(false);
  }

  function handleTriggerClick() {
    if (disabled) return;
    setIsOpen(true);
    setTimeout(() => inputRef.current?.focus(), 0);
  }

  function highlightMatch(text: string) {
    if (!query) return text;
    const idx = text.toLowerCase().indexOf(query.toLowerCase());
    if (idx === -1) return text;
    return (
      <>
        {text.slice(0, idx)}
        <span className="font-semibold text-teal-600 dark:text-teal-400">
          {text.slice(idx, idx + query.length)}
        </span>
        {text.slice(idx + query.length)}
      </>
    );
  }

  return (
    <div className="w-full" ref={containerRef}>
      {label && (
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
          {label}
          {required && <span className="text-red-500 ml-0.5">*</span>}
        </label>
      )}

      <div className="relative">
        {!isOpen ? (
          <button
            type="button"
            onClick={handleTriggerClick}
            onKeyDown={handleKeyDown}
            disabled={disabled}
            className={`w-full flex items-center justify-between px-3.5 py-2.5 border rounded-xl text-left transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-teal-500/40 bg-white dark:bg-white/[0.04] ${
              error
                ? 'border-red-500'
                : 'border-gray-300 dark:border-gray-700'
            } ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer hover:border-gray-400 dark:hover:border-gray-600'}`}
          >
            {selectedOption ? (
              <div className="flex items-center gap-2 min-w-0 flex-1">
                <span className="text-gray-900 dark:text-gray-100 truncate">
                  {selectedOption.label}
                </span>
                {selectedOption.subtitle && (
                  <span className="text-xs text-gray-500 dark:text-gray-400 truncate">
                    {selectedOption.subtitle}
                  </span>
                )}
              </div>
            ) : (
              <span className="text-gray-400 dark:text-gray-500">
                {placeholder}
              </span>
            )}
            <div className="flex items-center gap-1 ml-2 shrink-0">
              {selectedOption && !disabled && (
                <span
                  role="button"
                  tabIndex={-1}
                  onClick={clearSelection}
                  className="p-0.5 rounded hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
                >
                  <X className="w-3.5 h-3.5" />
                </span>
              )}
              <ChevronDown className="w-4 h-4 text-gray-400" />
            </div>
          </button>
        ) : (
          <div className="relative">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-gray-400 dark:text-gray-500">
              <Search className="w-4 h-4" />
            </div>
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={placeholder}
              className={`w-full pl-9 pr-3 py-2.5 border rounded-xl focus:outline-none focus:ring-2 focus:ring-teal-500/40 bg-white dark:bg-white/[0.04] text-gray-900 dark:text-slate-100 placeholder-gray-400 dark:placeholder-slate-500 ${
                error
                  ? 'border-red-500'
                  : 'border-teal-500 dark:border-teal-500'
              }`}
            />
          </div>
        )}

        {isOpen && (
          <ul
            ref={listRef}
            className="absolute z-50 mt-1.5 w-full max-h-56 overflow-auto rounded-xl border border-gray-200/80 dark:border-white/[0.08] bg-white dark:bg-ink-900/95 dark:backdrop-blur-xl shadow-elevated dark:shadow-dark-card py-1"
          >
            {filtered.length === 0 ? (
              <li className="px-3 py-3 text-sm text-gray-500 dark:text-gray-400 text-center">
                Aucun resultat
              </li>
            ) : (
              filtered.map((option, idx) => (
                <li
                  key={option.value}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    selectOption(option.value);
                  }}
                  onMouseEnter={() => setHighlightedIndex(idx)}
                  className={`px-3 py-2 cursor-pointer text-sm transition-colors ${
                    idx === highlightedIndex
                      ? 'bg-teal-50 dark:bg-teal-900/30 text-teal-900 dark:text-teal-100'
                      : 'text-gray-900 dark:text-gray-100 hover:bg-gray-50 dark:hover:bg-gray-700/50'
                  } ${option.value === value ? 'font-medium' : ''}`}
                >
                  <div className="flex items-center gap-2">
                    <span>{highlightMatch(option.label)}</span>
                    {option.subtitle && (
                      <span
                        className={`text-xs ${
                          idx === highlightedIndex
                            ? 'text-teal-600 dark:text-teal-400'
                            : 'text-gray-500 dark:text-gray-400'
                        }`}
                      >
                        {highlightMatch(option.subtitle)}
                      </span>
                    )}
                  </div>
                </li>
              ))
            )}
          </ul>
        )}
      </div>

      {error && (
        <p className="mt-1 text-sm text-red-600 dark:text-red-400">{error}</p>
      )}
    </div>
  );
}
