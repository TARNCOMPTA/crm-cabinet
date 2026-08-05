import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  Settings,
  Search,
  Sparkles,
  BarChart3,
  User,
  Eye,
  ArrowDownAZ,
  Calendar,
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import { useShowMyDossiers } from '../hooks/useShowMyDossiers';
import { Card, CardContent } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Badge } from '../components/ui/Badge';
import { BilanBoard } from '../components/bilan/BilanBoard';
import { BilanConfigModal } from '../components/bilan/BilanConfigModal';
import { supabase } from '../lib/supabase';
import {
  initializeDefaults,
  fetchColumns,
  fetchTemplates,
  fetchCards,
  generateCards,
  getBilanCabinetOptions,
} from '../lib/bilanService';
import { useRegimesFiscaux } from '../hooks/useRegimesFiscaux';
import type {
  BilanColumn,
  BilanChecklistTemplate,
  BilanCardWithDetails,
} from '../types/database';

const MOIS_OPTIONS = [
  { value: '', label: 'Mois cloture' },
  { value: '1', label: 'Janvier' },
  { value: '2', label: 'Fevrier' },
  { value: '3', label: 'Mars' },
  { value: '4', label: 'Avril' },
  { value: '5', label: 'Mai' },
  { value: '6', label: 'Juin' },
  { value: '7', label: 'Juillet' },
  { value: '8', label: 'Aout' },
  { value: '9', label: 'Septembre' },
  { value: '10', label: 'Octobre' },
  { value: '11', label: 'Novembre' },
  { value: '12', label: 'Decembre' },
];

