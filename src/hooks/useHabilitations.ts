import { useEffect, useState, useCallback, useMemo } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import {
  fetchCabinetHabilitations,
  fetchCabinetClients,
  buildGroupedData,
  importHabilitationsFile,
  clearAllHabilitations,
  updateClientAvancement,
  updateClientCommentaire,
  toggleClientNonConcerne,
  bulkUpdateAvancement,
  bulkToggleNonConcerne,
  computeStats,
} from '../lib/habilitationsService';
import { getCompleteness } from '../lib/habilitationsReference';
import type { GroupedClient, GroupedUnknown, EnrichedClient, HabilitationStats } from '../types/habilitations';
import { messageErreur } from '../lib/erreurs';

interface UseHabilitationsReturn {
  loading: boolean;
  isImporting: boolean;
  isClearing: boolean;
  isRefreshing: boolean;
  showInactiveClients: boolean;
  setShowInactiveClients: (v: boolean) => void;
  clientGroups: GroupedClient[];
  enrichedClients: EnrichedClient[];
  unknownGroups: GroupedUnknown[];
  totalCount: number;
  totalCabinetClients: number;
  lastImportDate: string | null;
  stats: HabilitationStats;
  globalPercentage: number;
  handleImport: (file: File) => Promise<void>;
  handleClearAll: () => Promise<void>;
  handleUpdateAvancement: (clientId: string, value: string) => Promise<void>;
  handleUpdateCommentaire: (clientId: string, value: string) => Promise<void>;
  handleToggleNonConcerne: (clientId: string, value: boolean) => Promise<void>;
  handleBulkAvancement: (clientIds: string[], value: string) => Promise<void>;
  handleBulkNonConcerne: (clientIds: string[], value: boolean) => Promise<void>;
}

