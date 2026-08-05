import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Search,
  LayoutDashboard,
  Briefcase,
  Scale,
  CheckSquare,
  ClipboardList,
  BarChart3,
  Shield,
  Monitor,
  FileWarning,
  Globe,
  Settings,
  Wrench,
  BookUser,
  Target,
  Receipt,
  CalendarClock,
  FileSpreadsheet,
  Building2,
  Plus,
  ArrowRight,
  Command,
  CornerDownLeft,
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';

type CommandItem = {
  id: string;
  label: string;
  hint?: string;
  icon: React.ComponentType<{ className?: string }>;
  group: 'Navigation' | 'Actions rapides' | 'Clients';
  onSelect: () => void;
};

const NAV_ITEMS: Array<{ to: string; icon: CommandItem['icon']; label: string; keywords?: string }> = [
  { to: '/dashboard', icon: LayoutDashboard, label: 'Tableau de bord', keywords: 'home accueil' },
  { to: '/clients', icon: Briefcase, label: 'Clients' },
  { to: '/opportunities', icon: Target, label: 'Opportunités', keywords: 'pipeline prospect' },
  { to: '/tasks', icon: CheckSquare, label: 'Tâches', keywords: 'todo tasks' },
  { to: '/checklists', icon: ClipboardList, label: 'Checklists', keywords: 'checklist liste controle' },
  { to: '/balance-sheets', icon: BarChart3, label: 'Bilans' },
  { to: '/revenue-declarations', icon: FileSpreadsheet, label: 'Déclarations de revenus' },
  { to: '/suivi-echeances', icon: CalendarClock, label: 'Suivi échéances', keywords: 'jedeclare tva liasse teletransmission echeance' },
  { to: '/relances', icon: Receipt, label: 'Relances', keywords: 'impaye facture' },
  { to: '/legal', icon: Scale, label: 'Juridique' },
  { to: '/exemptions', icon: FileWarning, label: 'Exonérations' },
  { to: '/tax-authorizations', icon: Shield, label: 'Habilitations' },
  { to: '/software', icon: Monitor, label: 'Logiciels' },
  { to: '/outils', icon: Wrench, label: 'Outils' },
  { to: '/annuaire', icon: BookUser, label: 'Annuaire' },
  { to: '/directory', icon: Globe, label: 'Liens utiles' },
  { to: '/settings', icon: Settings, label: 'Paramètres' },
];

type ClientHit = {
  id: string;
  nom_entreprise: string | null;
  siret: string | null;
  siren: string | null;
};

interface CommandPaletteProps {
  isOpen: boolean;
  onClose: () => void;
}

