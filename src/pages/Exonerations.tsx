import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import { Card, CardContent } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Badge } from '../components/ui/Badge';
import { ConfirmDialog } from '../components/ui/ConfirmDialog';
import { ExonerationFormModal } from '../components/exonerations/ExonerationFormModal';
import { ExonerationTimeline } from '../components/exonerations/ExonerationTimeline';
import {
  fetchExonerations,
  deleteExoneration,
  getCurrentRate,
  getRemainingTime,
  EXONERATION_TYPES,
  ExonerationWithClient,
} from '../lib/exonerationService';
import {
  Plus,
  Search,
  FileWarning,
  ChevronDown,
  ChevronUp,
  Pencil,
  Trash2,
  TrendingDown,
  CheckCircle,
  Clock,
  Building2,
  Filter,
  Paperclip,
} from 'lucide-react';

type RateFilter = 'all' | '100' | '75' | '50' | '25' | 'expired';

function getRateBadge(rate: number, isExpired: boolean) {
  if (isExpired) return <Badge variant="gray">Expire</Badge>;
  if (rate === 100) return <Badge variant="success">100%</Badge>;
  if (rate === 75) return <Badge variant="info">75%</Badge>;
  if (rate === 50) return <Badge variant="warning">50%</Badge>;
  if (rate === 25) return <Badge variant="orange">25%</Badge>;
  return <Badge variant="gray">{rate}%</Badge>;
}

function getTypeLabel(value: string): string {
  return EXONERATION_TYPES.find((t) => t.value === value)?.label || value;
}

