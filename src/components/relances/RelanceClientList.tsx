import { useState, useMemo } from 'react';
import { Badge } from '../ui/Badge';
import { ConfirmDialog } from '../ui/ConfirmDialog';
import {
  ChevronDown,
  ChevronRight,
  Pencil,
  Trash2,
  Clock,
  AlertTriangle,
  History,
  Building2,
  Banknote,
} from 'lucide-react';
import { RelanceInvoiceWithClient, ReglementData } from '../../lib/relanceService';
import { ReglementModal } from './ReglementModal';

interface ClientGroup {
  clientId: string;
  clientName: string;
  clientSiren: string | null;
  clientDossier: string | null;
  invoices: RelanceInvoiceWithClient[];
  totalImpaye: number;
  countImpaye: number;
}

interface Props {
  relances: RelanceInvoiceWithClient[];
  onEdit: (invoice: RelanceInvoiceWithClient) => void;
  onDelete: (id: string) => void;
  onMarkPaid: (id: string, reglement: ReglementData) => void;
  onShowHistory: (invoice: RelanceInvoiceWithClient) => void;
  showPaid: boolean;
}

function formatDate(dateStr: string | null) {
  if (!dateStr) return '-';
  return new Date(dateStr).toLocaleDateString('fr-FR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}

function formatCurrency(amount: number) {
  return new Intl.NumberFormat('fr-FR', {
    style: 'currency',
    currency: 'EUR',
  }).format(amount);
}

function getStatutBadge(statut: string) {
  switch (statut) {
    case 'en_attente':
      return { label: 'En attente', variant: 'warning' as const };
    case 'relancee':
      return { label: 'Relancee', variant: 'info' as const };
    case 'contentieux':
      return { label: 'Contentieux', variant: 'danger' as const };
    case 'payee':
      return { label: 'Payee', variant: 'success' as const };
    default:
      return { label: statut, variant: 'default' as const };
  }
}

function isOverdue(dateEcheance: string | null) {
  if (!dateEcheance) return false;
  return new Date(dateEcheance) < new Date(new Date().toDateString());
}

const MODE_LABELS: Record<string, string> = {
  virement: 'Virement',
  cheque: 'Cheque',
  especes: 'Especes',
  prelevement: 'Prelevement',
  cb: 'CB',
  autre: 'Autre',
};

export function RelanceClientList({
  relances,
  onEdit,
  onDelete,
  onMarkPaid,
  onShowHistory,
  showPaid,
}: Props) {
  const [expandedClients, setExpandedClients] = useState<Set<string>>(new Set());
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [reglementInvoice, setReglementInvoice] = useState<RelanceInvoiceWithClient | null>(null);

  const groups = useMemo(() => {
    const filtered = showPaid
      ? relances
      : relances.filter((r) => r.statut !== 'payee');

    const map = new Map<string, ClientGroup>();

    for (const inv of filtered) {
      if (!map.has(inv.client_id)) {
        map.set(inv.client_id, {
          clientId: inv.client_id,
          clientName: inv.clients.nom_entreprise,
          clientSiren: inv.clients.siren,
          clientDossier: inv.clients.numero_dossier,
          invoices: [],
          totalImpaye: 0,
          countImpaye: 0,
        });
      }
      const group = map.get(inv.client_id)!;
      group.invoices.push(inv);
      if (inv.statut !== 'payee') {
        group.totalImpaye += inv.montant - (inv.montant_regle || 0);
        group.countImpaye++;
      }
    }

    const result = Array.from(map.values());
    result.sort((a, b) => a.clientName.localeCompare(b.clientName));

    for (const g of result) {
      g.invoices.sort((a, b) => {
        if (a.statut === 'payee' && b.statut !== 'payee') return 1;
        if (a.statut !== 'payee' && b.statut === 'payee') return -1;
        return (b.date_facture || '').localeCompare(a.date_facture || '');
      });
    }

    return result;
  }, [relances, showPaid]);

  function toggleClient(clientId: string) {
    setExpandedClients((prev) => {
      const next = new Set(prev);
      if (next.has(clientId)) next.delete(clientId);
      else next.add(clientId);
      return next;
    });
  }

  function expandAll() {
    setExpandedClients(new Set(groups.map((g) => g.clientId)));
  }

  function collapseAll() {
    setExpandedClients(new Set());
  }

  if (groups.length === 0) {
    return (
      <div className="text-center py-16 text-gray-400 dark:text-gray-500">
        <AlertTriangle className="w-12 h-12 mx-auto mb-3 opacity-40" />
        <p className="text-lg font-medium">Aucune facture impayee</p>
        <p className="text-sm mt-1">Ajoutez une facture pour commencer le suivi</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-end gap-2 text-xs">
        <button
          onClick={expandAll}
          className="text-teal-600 dark:text-teal-400 hover:underline"
        >
          Tout deployer
        </button>
        <span className="text-gray-300 dark:text-gray-600">|</span>
        <button
          onClick={collapseAll}
          className="text-teal-600 dark:text-teal-400 hover:underline"
        >
          Tout replier
        </button>
      </div>

      {groups.map((group) => {
        const isExpanded = expandedClients.has(group.clientId);
        const hasOverdue = group.invoices.some(
          (inv) => inv.statut !== 'payee' && isOverdue(inv.date_echeance)
        );

        return (
          <div
            key={group.clientId}
            className="border border-gray-200 dark:border-gray-700 rounded-xl overflow-hidden bg-white dark:bg-gray-900 shadow-sm"
          >
            <button
              onClick={() => toggleClient(group.clientId)}
              className="w-full flex items-center gap-3 px-4 py-3 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors"
            >
              <div className="text-gray-400">
                {isExpanded ? (
                  <ChevronDown className="w-5 h-5" />
                ) : (
                  <ChevronRight className="w-5 h-5" />
                )}
              </div>

              <div className="p-2 rounded-lg bg-gray-100 dark:bg-gray-800">
                <Building2 className="w-4 h-4 text-gray-500 dark:text-gray-400" />
              </div>

              <div className="flex-1 text-left min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-gray-900 dark:text-white truncate">
                    {group.clientName}
                  </span>
                  {hasOverdue && (
                    <AlertTriangle className="w-4 h-4 text-red-500 shrink-0" />
                  )}
                </div>
                <div className="flex items-center gap-3 text-xs text-gray-500 dark:text-gray-400">
                  {group.clientDossier && <span>N{group.clientDossier}</span>}
                  {group.clientSiren && <span>SIREN {group.clientSiren}</span>}
                </div>
              </div>

              <div className="text-right shrink-0">
                <span className="text-sm font-bold text-red-600 dark:text-red-400">
                  {formatCurrency(group.totalImpaye)}
                </span>
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  {group.countImpaye} impayee{group.countImpaye > 1 ? 's' : ''}
                </p>
              </div>
            </button>

            {isExpanded && (
              <div className="border-t border-gray-100 dark:border-gray-800">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-gray-50 dark:bg-gray-800/60 text-gray-500 dark:text-gray-400 text-xs uppercase tracking-wider">
                        <th className="px-4 py-2.5 text-left font-medium">Date</th>
                        <th className="px-4 py-2.5 text-left font-medium">N facture</th>
                        <th className="px-4 py-2.5 text-right font-medium">Montant</th>
                        <th className="px-4 py-2.5 text-center font-medium">Echeance</th>
                        <th className="px-4 py-2.5 text-center font-medium">Statut</th>
                        <th className="px-4 py-2.5 text-center font-medium">Reglement</th>
                        <th className="px-4 py-2.5 text-center font-medium">Relances</th>
                        <th className="px-4 py-2.5 text-right font-medium">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                      {group.invoices.map((inv) => {
                        const badge = getStatutBadge(inv.statut);
                        const overdue = inv.statut !== 'payee' && isOverdue(inv.date_echeance);

                        return (
                          <tr
                            key={inv.id}
                            className={`hover:bg-gray-50 dark:hover:bg-gray-800/30 transition-colors ${
                              inv.statut === 'payee' ? 'opacity-50' : ''
                            } ${overdue ? 'bg-red-50/50 dark:bg-red-900/10' : ''}`}
                          >
                            <td className="px-4 py-3 text-gray-700 dark:text-gray-300 whitespace-nowrap">
                              {formatDate(inv.date_facture)}
                            </td>
                            <td className="px-4 py-3 text-gray-600 dark:text-gray-400 whitespace-nowrap font-mono text-xs">
                              {inv.numero_facture || '-'}
                            </td>
                            <td className="px-4 py-3 text-right font-semibold text-gray-900 dark:text-white whitespace-nowrap">
                              {formatCurrency(inv.montant)}
                            </td>
                            <td className="px-4 py-3 text-center whitespace-nowrap">
                              <span className={overdue ? 'text-red-600 dark:text-red-400 font-medium' : 'text-gray-600 dark:text-gray-400'}>
                                {formatDate(inv.date_echeance)}
                              </span>
                              {overdue && (
                                <span className="block text-[10px] text-red-500 font-medium">
                                  En retard
                                </span>
                              )}
                            </td>
                            <td className="px-4 py-3 text-center">
                              <Badge variant={badge.variant}>{badge.label}</Badge>
                            </td>
                            <td className="px-4 py-3 text-center whitespace-nowrap">
                              {inv.date_reglement ? (
                                <div className="space-y-0.5">
                                  <div className="text-xs text-gray-700 dark:text-gray-300 font-medium">
                                    {formatCurrency(inv.montant_regle)}
                                  </div>
                                  <div className="text-[10px] text-gray-500 dark:text-gray-400">
                                    {formatDate(inv.date_reglement)}
                                  </div>
                                  {inv.mode_reglement && (
                                    <span className="inline-block px-1.5 py-0.5 rounded bg-green-100 dark:bg-green-900/30 text-[10px] font-medium text-green-700 dark:text-green-300">
                                      {MODE_LABELS[inv.mode_reglement] || inv.mode_reglement}
                                    </span>
                                  )}
                                  {inv.montant_regle > 0 && inv.montant_regle < inv.montant && (
                                    <span className="block text-[10px] text-amber-600 dark:text-amber-400 font-medium">
                                      Partiel ({Math.round((inv.montant_regle / inv.montant) * 100)}%)
                                    </span>
                                  )}
                                </div>
                              ) : (
                                <span className="text-gray-300 dark:text-gray-600">-</span>
                              )}
                            </td>
                            <td className="px-4 py-3 text-center">
                              <button
                                onClick={() => onShowHistory(inv)}
                                className="inline-flex items-center gap-1 text-xs text-teal-600 dark:text-teal-400 hover:underline"
                                title="Voir l'historique des relances"
                              >
                                <History className="w-3.5 h-3.5" />
                                {inv.nombre_relances}
                              </button>
                            </td>
                            <td className="px-4 py-3">
                              <div className="flex items-center justify-end gap-1">
                                {inv.statut !== 'payee' && (
                                  <button
                                    onClick={() => setReglementInvoice(inv)}
                                    className="p-1.5 rounded-md text-green-600 hover:bg-green-50 dark:hover:bg-green-900/30 transition-colors"
                                    title="Enregistrer un reglement"
                                  >
                                    <Banknote className="w-4 h-4" />
                                  </button>
                                )}
                                <button
                                  onClick={() => onShowHistory(inv)}
                                  className="p-1.5 rounded-md text-teal-600 hover:bg-teal-50 dark:hover:bg-teal-900/30 transition-colors"
                                  title="Enregistrer une relance"
                                >
                                  <Clock className="w-4 h-4" />
                                </button>
                                <button
                                  onClick={() => onEdit(inv)}
                                  className="p-1.5 rounded-md text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                                  title="Modifier"
                                >
                                  <Pencil className="w-4 h-4" />
                                </button>
                                <button
                                  onClick={() => setDeletingId(inv.id)}
                                  className="p-1.5 rounded-md text-red-500 hover:bg-red-50 dark:hover:bg-red-900/30 transition-colors"
                                  title="Supprimer"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        );
      })}

      <ConfirmDialog
        isOpen={!!deletingId}
        onClose={() => setDeletingId(null)}
        onConfirm={() => {
          if (deletingId) {
            onDelete(deletingId);
            setDeletingId(null);
          }
        }}
        title="Supprimer cette facture"
        message="Voulez-vous vraiment supprimer cette facture impayee ? Cette action est irreversible."
        confirmText="Supprimer"
        variant="danger"
      />

      <ReglementModal
        isOpen={!!reglementInvoice}
        onClose={() => setReglementInvoice(null)}
        invoice={reglementInvoice}
        onConfirm={(invoiceId, data) => {
          onMarkPaid(invoiceId, data);
          setReglementInvoice(null);
        }}
      />
    </div>
  );
}