export function CommandPalette({ isOpen, onClose }: CommandPaletteProps) {
  const navigate = useNavigate();
  const { profile } = useAuth();
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const [clientHits, setClientHits] = useState<ClientHit[]>([]);
  const [searching, setSearching] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isOpen) {
      setQuery('');
      setActiveIndex(0);
      setClientHits([]);
      setTimeout(() => inputRef.current?.focus(), 10);
    }
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    if (!profile) return;
    const q = query.trim();
    if (q.length < 2) {
      setClientHits([]);
      setSearching(false);
      return;
    }

    let cancelled = false;
    setSearching(true);
    const handle = setTimeout(async () => {
      const pattern = `%${q}%`;
      const { data } = await supabase
        .from('clients')
        .select('id, nom_entreprise, siret, siren')
        .or(
          `nom_entreprise.ilike.${pattern},siret.ilike.${pattern},siren.ilike.${pattern}`
        )
        .limit(6);
      if (!cancelled) {
        setClientHits((data as ClientHit[]) ?? []);
        setSearching(false);
      }
    }, 180);

    return () => {
      cancelled = true;
      clearTimeout(handle);
    };
  }, [query, isOpen, profile]);

  const items = useMemo<CommandItem[]>(() => {
    const normalized = query.trim().toLowerCase();
    const navItems: CommandItem[] = NAV_ITEMS.map((item) => ({
      id: `nav:${item.to}`,
      label: item.label,
      hint: item.to,
      icon: item.icon,
      group: 'Navigation',
      onSelect: () => {
        navigate(item.to);
        onClose();
      },
    }));

    const quickActions: CommandItem[] = [
      {
        id: 'action:new-client',
        label: 'Nouveau client',
        hint: 'Ouvrir la liste des clients',
        icon: Plus,
        group: 'Actions rapides',
        onSelect: () => {
          navigate('/clients?new=1');
          onClose();
        },
      },
      {
        id: 'action:new-task',
        label: 'Nouvelle tache',
        hint: 'Ouvrir la liste des taches',
        icon: Plus,
        group: 'Actions rapides',
        onSelect: () => {
          navigate('/tasks');
          onClose();
        },
      },
      {
        id: 'action:new-opportunity',
        label: 'Nouvelle opportunite',
        hint: 'Ouvrir le pipeline',
        icon: Plus,
        group: 'Actions rapides',
        onSelect: () => {
          navigate('/opportunities');
          onClose();
        },
      },
    ];

    const clientItems: CommandItem[] = clientHits.map((c) => ({
      id: `client:${c.id}`,
      label: c.nom_entreprise || c.siret || c.siren || 'Sans nom',
      hint: [c.siren, c.siret].filter(Boolean).join(' - ') || undefined,
      icon: Building2,
      group: 'Clients',
      onSelect: () => {
        navigate(`/clients/${c.id}`);
        onClose();
      },
    }));

    const filteredNav = normalized
      ? navItems.filter((it) => {
          const src = (it.label + ' ' + (it.hint ?? '')).toLowerCase();
          return src.includes(normalized);
        })
      : navItems;

    const filteredActions = normalized
      ? quickActions.filter((it) => it.label.toLowerCase().includes(normalized))
      : quickActions;

    return [...clientItems, ...filteredActions, ...filteredNav];
  }, [query, clientHits, navigate, onClose]);

  useEffect(() => {
    if (activeIndex >= items.length) setActiveIndex(0);
  }, [items.length, activeIndex]);

  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        setActiveIndex((i) => Math.min(items.length - 1, i + 1));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setActiveIndex((i) => Math.max(0, i - 1));
      } else if (e.key === 'Enter') {
        e.preventDefault();
        const item = items[activeIndex];
        if (item) item.onSelect();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [isOpen, items, activeIndex, onClose]);

  useEffect(() => {
    if (!listRef.current) return;
    const active = listRef.current.querySelector<HTMLElement>(`[data-idx="${activeIndex}"]`);
    if (active) active.scrollIntoView({ block: 'nearest' });
  }, [activeIndex]);

  useEffect(() => {
    document.body.style.overflow = isOpen ? 'hidden' : 'unset';
    return () => { document.body.style.overflow = 'unset'; };
  }, [isOpen]);

  if (!isOpen) return null;

  const grouped = items.reduce<Record<string, CommandItem[]>>((acc, it) => {
    (acc[it.group] ??= []).push(it);
    return acc;
  }, {});

  let globalIdx = -1;

  return (
    <div className="fixed inset-0 z-[60] flex items-start justify-center pt-[10vh] px-4">
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm animate-in fade-in"
        onClick={onClose}
      />
      <div className="relative w-full max-w-2xl bg-white dark:bg-gray-900 rounded-xl shadow-2xl border border-gray-200 dark:border-gray-800 overflow-hidden">
        <div className="flex items-center gap-3 px-4 py-3 border-b border-gray-200 dark:border-gray-800">
          <Search className="w-5 h-5 text-gray-400" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setActiveIndex(0);
            }}
            placeholder="Rechercher un client, naviguer, actions rapides..."
            className="flex-1 bg-transparent outline-none text-gray-900 dark:text-gray-100 placeholder:text-gray-400 text-[15px]"
            aria-label="Commande"
          />
          <kbd className="hidden sm:inline-flex items-center gap-1 px-2 py-0.5 text-[11px] font-medium rounded border border-gray-200 dark:border-gray-700 text-gray-500 dark:text-gray-400 bg-gray-50 dark:bg-gray-800">
            ESC
          </kbd>
        </div>

        <div ref={listRef} className="max-h-[60vh] overflow-y-auto py-2">
          {items.length === 0 && !searching && (
            <div className="px-6 py-10 text-center">
              <Search className="w-8 h-8 mx-auto text-gray-300 dark:text-gray-600 mb-2" />
              <p className="text-sm text-gray-500 dark:text-gray-400">
                Aucun resultat pour "{query}"
              </p>
            </div>
          )}
          {searching && items.length === 0 && (
            <div className="px-6 py-10 text-center text-sm text-gray-500 dark:text-gray-400">
              Recherche en cours...
            </div>
          )}

          {(['Clients', 'Actions rapides', 'Navigation'] as const).map((group) => {
            const groupItems = grouped[group];
            if (!groupItems || groupItems.length === 0) return null;
            return (
              <div key={group} className="mb-1">
                <div className="px-4 pt-2 pb-1 text-[11px] uppercase tracking-wider font-semibold text-gray-400 dark:text-gray-500">
                  {group}
                </div>
                {groupItems.map((it) => {
                  globalIdx += 1;
                  const idx = globalIdx;
                  const Icon = it.icon;
                  const isActive = idx === activeIndex;
                  return (
                    <button
                      key={it.id}
                      data-idx={idx}
                      type="button"
                      onMouseEnter={() => setActiveIndex(idx)}
                      onClick={() => it.onSelect()}
                      className={`w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors ${
                        isActive
                          ? 'bg-teal-50 dark:bg-teal-950/40 text-teal-900 dark:text-teal-100'
                          : 'text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800/60'
                      }`}
                    >
                      <Icon
                        className={`w-4 h-4 flex-shrink-0 ${
                          isActive ? 'text-teal-600 dark:text-teal-400' : 'text-gray-400 dark:text-gray-500'
                        }`}
                      />
                      <span className="flex-1 text-sm font-medium truncate">{it.label}</span>
                      {it.hint && (
                        <span className="text-xs text-gray-400 dark:text-gray-500 truncate max-w-[40%]">
                          {it.hint}
                        </span>
                      )}
                      {isActive && (
                        <ArrowRight className="w-3.5 h-3.5 text-teal-600 dark:text-teal-400" />
                      )}
                    </button>
                  );
                })}
              </div>
            );
          })}
        </div>

        <div className="flex items-center gap-4 px-4 py-2 border-t border-gray-200 dark:border-gray-800 bg-gray-50/60 dark:bg-gray-950/40 text-[11px] text-gray-500 dark:text-gray-400">
          <span className="inline-flex items-center gap-1">
            <kbd className="px-1.5 py-0.5 rounded border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900">
              <CornerDownLeft className="w-3 h-3" />
            </kbd>
            Ouvrir
          </span>
          <span className="inline-flex items-center gap-1">
            <kbd className="px-1.5 py-0.5 rounded border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900">
              Tab
            </kbd>
            Naviguer
          </span>
          <span className="ml-auto inline-flex items-center gap-1">
            <kbd className="px-1.5 py-0.5 rounded border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 inline-flex items-center gap-0.5">
              <Command className="w-3 h-3" />K
            </kbd>
            Ouvrir la palette
          </span>
        </div>
      </div>
    </div>
  );
}