export function Exonerations() {
  const { profile } = useAuth();
  const { showToast } = useToast();

  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState<ExonerationWithClient[]>([]);
  const [search, setSearch] = useState('');
  const [rateFilter, setRateFilter] = useState<RateFilter>('all');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [editingItem, setEditingItem] = useState<ExonerationWithClient | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<ExonerationWithClient | null>(null);
  const [deleting, setDeleting] = useState(false);

  const loadData = useCallback(async () => {
    if (!profile) {
      setLoading(false);
      return;
    }
    try {
      const data = await fetchExonerations();
      setItems(data);
    } catch {
      showToast('Erreur lors du chargement des exonerations', 'error');
    } finally {
      setLoading(false);
    }
  }, [profile, showToast]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleSaved = () => {
    showToast(
      editingItem ? 'Exoneration modifiee' : 'Exoneration ajoutee',
      'success'
    );
    setEditingItem(null);
    loadData();
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await deleteExoneration(deleteTarget.id);
      showToast('Exoneration supprimee', 'success');
      setDeleteTarget(null);
      loadData();
    } catch {
      showToast('Erreur lors de la suppression', 'error');
    } finally {
      setDeleting(false);
    }
  };

  const enriched = items.map((item) => {
    const { rate, isExpired } = getCurrentRate(item.date_debut);
    return { ...item, currentRate: rate, isExpired };
  });

  const filtered = enriched.filter((item) => {
    if (search.trim()) {
      const q = search.toLowerCase();
      const match =
        item.client.nom_entreprise.toLowerCase().includes(q) ||
        item.client.siren?.includes(q) ||
        item.type_exoneration.toLowerCase().includes(q);
      if (!match) return false;
    }

    if (rateFilter !== 'all') {
      if (rateFilter === 'expired') return item.isExpired;
      return item.currentRate === parseInt(rateFilter) && !item.isExpired;
    }

    return true;
  });

  filtered.sort((a, b) =>
    a.client.nom_entreprise.localeCompare(b.client.nom_entreprise, 'fr')
  );

  const stats = {
    total: enriched.length,
    active100: enriched.filter((i) => i.currentRate === 100 && !i.isExpired).length,
    degressif: enriched.filter(
      (i) => [75, 50, 25].includes(i.currentRate) && !i.isExpired
    ).length,
    expired: enriched.filter((i) => i.isExpired).length,
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-teal-600" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
            Exonérations Fiscales
          </h1>
          <p className="text-gray-600 dark:text-gray-400 mt-1">
            Suivi des exonerations degressives de vos clients
          </p>
        </div>
        <Button onClick={() => { setEditingItem(null); setShowForm(true); }}>
          <Plus className="w-4 h-4 mr-2" />
          Ajouter
        </Button>
      </div>

      {items.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <Card>
            <CardContent className="py-4 text-center">
              <div className="flex items-center justify-center gap-1.5">
                <FileWarning className="w-5 h-5 text-gray-400" />
                <p className="text-2xl font-bold text-gray-900 dark:text-white">
                  {stats.total}
                </p>
              </div>
              <p className="text-xs text-gray-500 mt-1">Total</p>
            </CardContent>
          </Card>
          <Card className="border-green-200 dark:border-green-800">
            <CardContent className="py-4 text-center">
              <div className="flex items-center justify-center gap-1.5">
                <CheckCircle className="w-5 h-5 text-green-500" />
                <p className="text-2xl font-bold text-green-600">{stats.active100}</p>
              </div>
              <p className="text-xs text-gray-500 mt-1">Taux plein (100%)</p>
            </CardContent>
          </Card>
          <Card className="border-amber-200 dark:border-amber-800">
            <CardContent className="py-4 text-center">
              <div className="flex items-center justify-center gap-1.5">
                <TrendingDown className="w-5 h-5 text-amber-500" />
                <p className="text-2xl font-bold text-amber-600">{stats.degressif}</p>
              </div>
              <p className="text-xs text-gray-500 mt-1">En degressif</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="py-4 text-center">
              <div className="flex items-center justify-center gap-1.5">
                <Clock className="w-5 h-5 text-gray-400" />
                <p className="text-2xl font-bold text-gray-500">{stats.expired}</p>
              </div>
              <p className="text-xs text-gray-500 mt-1">Expirees</p>
            </CardContent>
          </Card>
        </div>
      )}

      {items.length > 0 && (
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex-1 min-w-[200px] max-w-sm">
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Rechercher un client, SIREN, type..."
              icon={<Search className="w-4 h-4" />}
            />
          </div>
          <div className="flex items-center gap-1.5">
            <Filter className="w-4 h-4 text-gray-400" />
            {([
              { value: 'all', label: 'Tous' },
              { value: '100', label: '100%' },
              { value: '75', label: '75%' },
              { value: '50', label: '50%' },
              { value: '25', label: '25%' },
              { value: 'expired', label: 'Expires' },
            ] as { value: RateFilter; label: string }[]).map((f) => (
              <button
                key={f.value}
                onClick={() => setRateFilter(f.value)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                  rateFilter === f.value
                    ? 'bg-teal-50 border-teal-200 text-teal-700 dark:bg-teal-900/40 dark:border-teal-700 dark:text-teal-300'
                    : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50 dark:bg-gray-800 dark:border-gray-700 dark:text-gray-400 dark:hover:bg-gray-700'
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {filtered.length > 0 ? (
        <div className="space-y-3">
          {filtered.map((item) => {
            const isExpanded = expandedId === item.id;
            const remaining = getRemainingTime(item.date_debut);

            return (
              <Card key={item.id} className="overflow-hidden">
                <div
                  className="flex items-center gap-4 px-5 py-4 cursor-pointer hover:bg-gray-50/50 dark:hover:bg-gray-800/30 transition-colors"
                  onClick={() => setExpandedId(isExpanded ? null : item.id)}
                >
                  <div className="flex-shrink-0">
                    <div className="w-10 h-10 rounded-lg bg-teal-50 dark:bg-teal-900/30 flex items-center justify-center">
                      <Building2 className="w-5 h-5 text-teal-600 dark:text-teal-400" />
                    </div>
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold text-gray-900 dark:text-white truncate">
                        {item.client.nom_entreprise}
                      </span>
                      {item.client.siren && (
                        <span className="text-xs text-gray-400 hidden sm:inline">
                          {item.client.siren}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="text-xs text-gray-500 dark:text-gray-400">
                        {getTypeLabel(item.type_exoneration)}
                      </span>
                      <span className="text-gray-300 dark:text-gray-600">|</span>
                      <span className="text-xs text-gray-500 dark:text-gray-400">
                        Depuis le{' '}
                        {new Date(item.date_debut).toLocaleDateString('fr-FR')}
                      </span>
                    </div>
                  </div>

                  <div className="hidden sm:flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
                    <Clock className="w-3.5 h-3.5" />
                    {remaining}
                  </div>

                  <div className="flex-shrink-0">
                    {getRateBadge(item.currentRate, item.isExpired)}
                  </div>

                  <div className="flex items-center gap-1">
                    <div className="p-1.5" title={item.justificatif_url ? 'Rescrit fiscal joint' : 'Aucun rescrit fiscal'}>
                      <Paperclip className={`w-4 h-4 ${item.justificatif_url ? 'text-teal-500 dark:text-teal-400' : 'text-gray-300 dark:text-gray-600'}`} />
                    </div>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setEditingItem(item);
                        setShowForm(true);
                      }}
                      className="p-1.5 rounded-lg text-gray-400 hover:text-teal-600 hover:bg-teal-50 dark:hover:text-teal-400 dark:hover:bg-teal-900/30 transition-colors"
                    >
                      <Pencil className="w-4 h-4" />
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setDeleteTarget(item);
                      }}
                      className="p-1.5 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50 dark:hover:text-red-400 dark:hover:bg-red-900/30 transition-colors"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                    {isExpanded ? (
                      <ChevronUp className="w-4 h-4 text-gray-400" />
                    ) : (
                      <ChevronDown className="w-4 h-4 text-gray-400" />
                    )}
                  </div>
                </div>

                {isExpanded && (
                  <div className="px-5 pb-5 border-t border-gray-100 dark:border-gray-800 pt-4">
                    <ExonerationTimeline item={item} onJustificatifChanged={loadData} />
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      ) : items.length > 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <Search className="w-10 h-10 text-gray-300 mx-auto mb-3" />
            <p className="text-gray-500">Aucun resultat pour cette recherche</p>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="py-16 text-center">
            <FileWarning className="w-14 h-14 text-gray-300 dark:text-gray-600 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-1">
              Aucune exoneration
            </h3>
            <p className="text-sm text-gray-500 dark:text-gray-400 max-w-md mx-auto mb-6">
              Ajoutez vos premieres exonerations fiscales pour suivre leur evolution degressive sur 8 ans.
            </p>
            <Button onClick={() => { setEditingItem(null); setShowForm(true); }}>
              <Plus className="w-4 h-4 mr-2" />
              Ajouter une exoneration
            </Button>
          </CardContent>
        </Card>
      )}

      <ExonerationFormModal
        isOpen={showForm}
        onClose={() => { setShowForm(false); setEditingItem(null); }}
        onSaved={handleSaved}
        editingItem={editingItem}
      />

      <ConfirmDialog
        isOpen={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
        title="Supprimer l'exoneration"
        message={`Supprimer l'exoneration ${deleteTarget?.type_exoneration || ''} pour ${deleteTarget?.client?.nom_entreprise || ''} ? Cette action est irreversible.`}
        confirmText="Supprimer"
        variant="danger"
        loading={deleting}
      />
    </div>
  );
}