export function BalanceSheets() {
  const { user, profile, isAdmin } = useAuth();
  const { showToast } = useToast();
  const { regimes: REGIMES } = useRegimesFiscaux();

  const [activeRegime, setActiveRegime] = useState('');

  useEffect(() => {
    if (!activeRegime && REGIMES.length > 0) {
      setActiveRegime(REGIMES[0].value);
    }
  }, [REGIMES, activeRegime]);

  const [year, setYear] = useState(new Date().getFullYear());
  const [search, setSearch] = useState('');
  const [showMyDossiers, toggleShowMyDossiers] = useShowMyDossiers();
  const [showInactive, setShowInactive] = useState(false);
  const [sortAlpha, setSortAlpha] = useState(false);
  const [filterMonth, setFilterMonth] = useState<number | ''>('');
  const [showConfig, setShowConfig] = useState(false);

  const [columns, setColumns] = useState<BilanColumn[]>([]);
  const [templates, setTemplates] = useState<BilanChecklistTemplate[]>([]);
  const [cards, setCards] = useState<BilanCardWithDetails[]>([]);
  const [regimeCounts, setRegimeCounts] = useState<Record<string, number>>({});

  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [das2Enabled, setDas2Enabled] = useState(false);

  const loadRegimeCounts = useCallback(async () => {
    if (!profile) return;
    try {
      const { data } = await supabase
        .from('bilan_cards')
        .select('regime_fiscal')
        .eq('year', year);

      const counts: Record<string, number> = {};
      (data || []).forEach((row) => {
        counts[row.regime_fiscal] = (counts[row.regime_fiscal] || 0) + 1;
      });
      setRegimeCounts(counts);
    } catch {
      setRegimeCounts({});
    }
  }, [profile, year]);

  const loadData = useCallback(
    async (silent = false) => {
      if (!profile || !activeRegime) {
        setLoading(false);
        return;
      }

      if (!silent) setLoading(true);
      try {
        await initializeDefaults(activeRegime);

        const [cols, tpls, opts] = await Promise.all([
          fetchColumns(activeRegime),
          fetchTemplates(activeRegime),
          getBilanCabinetOptions(),
        ]);
        setColumns(cols);
        setTemplates(tpls);
        setDas2Enabled(opts?.das2_inpi_enabled ?? false);

        try {
          const cds = await fetchCards(activeRegime, year, {
            showInactive,
            assigneeId: showMyDossiers && user ? user.id : undefined,
          });
          setCards(cds);
        } catch {
          setCards([]);
        }
      } catch {
        setColumns([]);
        setTemplates([]);
        setCards([]);
      } finally {
        if (!silent) setLoading(false);
      }
    },
    [profile, activeRegime, year, showInactive, showMyDossiers, user]
  );

  const refreshData = useCallback(() => loadData(true), [loadData]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  useEffect(() => {
    loadRegimeCounts();
  }, [loadRegimeCounts]);

  async function handleGenerate() {
    if (!profile) return;
    setGenerating(true);
    try {
      const count = await generateCards(activeRegime, year);
      if (count > 0) {
        showToast(`${count} fiche(s) creee(s) pour ${activeRegime} ${year}`, 'success');
      } else {
        showToast('Toutes les fiches existent deja', 'info');
      }
      await loadData();
      await loadRegimeCounts();
    } catch {
      showToast('Erreur lors de la generation des fiches', 'error');
    } finally {
      setGenerating(false);
    }
  }

  const filteredCards = useMemo(() => {
    let result = cards;

    if (filterMonth !== '') {
      result = result.filter((c) => {
        if (!c.clients?.date_cloture) return false;
        const month = new Date(c.clients.date_cloture).getMonth() + 1;
        return month === filterMonth;
      });
    }

    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter(
        (c) =>
          c.clients?.nom_entreprise?.toLowerCase().includes(q) ||
          c.clients?.numero_dossier?.toLowerCase().includes(q) ||
          c.clients?.siren?.includes(q)
      );
    }

    return result;
  }, [cards, filterMonth, search]);

  if (!profile) {
    return (
      <div>
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Suivi des Bilans</h1>
        </div>
        <Card>
          <CardContent className="py-12 text-center">
            <BarChart3 className="w-12 h-12 text-gray-400 mx-auto mb-4" />
            <p className="text-gray-900 dark:text-gray-100 font-medium mb-2">Aucun cabinet assigne</p>
            <p className="text-gray-500 dark:text-gray-400">
              Contactez un administrateur pour obtenir l'acces a un cabinet.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Suivi des Bilans</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            Suivez l'avancement des bilans par regime fiscal
          </p>
        </div>
        {isAdmin && (
          <Button variant="outline" onClick={() => setShowConfig(true)}>
            <Settings className="w-4 h-4 mr-2" />
            Configurer {activeRegime}
          </Button>
        )}
      </div>

      {/* Regime tabs */}
      <div className="flex space-x-1 border-b border-gray-200 dark:border-gray-700 mb-4 overflow-x-auto">
        {REGIMES.map((r) => (
          <button
            key={r.value}
            onClick={() => setActiveRegime(r.value)}
            className={`px-4 py-3 font-medium text-sm transition-colors relative whitespace-nowrap flex items-center gap-2 ${
              activeRegime === r.value
                ? 'text-teal-600 dark:text-teal-400 border-b-2 border-teal-600 dark:border-teal-400'
                : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100 hover:bg-gray-50 dark:hover:bg-gray-800'
            }`}
          >
            {r.label}
            <Badge variant={activeRegime === r.value ? 'info' : 'default'} className="text-xs">
              {regimeCounts[r.value] ?? 0}
            </Badge>
          </button>
        ))}
      </div>

      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-3 mb-5">
        {/* Year picker */}
        <div className="flex items-center gap-1 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg px-1">
          <button
            onClick={() => setYear((y) => y - 1)}
            className="p-1.5 hover:bg-gray-100 dark:hover:bg-gray-700 rounded transition-colors"
          >
            <ChevronLeft className="w-4 h-4 text-gray-600 dark:text-gray-400" />
          </button>
          <span className="text-sm font-semibold text-gray-900 dark:text-gray-100 px-2 min-w-[48px] text-center">
            {year}
          </span>
          <button
            onClick={() => setYear((y) => y + 1)}
            className="p-1.5 hover:bg-gray-100 dark:hover:bg-gray-700 rounded transition-colors"
          >
            <ChevronRight className="w-4 h-4 text-gray-600 dark:text-gray-400" />
          </button>
        </div>

        {/* Generate */}
        <Button
          variant="primary"
          size="sm"
          onClick={handleGenerate}
          disabled={generating}
        >
          <Sparkles className="w-4 h-4 mr-1.5" />
          {generating ? 'Generation...' : `Generer ${year}`}
        </Button>

        {/* Search */}
        <div className="flex-1 min-w-[180px] max-w-xs">
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Rechercher un client..."
            icon={<Search className="w-4 h-4" />}
          />
        </div>

        {/* My dossiers toggle */}
        <ToolbarButton
          active={showMyDossiers}
          onClick={toggleShowMyDossiers}
          icon={<User className="w-4 h-4" />}
          label="Mes bilans"
          activeColor="teal"
        />

        {/* Inactive toggle */}
        <ToolbarButton
          active={showInactive}
          onClick={() => setShowInactive(!showInactive)}
          icon={<Eye className="w-4 h-4" />}
          label="Inactifs"
          activeColor="amber"
        />

        {/* Alpha sort toggle */}
        <ToolbarButton
          active={sortAlpha}
          onClick={() => setSortAlpha(!sortAlpha)}
          icon={<ArrowDownAZ className="w-4 h-4" />}
          label="A-Z"
          activeColor="blue"
        />

        {/* Month filter */}
        <div className="relative inline-flex items-center">
          <Calendar className="w-4 h-4 absolute left-2.5 text-gray-400 dark:text-gray-500 pointer-events-none" />
          <select
            value={filterMonth}
            onChange={(e) => setFilterMonth(e.target.value === '' ? '' : Number(e.target.value))}
            className={`pl-8 pr-3 py-1.5 rounded-lg text-sm font-medium border transition-colors appearance-none cursor-pointer ${
              filterMonth !== ''
                ? 'bg-teal-50 dark:bg-teal-900/40 border-teal-200 dark:border-teal-700 text-teal-700 dark:text-teal-400'
                : 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700'
            }`}
          >
            {MOIS_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Content */}
      {loading ? (
        <div className="flex items-center justify-center h-64">
          <div className="flex flex-col items-center gap-3">
            <div className="animate-spin rounded-full h-10 w-10 border-[3px] border-gray-200 dark:border-gray-700 border-t-teal-600 dark:border-t-teal-400" />
            <span className="text-sm text-gray-500 dark:text-gray-400">Chargement...</span>
          </div>
        </div>
      ) : columns.length === 0 ? (
        <Card>
          <CardContent className="py-16 text-center">
            <BarChart3 className="w-12 h-12 text-gray-400 mx-auto mb-4" />
            <p className="text-gray-900 dark:text-gray-100 font-medium mb-2">Aucune colonne configuree</p>
            <p className="text-gray-500 dark:text-gray-400 mb-4">
              Configurez les colonnes pour le regime {activeRegime} pour commencer.
            </p>
            {isAdmin && (
              <Button onClick={() => setShowConfig(true)}>
                <Settings className="w-4 h-4 mr-2" />
                Configurer
              </Button>
            )}
          </CardContent>
        </Card>
      ) : filteredCards.length === 0 && !search ? (
        <Card>
          <CardContent className="py-16 text-center">
            <Sparkles className="w-12 h-12 text-gray-400 mx-auto mb-4" />
            <p className="text-gray-900 dark:text-gray-100 font-medium mb-2">
              Aucune fiche pour {activeRegime} en {year}
            </p>
            <p className="text-gray-500 dark:text-gray-400 mb-4">
              Generez les fiches bilan pour vos clients {activeRegime}.
            </p>
            <Button onClick={handleGenerate} disabled={generating}>
              <Sparkles className="w-4 h-4 mr-2" />
              Generer les fiches {year}
            </Button>
          </CardContent>
        </Card>
      ) : (
        <BilanBoard
          columns={columns}
          cards={filteredCards}
          sortAlpha={sortAlpha}
          onCardsChanged={refreshData}
          das2Enabled={das2Enabled}
        />
      )}

      {/* Config modal */}
      {isAdmin && (
        <BilanConfigModal
          isOpen={showConfig}
          onClose={() => setShowConfig(false)}
          regime={activeRegime}
          year={year}
          columns={columns}
          templates={templates}
          onSaved={loadData}
          onDas2Changed={setDas2Enabled}
        />
      )}
    </div>
  );
}

function ToolbarButton({
  active,
  onClick,
  icon,
  label,
  activeColor,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
  activeColor: 'teal' | 'amber' | 'blue';
}) {
  const colorMap = {
    teal: 'bg-teal-50 dark:bg-teal-900/40 border-teal-200 dark:border-teal-700 text-teal-700 dark:text-teal-400',
    amber: 'bg-amber-50 dark:bg-amber-900/40 border-amber-200 dark:border-amber-700 text-amber-700 dark:text-amber-400',
    blue: 'bg-blue-50 dark:bg-blue-900/40 border-blue-200 dark:border-blue-700 text-blue-700 dark:text-blue-400',
  };

  return (
    <button
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium border transition-colors ${
        active
          ? colorMap[activeColor]
          : 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700'
      }`}
    >
      {icon}
      {label}
    </button>
  );
}