export function useHabilitations(): UseHabilitationsReturn {
  const { profile } = useAuth();
  const { showToast } = useToast();

  const [loading, setLoading] = useState(true);
  const [isImporting, setIsImporting] = useState(false);
  const [isClearing, setIsClearing] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [showInactiveClients, setShowInactiveClients] = useState(false);
  const [clientGroups, setClientGroups] = useState<GroupedClient[]>([]);
  const [unknownGroups, setUnknownGroups] = useState<GroupedUnknown[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [totalCabinetClients, setTotalCabinetClients] = useState(0);
  const [lastImportDate, setLastImportDate] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    if (!profile) {
      setLoading(false);
      return;
    }

    try {
      const [allHabilitations, allCabClients] = await Promise.all([
        fetchCabinetHabilitations(),
        fetchCabinetClients(showInactiveClients),
      ]);

      setTotalCabinetClients(allCabClients.length);
      setTotalCount(allHabilitations.length);

      const result = buildGroupedData(allHabilitations, allCabClients);
      setClientGroups(result.clientGroups);
      setUnknownGroups(result.unknownGroups);
      setLastImportDate(result.lastImportDate);
    } catch {
      showToast('Erreur lors du chargement des habilitations', 'error');
    } finally {
      setLoading(false);
    }
  }, [showInactiveClients, showToast]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const enrichedClients = useMemo<EnrichedClient[]>(() => {
    return clientGroups.map((client) => ({
      ...client,
      completeness: getCompleteness(client.services.map((s) => s.service)),
    }));
  }, [clientGroups]);

  const stats = useMemo(() => computeStats(enrichedClients), [enrichedClients]);

  const globalPercentage = stats.applicableCount > 0
    ? Math.round(stats.totalPercentage / stats.applicableCount)
    : 0;

  const handleImport = useCallback(async (file: File) => {
    if (!profile) return;
    setIsImporting(true);
    try {
      const result = await importHabilitationsFile(file, showInactiveClients);
      const dupMsg = result.duplicatesRemoved > 0 ? ` (${result.duplicatesRemoved} doublons ignores)` : '';
      const promoMsg = result.promotedCount > 0
        ? ` — ${result.promotedCount} client${result.promotedCount > 1 ? 's' : ''} passe${result.promotedCount > 1 ? 's' : ''} en Complet`
        : '';
      showToast(
        `${result.imported} habilitations importees — ${result.matched} services pour vos clients, ${result.unmatchedCount} SIREN non references${dupMsg}${promoMsg}`,
        'success'
      );
      setIsRefreshing(true);
      await loadData();
      setIsRefreshing(false);
    } catch (error) {
      showToast(messageErreur(error, "Erreur lors de l'import"), 'error');
    } finally {
      setIsImporting(false);
    }
  }, [showInactiveClients, showToast, loadData]);

  const handleClearAll = useCallback(async () => {
    if (!profile) return;
    if (!window.confirm('Supprimer toutes les habilitations ? Cette action est irreversible.')) return;
    setIsClearing(true);
    try {
      await clearAllHabilitations();
      showToast('Toutes les habilitations ont ete supprimees', 'success');
      await loadData();
    } catch (error) {
      showToast(messageErreur(error, 'Erreur lors de la suppression'), 'error');
    } finally {
      setIsClearing(false);
    }
  }, [showToast, loadData]);

  const handleUpdateAvancement = useCallback(async (clientId: string, value: string) => {
    if (clientId.startsWith('unknown-')) return;
    try {
      await updateClientAvancement(clientId, value);
      setClientGroups((prev) => prev.map((c) => (c.clientId === clientId ? { ...c, avancement: value } : c)));
    } catch {
      showToast('Erreur lors de la mise a jour', 'error');
    }
  }, [showToast]);

  const handleUpdateCommentaire = useCallback(async (clientId: string, value: string) => {
    if (clientId.startsWith('unknown-')) return;
    try {
      await updateClientCommentaire(clientId, value);
      setClientGroups((prev) => prev.map((c) => (c.clientId === clientId ? { ...c, commentaire: value } : c)));
    } catch {
      showToast('Erreur lors de la mise a jour', 'error');
    }
  }, [showToast]);

  const handleToggleNonConcerne = useCallback(async (clientId: string, value: boolean) => {
    try {
      await toggleClientNonConcerne(clientId, value);
      setClientGroups((prev) => prev.map((c) => (c.clientId === clientId ? { ...c, nonConcerne: value } : c)));
    } catch {
      showToast('Erreur lors de la mise a jour', 'error');
    }
  }, [showToast]);

  const handleBulkAvancement = useCallback(async (clientIds: string[], value: string) => {
    const validIds = clientIds.filter((id) => !id.startsWith('unknown-'));
    if (validIds.length === 0) return;
    try {
      await bulkUpdateAvancement(validIds, value);
      setClientGroups((prev) =>
        prev.map((c) => (validIds.includes(c.clientId) ? { ...c, avancement: value } : c))
      );
      showToast(`${validIds.length} client${validIds.length > 1 ? 's' : ''} mis a jour`, 'success');
    } catch {
      showToast('Erreur lors de la mise a jour en masse', 'error');
    }
  }, [showToast]);

  const handleBulkNonConcerne = useCallback(async (clientIds: string[], value: boolean) => {
    const validIds = clientIds.filter((id) => !id.startsWith('unknown-'));
    if (validIds.length === 0) return;
    try {
      await bulkToggleNonConcerne(validIds, value);
      setClientGroups((prev) =>
        prev.map((c) => (validIds.includes(c.clientId) ? { ...c, nonConcerne: value } : c))
      );
      showToast(`${validIds.length} client${validIds.length > 1 ? 's' : ''} mis a jour`, 'success');
    } catch {
      showToast('Erreur lors de la mise a jour en masse', 'error');
    }
  }, [showToast]);

  return {
    loading,
    isImporting,
    isClearing,
    isRefreshing,
    showInactiveClients,
    setShowInactiveClients,
    clientGroups,
    enrichedClients,
    unknownGroups,
    totalCount,
    totalCabinetClients,
    lastImportDate,
    stats,
    globalPercentage,
    handleImport,
    handleClearAll,
    handleUpdateAvancement,
    handleUpdateCommentaire,
    handleToggleNonConcerne,
    handleBulkAvancement,
    handleBulkNonConcerne,
  };
}
