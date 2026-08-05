import { useState, useEffect, useMemo } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import { useShowMyDossiers } from '../hooks/useShowMyDossiers';
import { useCollaboratorAssignments } from '../hooks/useCollaboratorAssignments';
import { Card, CardHeader, CardContent } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { RelanceClientList } from '../components/relances/RelanceClientList';
import { RelanceFormModal } from '../components/relances/RelanceFormModal';
import { RelanceHistoryModal } from '../components/relances/RelanceHistoryModal';
import {
  Plus,
  Search,
  Receipt,
  AlertTriangle,
  Clock,
  CheckCircle2,
  Filter,
  Eye,
  EyeOff,
  UserCheck,
} from 'lucide-react';
import {
  RelanceInvoiceWithClient,
  ReglementData,
  loadRelances,
  deleteRelance,
  enregistrerReglement,
} from '../lib/relanceService';

type StatutFilter = 'all' | 'en_attente' | 'relancee' | 'contentieux';

export function Relances() {
  const { profile } = useAuth();
  const { showToast } = useToast();
  const [showMyDossiers, toggleShowMyDossiers] = useShowMyDossiers();
  const { assignments } = useCollaboratorAssignments(profile?.id);

  const [relances, setRelances] = useState<RelanceInvoiceWithClient[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [statutFilter, setStatutFilter] = useState<StatutFilter>('all');
  const [showPaid, setShowPaid] = useState(false);
  const [showFormModal, setShowFormModal] = useState(false);
  const [editingItem, setEditingItem] = useState<RelanceInvoiceWithClient | null>(null);
  const [historyInvoice, setHistoryInvoice] = useState<RelanceInvoiceWithClient | null>(null);

  useEffect(() => {
    if (profile) {
      loadData();
    } else {
      setLoading(false);
    }
  }, [profile]);

  async function loadData() {
    if (!profile) return;
    setLoading(true);
    try {
      const data = await loadRelances();
      setRelances(data);
    } catch {
      showToast('Erreur lors du chargement des relances', 'error');
    } finally {
      setLoading(false);
    }
  }

  const filtered = useMemo(() => {
    let result = [...relances];

    if (showMyDossiers && profile?.id) {
      const myClientIds = new Set(assignments.map((a) => a.client_id));
      result = result.filter((r) => myClientIds.has(r.client_id));
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(
        (r) =>
          r.clients.nom_entreprise.toLowerCase().includes(q) ||
          r.numero_facture?.toLowerCase().includes(q) ||
          r.clients.siren?.includes(q)
      );
    }

    if (statutFilter !== 'all') {
      result = result.filter((r) => r.statut === statutFilter);
    }

    return result;
  }, [relances, searchQuery, statutFilter, showMyDossiers, assignments, profile?.id]);

  const stats = useMemo(() => {
    const unpaid = relances.filter((r) => r.statut !== 'payee');
    const overdue = unpaid.filter((r) => {
      if (!r.date_echeance) return false;
      return new Date(r.date_echeance) < new Date(new Date().toDateString());
    });
    const totalImpaye = unpaid.reduce((sum, r) => sum + r.montant - (r.montant_regle || 0), 0);
    const totalOverdue = overdue.reduce((sum, r) => sum + r.montant - (r.montant_regle || 0), 0);
    const relancees = relances.filter((r) => r.statut === 'relancee').length;
    const enAttente = relances.filter((r) => r.statut === 'en_attente').length;
    const contentieux = relances.filter((r) => r.statut === 'contentieux').length;

    return {
      totalImpaye,
      totalOverdue,
      countUnpaid: unpaid.length,
      countOverdue: overdue.length,
      relancees,
      enAttente,
      contentieux,
    };
  }, [relances]);

  async function handleDelete(id: string) {
    try {
      await deleteRelance(id);
      showToast('Facture supprimee', 'success');
      loadData();
    } catch {
      showToast('Erreur lors de la suppression', 'error');
    }
  }

  async function handleMarkPaid(id: string, reglement: ReglementData) {
    try {
      await enregistrerReglement(id, reglement);
      showToast('Reglement enregistre', 'success');
      loadData();
    } catch {
      showToast('Erreur lors de la mise a jour', 'error');
    }
  }

  function handleEdit(invoice: RelanceInvoiceWithClient) {
    setEditingItem(invoice);
    setShowFormModal(true);
  }

  function formatCurrency(amount: number) {
    return new Intl.NumberFormat('fr-FR', {
      style: 'currency',
      currency: 'EUR',
    }).format(amount);
  }

  const STATUT_FILTERS: { value: StatutFilter; label: string; count: number }[] = [
    { value: 'all', label: 'Toutes', count: stats.countUnpaid },
    { value: 'en_attente', label: 'En attente', count: stats.enAttente },
    { value: 'relancee', label: 'Relancees', count: stats.relancees },
    { value: 'contentieux', label: 'Contentieux', count: stats.contentieux },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
            <Receipt className="w-7 h-7 text-teal-600 dark:text-teal-400" />
            Relances
          </h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            Suivi des factures impayees et relances clients
          </p>
        </div>
        <Button
          onClick={() => {
            setEditingItem(null);
            setShowFormModal(true);
          }}
        >
          <Plus className="w-4 h-4 mr-1" />
          Nouvelle facture
        </Button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Total impaye
                </p>
                <p className="text-2xl font-bold text-gray-900 dark:text-white mt-1">
                  {formatCurrency(stats.totalImpaye)}
                </p>
              </div>
              <div className="p-3 rounded-xl bg-red-100 dark:bg-red-900/30">
                <Receipt className="w-6 h-6 text-red-600 dark:text-red-400" />
              </div>
            </div>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
              {stats.countUnpaid} facture{stats.countUnpaid > 1 ? 's' : ''} en cours
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  En retard
                </p>
                <p className="text-2xl font-bold text-red-600 dark:text-red-400 mt-1">
                  {formatCurrency(stats.totalOverdue)}
                </p>
              </div>
              <div className="p-3 rounded-xl bg-orange-100 dark:bg-orange-900/30">
                <AlertTriangle className="w-6 h-6 text-orange-600 dark:text-orange-400" />
              </div>
            </div>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
              {stats.countOverdue} facture{stats.countOverdue > 1 ? 's' : ''} en retard
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  En attente
                </p>
                <p className="text-2xl font-bold text-yellow-600 dark:text-yellow-400 mt-1">
                  {stats.enAttente}
                </p>
              </div>
              <div className="p-3 rounded-xl bg-yellow-100 dark:bg-yellow-900/30">
                <Clock className="w-6 h-6 text-yellow-600 dark:text-yellow-400" />
              </div>
            </div>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
              A relancer
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Relancees
                </p>
                <p className="text-2xl font-bold text-teal-600 dark:text-teal-400 mt-1">
                  {stats.relancees}
                </p>
              </div>
              <div className="p-3 rounded-xl bg-teal-100 dark:bg-teal-900/30">
                <CheckCircle2 className="w-6 h-6 text-teal-600 dark:text-teal-400" />
              </div>
            </div>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
              En suivi
            </p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4">
            <div className="flex items-center gap-2 flex-wrap">
              <Filter className="w-4 h-4 text-gray-400" />
              {STATUT_FILTERS.map((f) => (
                <button
                  key={f.value}
                  onClick={() => setStatutFilter(f.value)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                    statutFilter === f.value
                      ? 'bg-teal-100 text-teal-700 dark:bg-teal-900/40 dark:text-teal-300'
                      : 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700'
                  }`}
                >
                  {f.label}
                  {f.count > 0 && (
                    <span className="ml-1.5 px-1.5 py-0.5 rounded-full bg-white/60 dark:bg-black/20 text-[10px]">
                      {f.count}
                    </span>
                  )}
                </button>
              ))}
            </div>

            <div className="flex items-center gap-2 w-full lg:w-auto">
              <button
                onClick={toggleShowMyDossiers}
                className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium transition-colors shrink-0 ${
                  showMyDossiers
                    ? 'bg-teal-100 text-teal-700 dark:bg-teal-900/40 dark:text-teal-300'
                    : 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400'
                }`}
                title={showMyDossiers ? 'Afficher tous les clients' : 'Afficher uniquement mes dossiers'}
              >
                <UserCheck className="w-3.5 h-3.5" />
                Mes dossiers
              </button>

              <button
                onClick={() => setShowPaid(!showPaid)}
                className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium transition-colors shrink-0 ${
                  showPaid
                    ? 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300'
                    : 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400'
                }`}
                title={showPaid ? 'Masquer les factures payees' : 'Afficher les factures payees'}
              >
                {showPaid ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
                Payees
              </button>

              <div className="relative flex-1 lg:w-64">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <Input
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Rechercher..."
                  className="pl-9"
                />
              </div>
            </div>
          </div>
        </CardHeader>

        <CardContent>
          {loading ? (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => (
                <div
                  key={i}
                  className="h-16 rounded-xl bg-gray-100 dark:bg-gray-800 animate-pulse"
                />
              ))}
            </div>
          ) : (
            <RelanceClientList
              relances={filtered}
              onEdit={handleEdit}
              onDelete={handleDelete}
              onMarkPaid={handleMarkPaid}
              onShowHistory={setHistoryInvoice}
              showPaid={showPaid}
            />
          )}
        </CardContent>
      </Card>

      <RelanceFormModal
        isOpen={showFormModal}
        onClose={() => {
          setShowFormModal(false);
          setEditingItem(null);
        }}
        onSaved={() => {
          showToast(editingItem ? 'Facture modifiee' : 'Facture ajoutee', 'success');
          loadData();
        }}
        editingItem={editingItem}
      />

      <RelanceHistoryModal
        isOpen={!!historyInvoice}
        onClose={() => setHistoryInvoice(null)}
        invoice={historyInvoice}
        onRelanceAdded={loadData}
      />
    </div>
  );
}
