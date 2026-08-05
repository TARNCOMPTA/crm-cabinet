import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Settings,
  Search,
  Target,
  User,
  Plus,
  Eye,
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useShowMyDossiers } from '../hooks/useShowMyDossiers';
import { Card, CardContent } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { OpportunityBoard } from '../components/opportunities/OpportunityBoard';
import { OpportunityConfigModal } from '../components/opportunities/OpportunityConfigModal';
import { OpportunityCreateModal } from '../components/opportunities/OpportunityCreateModal';
import {
  initializeDefaults,
  fetchColumns,
  fetchCards,
  formatEuros,
} from '../lib/opportunityService';
import type {
  OpportunityColumn,
  OpportunityCardWithDetails,
} from '../types/database';

export function Opportunities() {
  const { user, profile, isAdmin } = useAuth();

  const [search, setSearch] = useState('');
  const [showMyDossiers, toggleShowMyDossiers] = useShowMyDossiers();
  const [showInactive, setShowInactive] = useState(false);
  const [showConfig, setShowConfig] = useState(false);
  const [showCreate, setShowCreate] = useState(false);

  const [columns, setColumns] = useState<OpportunityColumn[]>([]);
  const [cards, setCards] = useState<OpportunityCardWithDetails[]>([]);

  const [loading, setLoading] = useState(true);

  const loadData = useCallback(async (silent = false) => {
    if (!profile) {
      setLoading(false);
      return;
    }

    if (!silent) setLoading(true);
    try {
      await initializeDefaults();

      const [cols, cds] = await Promise.all([
        fetchColumns(),
        fetchCards({
          showInactive,
          assigneeId: showMyDossiers && user ? user.id : undefined,
        }),
      ]);

      setColumns(cols);
      setCards(cds);
    } catch {
      setColumns([]);
      setCards([]);
    } finally {
      if (!silent) setLoading(false);
    }
  }, [profile, showInactive, showMyDossiers, user]);

  const refreshData = useCallback(() => loadData(true), [loadData]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const filteredCards = useMemo(() => {
    if (!search.trim()) return cards;
    const q = search.toLowerCase();
    return cards.filter((c) =>
      c.clients?.nom_entreprise?.toLowerCase().includes(q) ||
      c.clients?.numero_dossier?.toLowerCase().includes(q) ||
      c.clients?.siren?.includes(q) ||
      c.prospect_name?.toLowerCase().includes(q)
    );
  }, [cards, search]);

  const totalPipeline = useMemo(() =>
    cards.reduce((sum, c) => sum + (c.montant_estime ? Number(c.montant_estime) : 0), 0),
    [cards]
  );

  if (!profile) {
    return (
      <div>
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Opportunités</h1>
        </div>
        <Card>
          <CardContent className="py-12 text-center">
            <Target className="w-12 h-12 text-gray-400 mx-auto mb-4" />
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
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Opportunités</h1>
          <p className="text-gray-600 dark:text-gray-400 mt-1">
            {cards.length} opportunite{cards.length !== 1 ? 's' : ''}
            {totalPipeline > 0 && <> &mdash; {formatEuros(totalPipeline)} de pipeline</>}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {isAdmin && (
            <Button variant="outline" onClick={() => setShowConfig(true)}>
              <Settings className="w-4 h-4 mr-2" />
              Configurer
            </Button>
          )}
          <Button onClick={() => setShowCreate(true)}>
            <Plus className="w-4 h-4 mr-2" />
            Nouvelle opportunite
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3 mb-4">
        <div className="flex-1 min-w-[180px] max-w-xs">
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Rechercher..."
            icon={<Search className="w-4 h-4" />}
          />
        </div>

        <button
          onClick={toggleShowMyDossiers}
          className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium border transition-colors ${
            showMyDossiers
              ? 'bg-teal-50 dark:bg-teal-900/40 border-teal-200 dark:border-teal-700 text-teal-700 dark:text-teal-400'
              : 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700'
          }`}
        >
          <User className="w-4 h-4" />
          Mes opportunites
        </button>

        <button
          onClick={() => setShowInactive(!showInactive)}
          className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium border transition-colors ${
            showInactive
              ? 'bg-amber-50 dark:bg-amber-900/40 border-amber-200 dark:border-amber-700 text-amber-700 dark:text-amber-400'
              : 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700'
          }`}
        >
          <Eye className="w-4 h-4" />
          Inactifs
        </button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-teal-600" />
        </div>
      ) : columns.length === 0 ? (
        <Card>
          <CardContent className="py-16 text-center">
            <Target className="w-12 h-12 text-gray-400 mx-auto mb-4" />
            <p className="text-gray-900 dark:text-gray-100 font-medium mb-2">Aucune colonne configuree</p>
            <p className="text-gray-500 dark:text-gray-400 mb-4">
              Configurez le pipeline pour commencer a suivre vos opportunites.
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
            <Target className="w-12 h-12 text-gray-400 mx-auto mb-4" />
            <p className="text-gray-900 dark:text-gray-100 font-medium mb-2">
              Aucune opportunite
            </p>
            <p className="text-gray-500 dark:text-gray-400 mb-4">
              Creez votre premiere opportunite pour demarrer le suivi commercial.
            </p>
            <Button onClick={() => setShowCreate(true)}>
              <Plus className="w-4 h-4 mr-2" />
              Nouvelle opportunite
            </Button>
          </CardContent>
        </Card>
      ) : (
        <OpportunityBoard
          columns={columns}
          cards={filteredCards}
          onCardsChanged={refreshData}
        />
      )}

      {isAdmin && (
        <OpportunityConfigModal
          isOpen={showConfig}
          onClose={() => setShowConfig(false)}
          columns={columns}
          onSaved={loadData}
        />
      )}

      <OpportunityCreateModal
        isOpen={showCreate}
        onClose={() => setShowCreate(false)}
        columns={columns}
        onCreated={() => {
          loadData();
        }}
      />
    </div>
  );
}
