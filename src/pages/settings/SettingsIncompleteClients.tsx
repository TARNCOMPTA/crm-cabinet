import { useEffect, useState, useMemo, useCallback, useRef } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../contexts/ToastContext';
import { Card, CardHeader } from '../../components/ui/Card';
import { Input } from '../../components/ui/Input';
import { Select } from '../../components/ui/Select';
import { Button } from '../../components/ui/Button';
import {
  Search, Loader, Download, CheckCircle, Save, X,
  ChevronLeft, ChevronRight, ArrowUpDown, ArrowUp, ArrowDown, Flame, Undo2, Redo2,
  AlertTriangle, Users, RefreshCw,
} from 'lucide-react';
import { Database } from '../../types/database';
import {
  TRACKED_FIELDS, SECONDARY_STAT_FIELDS,
  getMissingFields, getCompleteness,
  getCriticalityScore, isCritical,
  validateField, extractSirenFromSiret,
  type TrackedFieldKey, type EditableFieldKey, type ValidationResult,
} from '../../lib/incompleteFieldsConfig';
import { bulkSyncWithINPI } from '../../lib/inpiService';
import { IncompleteStatsCards } from '../../components/incomplete/IncompleteStatsCards';
import { CompletenessBar } from '../../components/incomplete/CompletenessBar';
import { FieldCell } from '../../components/incomplete/FieldCell';
import { IncompleteBulkActionsBar } from '../../components/incomplete/IncompleteBulkActionsBar';
import { SoftwareManagementModal } from '../../components/settings/SoftwareManagementModal';
import { useRegimesFiscaux } from '../../hooks/useRegimesFiscaux';
import { messageErreur } from '../../lib/erreurs';

/**
 * La ligne complete, et la requete qui va avec (`select('*')`).
 *
 * L'ecran annoncait la ligne entiere mais n'en demandait que quinze colonnes :
 * ni les composants enfants ni les fonctions d'aide ne pouvaient recevoir ce
 * qu'on leur promettait. Restreindre le type a la projection deplacait
 * simplement le probleme chez eux — c'est la requete qui etait en tort.
 * `clients` compte 35 colonnes, toutes courtes, et l'ecran les charge une fois.
 */
type Client = Database['public']['Tables']['clients']['Row'];
type Software = Database['public']['Tables']['software']['Row'];
type ClientUpdate = Partial<
  Pick<Database['public']['Tables']['clients']['Update'], EditableFieldKey>
>;

interface LegalForm {
  code: string;
  label: string;
  level: number;
}

type ClientEdits = Partial<Record<EditableFieldKey, string>>;

interface SoftwareChange {
  action: 'add' | 'remove';
  softwareId: string;
}

const PAGE_SIZE = 30;

export function SettingsIncompleteClients() {
  const { profile } = useAuth();
  const { showToast } = useToast();
  const { regimes: regimesFiscaux } = useRegimesFiscaux();
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [cardFilter, setCardFilter] = useState<string>('all');
  const [currentPage, setCurrentPage] = useState(1);

  const [availableSoftware, setAvailableSoftware] = useState<Software[]>([]);
  const [legalForms, setLegalForms] = useState<LegalForm[]>([]);
  const [clientSoftware, setClientSoftware] = useState<Map<string, string[]>>(new Map());
  const [pendingSoftwareChanges, setPendingSoftwareChanges] = useState<Map<string, SoftwareChange[]>>(new Map());
  const [showSoftwareModal, setShowSoftwareModal] = useState(false);
  const [selectedClientForSoftware, setSelectedClientForSoftware] = useState<Client | null>(null);

  const [editedClients, setEditedClients] = useState<Map<string, ClientEdits>>(new Map());
  const historyRef = useRef<{ past: Map<string, ClientEdits>[]; future: Map<string, ClientEdits>[] }>({ past: [], future: [] });
  const skipHistoryRef = useRef(false);

  type SortKey = 'name' | 'completeness' | 'criticality' | 'status';
  const [sortKey, setSortKey] = useState<SortKey>('criticality');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');

  const [isEnriching, setIsEnriching] = useState(false);
  const [enrichProgress, setEnrichProgress] = useState<{ current: number; total: number } | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [selectAllFiltered, setSelectAllFiltered] = useState(false);
  const headerCheckboxRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    loadData();
  }, [profile]);

  async function loadData() {
    if (!profile) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setLoadError(null);
    try {
      const clientsRes = await supabase
        .from('clients')
        .select('*')
        .neq('statut', 'archive')
        .order('nom_entreprise');
      if (clientsRes.error) {
        console.error('[SettingsIncompleteClients] clients query failed', clientsRes.error);
        throw new Error(`Chargement des clients : ${clientsRes.error.message}`);
      }
      const loadedClients = clientsRes.data || [];
      setClients(loadedClients);

      const softwareRes = await supabase
        .from('software')
        .select('*')
        .eq('is_active', true)
        .order('name');
      if (softwareRes.error) {
        console.error('[SettingsIncompleteClients] software query failed', softwareRes.error);
        throw new Error(`Chargement des logiciels : ${softwareRes.error.message}`);
      }
      setAvailableSoftware(softwareRes.data || []);

      const swMap = new Map<string, string[]>();
      if (loadedClients.length > 0) {
        // Pas de `.in('client_id', ...)` ici : la liste des identifiants partait
        // dans l'URL, qui atteignait 23 114 caracteres avec 649 clients — au-dela
        // du plafond d'en-tetes de Node, d'ou le HTTP 431 « Exceeded maximum
        // allowed HTTP header size ». Le filtre ne servait de toute facon a rien :
        // la table ne contient que les clients de ce cabinet, et la carte n'est
        // relue que pour les clients charges. Voir src/lib/lots.ts pour les
        // endroits ou le filtre est, lui, necessaire.
        const csRes = await supabase
          .from('client_software')
          .select('client_id, software_id');
        if (csRes.error) {
          console.error('[SettingsIncompleteClients] client_software query failed', csRes.error);
          throw new Error(`Chargement des logiciels clients : ${csRes.error.message}`);
        }
        (csRes.data || []).forEach(cs => {
          const arr = swMap.get(cs.client_id) || [];
          arr.push(cs.software_id);
          swMap.set(cs.client_id, arr);
        });
      }
      setClientSoftware(swMap);

      supabase
        .from('legal_forms')
        .select('code, label, level')
        .order('code')
        .then(res => {
          if (res.error) {
            console.error('[SettingsIncompleteClients] legal_forms query failed', res.error);
            return;
          }
          if (res.data) setLegalForms(res.data);
        });
    } catch (error) {
      const message = messageErreur(error, 'Erreur inconnue lors du chargement');
      console.error('[SettingsIncompleteClients] loadData failed', error);
      setLoadError(message);
      showToast(message, 'error');
    } finally {
      setLoading(false);
    }
  }

  function getEffectiveSoftware(clientId: string): string[] {
    const current = clientSoftware.get(clientId) || [];
    const changes = pendingSoftwareChanges.get(clientId) || [];
    let effective = [...current];
    changes.forEach(change => {
      if (change.action === 'add' && !effective.includes(change.softwareId)) {
        effective.push(change.softwareId);
      } else if (change.action === 'remove') {
        effective = effective.filter(id => id !== change.softwareId);
      }
    });
    return effective;
  }

  function getEffectiveValue(client: Client, field: EditableFieldKey): string {
    const edits = editedClients.get(client.id);
    if (edits && edits[field] !== undefined) return edits[field]!;
    if (field === 'capital_social') {
      return client.capital_social !== null && client.capital_social !== undefined
        ? String(client.capital_social)
        : '';
    }
    return (client[field as keyof Client] as string) || '';
  }

  const incompleteClients = useMemo(() => {
    return clients.filter(client => {
      const swIds = clientSoftware.get(client.id) || [];
      const missing = getMissingFields(client, swIds);
      return missing.length > 0;
    });
  }, [clients, clientSoftware]);

  const { fieldCounts, othersCount } = useMemo(() => {
    const counts = new Map<TrackedFieldKey, number>();
    TRACKED_FIELDS.forEach(f => counts.set(f.key, 0));

    incompleteClients.forEach(client => {
      const swIds = clientSoftware.get(client.id) || [];
      const missing = getMissingFields(client, swIds);
      missing.forEach(key => counts.set(key, (counts.get(key) || 0) + 1));
    });

    let othersTotal = 0;
    incompleteClients.forEach(client => {
      const swIds = clientSoftware.get(client.id) || [];
      const missing = getMissingFields(client, swIds);
      if (missing.some(k => SECONDARY_STAT_FIELDS.includes(k))) {
        othersTotal++;
      }
    });

    return { fieldCounts: counts, othersCount: othersTotal };
  }, [incompleteClients, clientSoftware]);

  const criticalCount = useMemo(() => {
    return incompleteClients.filter(client => {
      const swIds = clientSoftware.get(client.id) || [];
      return isCritical(client, swIds);
    }).length;
  }, [incompleteClients, clientSoftware]);

  const sirenDuplicates = useMemo(() => {
    const counts = new Map<string, number>();
    clients.forEach(c => {
      const edits = editedClients.get(c.id);
      const effective = edits?.siren !== undefined ? edits.siren : c.siren ?? '';
      const trimmed = effective.trim();
      if (trimmed) counts.set(trimmed, (counts.get(trimmed) || 0) + 1);
    });
    const dup = new Set<string>();
    counts.forEach((n, k) => { if (n > 1) dup.add(k); });
    return dup;
  }, [clients, editedClients]);

  const filteredClients = useMemo(() => {
    return incompleteClients.filter(client => {
      const matchesSearch = !search ||
        client.nom_entreprise?.toLowerCase().includes(search.toLowerCase()) ||
        client.siren?.includes(search) ||
        client.siret?.includes(search) ||
        client.numero_dossier?.toLowerCase().includes(search.toLowerCase());

      const matchesStatus = filterStatus === 'all' || client.statut === filterStatus;

      const swIds = clientSoftware.get(client.id) || [];
      const missing = getMissingFields(client, swIds);

      let matchesCardFilter = true;
      if (cardFilter !== 'all') {
        if (cardFilter === 'others') {
          matchesCardFilter = missing.some(k => SECONDARY_STAT_FIELDS.includes(k));
        } else if (cardFilter === 'critical') {
          matchesCardFilter = isCritical(client, swIds);
        } else {
          matchesCardFilter = missing.includes(cardFilter as TrackedFieldKey);
        }
      }

      return matchesSearch && matchesStatus && matchesCardFilter;
    });
  }, [incompleteClients, search, filterStatus, cardFilter, clientSoftware]);

  const sortedClients = useMemo(() => {
    const arr = [...filteredClients];
    const direction = sortDir === 'asc' ? 1 : -1;
    arr.sort((a, b) => {
      const swA = clientSoftware.get(a.id) || [];
      const swB = clientSoftware.get(b.id) || [];
      let cmp = 0;
      if (sortKey === 'name') {
        cmp = (a.nom_entreprise || '').localeCompare(b.nom_entreprise || '', 'fr', { sensitivity: 'base' });
      } else if (sortKey === 'status') {
        cmp = (a.statut || '').localeCompare(b.statut || '', 'fr');
      } else if (sortKey === 'completeness') {
        cmp = getCompleteness(a, swA).percent - getCompleteness(b, swB).percent;
      } else {
        cmp = getCriticalityScore(a, swA) - getCriticalityScore(b, swB);
      }
      if (cmp === 0) {
        cmp = (a.nom_entreprise || '').localeCompare(b.nom_entreprise || '', 'fr', { sensitivity: 'base' });
        return cmp;
      }
      return cmp * direction;
    });
    return arr;
  }, [filteredClients, clientSoftware, sortKey, sortDir]);

  const totalPages = Math.max(1, Math.ceil(sortedClients.length / PAGE_SIZE));
  const safePage = Math.min(currentPage, totalPages);
  const paginatedClients = useMemo(() => {
    const start = (safePage - 1) * PAGE_SIZE;
    return sortedClients.slice(start, start + PAGE_SIZE);
  }, [sortedClients, safePage]);

  const toggleSort = useCallback((key: SortKey) => {
    setSortKey(prev => {
      if (prev === key) {
        setSortDir(d => (d === 'asc' ? 'desc' : 'asc'));
        return prev;
      }
      setSortDir(key === 'name' || key === 'status' ? 'asc' : 'desc');
      return key;
    });
  }, []);

  useEffect(() => {
    setCurrentPage(1);
    setSelectedIds(new Set());
    setSelectAllFiltered(false);
  }, [search, filterStatus, cardFilter]);

  const toggleSelectClient = useCallback((clientId: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(clientId)) {
        next.delete(clientId);
      } else {
        next.add(clientId);
      }
      return next;
    });
    setSelectAllFiltered(false);
  }, []);

  const allPageSelected = paginatedClients.length > 0 && paginatedClients.every(c => selectedIds.has(c.id));
  const somePageSelected = paginatedClients.some(c => selectedIds.has(c.id));

  useEffect(() => {
    if (headerCheckboxRef.current) {
      headerCheckboxRef.current.indeterminate = somePageSelected && !allPageSelected;
    }
  }, [somePageSelected, allPageSelected]);

  const toggleSelectAllPage = useCallback(() => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (allPageSelected) {
        paginatedClients.forEach(c => next.delete(c.id));
      } else {
        paginatedClients.forEach(c => next.add(c.id));
      }
      return next;
    });
    setSelectAllFiltered(false);
  }, [allPageSelected, paginatedClients]);

  const selectAllFilteredClients = useCallback(() => {
    setSelectedIds(new Set(filteredClients.map(c => c.id)));
    setSelectAllFiltered(true);
  }, [filteredClients]);

  const clearSelection = useCallback(() => {
    setSelectedIds(new Set());
    setSelectAllFiltered(false);
  }, []);

  const handleFieldChange = useCallback((clientId: string, field: EditableFieldKey, value: string) => {
    setEditedClients(prev => {
      if (!skipHistoryRef.current) {
        historyRef.current.past.push(new Map(prev));
        if (historyRef.current.past.length > 50) historyRef.current.past.shift();
        historyRef.current.future = [];
      }
      const next = new Map(prev);
      next.set(clientId, { ...next.get(clientId), [field]: value });
      return next;
    });
  }, []);

  const handleUndo = useCallback(() => {
    if (historyRef.current.past.length === 0) return;
    setEditedClients(current => {
      const prev = historyRef.current.past.pop()!;
      historyRef.current.future.push(new Map(current));
      skipHistoryRef.current = true;
      setTimeout(() => { skipHistoryRef.current = false; }, 0);
      return prev;
    });
  }, []);

  const handleRedo = useCallback(() => {
    if (historyRef.current.future.length === 0) return;
    setEditedClients(current => {
      const next = historyRef.current.future.pop()!;
      historyRef.current.past.push(new Map(current));
      skipHistoryRef.current = true;
      setTimeout(() => { skipHistoryRef.current = false; }, 0);
      return next;
    });
  }, []);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const tag = target?.tagName;
      const isTypingField = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || (target?.isContentEditable ?? false);
      const mod = e.metaKey || e.ctrlKey;
      if (!mod) return;
      const key = e.key.toLowerCase();
      if (key === 'z' && !e.shiftKey) {
        if (historyRef.current.past.length === 0) return;
        e.preventDefault();
        if (isTypingField) (target as HTMLElement).blur();
        handleUndo();
      } else if ((key === 'z' && e.shiftKey) || key === 'y') {
        if (historyRef.current.future.length === 0) return;
        e.preventDefault();
        if (isTypingField) (target as HTMLElement).blur();
        handleRedo();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [handleUndo, handleRedo]);

  function handleSoftwareToggle(clientId: string, softwareId: string) {
    setPendingSoftwareChanges(prev => {
      const next = new Map(prev);
      const currentChanges = [...(prev.get(clientId) || [])];
      const currentSw = clientSoftware.get(clientId) || [];
      const hasSw = currentSw.includes(softwareId);
      const existIdx = currentChanges.findIndex(c => c.softwareId === softwareId);
      if (existIdx >= 0) {
        currentChanges.splice(existIdx, 1);
      } else {
        currentChanges.push({ action: hasSw ? 'remove' : 'add', softwareId });
      }
      if (currentChanges.length > 0) {
        next.set(clientId, currentChanges);
      } else {
        next.delete(clientId);
      }
      return next;
    });
  }

  const bulkSetField = useCallback((field: EditableFieldKey, value: string) => {
    selectedIds.forEach(clientId => {
      handleFieldChange(clientId, field, value);
    });
  }, [selectedIds, handleFieldChange]);

  const bulkAssignSoftware = useCallback((softwareId: string) => {
    selectedIds.forEach(clientId => {
      const effective = getEffectiveSoftware(clientId);
      if (!effective.includes(softwareId)) {
        handleSoftwareToggle(clientId, softwareId);
      }
    });
  }, [selectedIds, clientSoftware, pendingSoftwareChanges]);

  const sirenReadyForEnrichCount = useMemo(() => {
    let n = 0;
    selectedIds.forEach(id => {
      const c = clients.find(c => c.id === id);
      if (!c) return;
      const edits = editedClients.get(id);
      const siren = edits?.siren !== undefined ? edits.siren : c.siren || '';
      if (siren && siren.trim().length === 9) n++;
    });
    return n;
  }, [selectedIds, clients, editedClients]);

  const handleBulkEnrichINPI = useCallback(async () => {
    const targets: Array<{ id: string; nom_entreprise: string }> = [];
    selectedIds.forEach(id => {
      const c = clients.find(c => c.id === id);
      if (!c) return;
      const edits = editedClients.get(id);
      const siren = edits?.siren !== undefined ? edits.siren : c.siren || '';
      if (siren && siren.trim().length === 9) {
        targets.push({ id: c.id, nom_entreprise: c.nom_entreprise || '' });
      }
    });
    if (targets.length === 0) {
      showToast('Aucun client selectionne avec SIREN valide', 'error');
      return;
    }
    if (editedClients.size > 0 || pendingSoftwareChanges.size > 0) {
      showToast('Enregistrez ou annulez vos modifications en attente avant d\'enrichir', 'error');
      return;
    }
    setIsEnriching(true);
    setEnrichProgress({ current: 0, total: targets.length });
    try {
      const result = await bulkSyncWithINPI(targets, (current, total) => {
        setEnrichProgress({ current, total });
      });
      showToast(
        `Enrichissement termine : ${result.successful} succes, ${result.failed} echec${result.failed > 1 ? 's' : ''}`,
        result.failed === 0 ? 'success' : 'error',
      );
      await loadData();
      clearSelection();
    } catch (e) {
      showToast(messageErreur(e, 'Erreur lors de l\'enrichissement INPI'), 'error');
    } finally {
      setIsEnriching(false);
      setEnrichProgress(null);
    }
  }, [selectedIds, clients, editedClients, pendingSoftwareChanges, showToast, clearSelection]);

  const bulkRemoveSoftware = useCallback((softwareId: string) => {
    selectedIds.forEach(clientId => {
      const effective = getEffectiveSoftware(clientId);
      if (effective.includes(softwareId)) {
        handleSoftwareToggle(clientId, softwareId);
      }
    });
  }, [selectedIds, clientSoftware, pendingSoftwareChanges]);

  const invalidFieldCount = useMemo(() => {
    let n = 0;
    editedClients.forEach((edits) => {
      Object.entries(edits).forEach(([field, value]) => {
        const res = validateField(field as EditableFieldKey, value ?? '');
        if (res.level === 'invalid') n++;
      });
    });
    return n;
  }, [editedClients]);

  const { hasChanges, changeCount } = useMemo(() => {
    let count = 0;
    editedClients.forEach((edits, clientId) => {
      const client = clients.find(c => c.id === clientId);
      if (!client) return;
      const changed = Object.entries(edits).some(([field, value]) => {
        if (field === 'capital_social') {
          const orig = client.capital_social !== null && client.capital_social !== undefined
            ? String(client.capital_social) : '';
          return value !== orig;
        }
        return value !== ((client[field as keyof Client] as string) || '');
      });
      if (changed) count++;
    });
    pendingSoftwareChanges.forEach(changes => {
      if (changes.length > 0) count++;
    });
    return { hasChanges: count > 0, changeCount: count };
  }, [editedClients, pendingSoftwareChanges, clients]);

  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (hasChanges) { e.preventDefault(); e.returnValue = ''; }
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [hasChanges]);

  async function handleSave() {
    if (!profile?.id) return;
    setSaving(true);
    try {
      // Les constructeurs de requete de postgrest-js sont « thenables », pas des
      // Promise : ils n'ont ni catch ni finally. `PromiseLike` les decrit, et
      // suffit a `Promise.all`.
      const promises: PromiseLike<{ error: unknown }>[] = [];

      editedClients.forEach((edits, clientId) => {
        const client = clients.find(c => c.id === clientId);
        if (!client) return;
        // Les cles viennent de `EditableFieldKey` : les annoncer telles quelles
        // evite de presenter a `.update()` des colonnes qu'il refuse.
        const updates: ClientUpdate = {};
        Object.entries(edits).forEach(([field, value]) => {
          if (field === 'capital_social') {
            const orig = client.capital_social !== null && client.capital_social !== undefined
              ? String(client.capital_social) : '';
            if (value !== orig) {
              updates.capital_social = value ? Number(value) : null;
            }
          } else {
            if (value !== ((client[field as keyof Client] as string) || '')) {
              updates[field as Exclude<EditableFieldKey, 'capital_social'>] = value || null;
            }
          }
        });
        if (Object.keys(updates).length > 0) {
          promises.push(supabase.from('clients').update(updates).eq('id', clientId));
        }
      });

      pendingSoftwareChanges.forEach((changes, clientId) => {
        changes.forEach(change => {
          if (change.action === 'add') {
            promises.push(
              supabase.from('client_software').insert({
                client_id: clientId,
                software_id: change.softwareId,
              }),
            );
          } else {
            promises.push(
              supabase.from('client_software')
                .delete()
                .eq('client_id', clientId)
                .eq('software_id', change.softwareId),
            );
          }
        });
      });

      const results = await Promise.all(promises);
      const errors = results.filter(r => r.error);
      if (errors.length > 0) throw new Error(`${errors.length} erreur(s) lors de la sauvegarde`);

      setEditedClients(new Map());
      setPendingSoftwareChanges(new Map());
      clearSelection();
      await loadData();
      showToast('Modifications enregistrees avec succes', 'success');
    } catch (error) {
      showToast(messageErreur(error, 'Erreur lors de la sauvegarde'), 'error');
    } finally {
      setSaving(false);
    }
  }

  function handleCancel() {
    setEditedClients(new Map());
    setPendingSoftwareChanges(new Map());
    clearSelection();
  }

  const exportCSV = useCallback(() => {
    const headers = ['Nom entreprise', ...TRACKED_FIELDS.map(f => f.label), 'Completude'];
    const rows = filteredClients.map(client => {
      const swIds = clientSoftware.get(client.id) || [];
      const comp = getCompleteness(client, swIds);
      const values = TRACKED_FIELDS.map(f => {
        if (f.key === 'software') {
          const ids = getEffectiveSoftware(client.id);
          return ids.length > 0
            ? ids.map(id => availableSoftware.find(s => s.id === id)?.name || id).join('; ')
            : 'MANQUANT';
        }
        if (f.key === 'capital_social') {
          return client.capital_social !== null && client.capital_social !== undefined
            ? String(client.capital_social) : 'MANQUANT';
        }
        const val = client[f.key as keyof Client] as string;
        return val && val.trim() ? val : 'MANQUANT';
      });
      return [
        client.nom_entreprise || '',
        ...values,
        `${comp.filled}/${comp.total} (${comp.percent}%)`,
      ];
    });

    const csvContent = [headers, ...rows]
      .map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(','))
      .join('\n');

    const blob = new Blob(['\ufeff' + csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `donnees-manquantes-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }, [filteredClients, clientSoftware, availableSoftware]);

  function isRowModified(clientId: string): boolean {
    const edits = editedClients.get(clientId);
    if (edits) {
      const client = clients.find(c => c.id === clientId);
      if (client) {
        const changed = Object.entries(edits).some(([field, value]) => {
          if (field === 'capital_social') {
            const orig = client.capital_social !== null && client.capital_social !== undefined
              ? String(client.capital_social) : '';
            return value !== orig;
          }
          return value !== ((client[field as keyof Client] as string) || '');
        });
        if (changed) return true;
      }
    }
    const swChanges = pendingSoftwareChanges.get(clientId);
    return !!(swChanges && swChanges.length > 0);
  }

  const groupedLegalForms = useMemo(() => {
    return legalForms.reduce((acc, form) => {
      if (!acc[form.level]) acc[form.level] = [];
      acc[form.level].push(form);
      return acc;
    }, {} as Record<number, LegalForm[]>);
  }, [legalForms]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader className="w-8 h-8 animate-spin text-teal-600" />
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="space-y-6">
        <div>
          <h2 className="text-2xl font-semibold text-gray-900 mb-1">Donnees manquantes</h2>
          <p className="text-sm text-gray-500">
            Identifiez et completez les informations manquantes de vos clients.
          </p>
        </div>
        <div className="bg-red-50 border border-red-200 rounded-xl p-8 text-center">
          <div className="inline-flex items-center justify-center w-14 h-14 bg-red-100 rounded-full mb-4">
            <AlertTriangle className="w-7 h-7 text-red-600" />
          </div>
          <h3 className="text-lg font-semibold text-red-900 mb-2">
            Echec du chargement des donnees
          </h3>
          <p className="text-sm text-red-700 max-w-md mx-auto mb-5">
            {loadError}
          </p>
          <Button
            onClick={loadData}
            className="bg-red-600 hover:bg-red-700 text-white"
            size="sm"
          >
            <RefreshCw className="w-4 h-4 mr-1.5" />
            Reessayer
          </Button>
        </div>
      </div>
    );
  }

  if (clients.length === 0) {
    return (
      <div className="space-y-6">
        <div>
          <h2 className="text-2xl font-semibold text-gray-900 mb-1">Donnees manquantes</h2>
          <p className="text-sm text-gray-500">
            Identifiez et completez les informations manquantes de vos clients.
          </p>
        </div>
        <div className="text-center py-20">
          <div className="inline-flex items-center justify-center w-20 h-20 bg-gray-100 rounded-full mb-4">
            <Users className="w-10 h-10 text-gray-400" />
          </div>
          <h3 className="text-xl font-semibold text-gray-900 mb-2">
            Aucun client dans ce cabinet
          </h3>
          <p className="text-gray-500 max-w-md mx-auto mb-5">
            Ajoutez des clients depuis la page Clients pour commencer a auditer la qualite des donnees.
          </p>
          <Button
            variant="outline"
            size="sm"
            onClick={loadData}
            className="border-gray-300 text-gray-700 hover:bg-gray-50"
          >
            <RefreshCw className="w-4 h-4 mr-1.5" />
            Rafraichir
          </Button>
        </div>
      </div>
    );
  }

  if (incompleteClients.length === 0) {
    return (
      <div className="space-y-6">
        <div>
          <h2 className="text-2xl font-semibold text-gray-900 mb-1">Donnees manquantes</h2>
          <p className="text-sm text-gray-500">
            Identifiez et completez les informations manquantes de vos clients.
          </p>
        </div>
        <div className="text-center py-20">
          <CheckCircle className="w-20 h-20 text-emerald-400 mx-auto mb-4" />
          <h3 className="text-xl font-semibold text-gray-900 mb-2">
            Tous vos clients sont complets
          </h3>
          <p className="text-gray-500 max-w-md mx-auto">
            Les {clients.length} client{clients.length > 1 ? 's' : ''} de votre cabinet ont l'ensemble de leurs informations renseignees.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-2xl font-semibold text-gray-900 mb-1">Donnees manquantes</h2>
          <p className="text-sm text-gray-500">
            Identifiez et completez les informations manquantes directement depuis ce tableau.
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={exportCSV}
          className="border-gray-300 text-gray-700 hover:bg-gray-50 shrink-0"
        >
          <Download className="w-4 h-4 mr-1.5" />
          Exporter CSV
        </Button>
      </div>

      <IncompleteStatsCards
        totalIncomplete={incompleteClients.length}
        criticalCount={criticalCount}
        fieldCounts={fieldCounts}
        othersCount={othersCount}
        activeFilter={cardFilter}
        onFilterChange={setCardFilter}
      />

      <Card className="overflow-hidden border-gray-200 shadow-sm">
        <CardHeader className="border-b border-gray-100 bg-white">
          <div className="flex flex-col md:flex-row gap-3">
            <div className="flex-1 min-w-0 relative">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 z-10" />
              <Input
                type="text"
                placeholder="Rechercher par nom, SIREN, n\u00b0 dossier..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="pl-10 h-10 border-gray-300 focus:border-teal-500 focus:ring-1 focus:ring-teal-500 text-sm"
              />
            </div>
            <div className="shrink-0 md:w-48">
              <Select
                value={filterStatus}
                onChange={e => setFilterStatus(e.target.value)}
                className="h-10 border-gray-300 focus:border-teal-500 focus:ring-1 focus:ring-teal-500 text-sm"
              >
                <option value="all">Tous les statuts</option>
                <option value="actif">Actif</option>
                <option value="inactif">Inactif</option>
                <option value="prospect">Prospect</option>
              </Select>
            </div>
            <div className="shrink-0">
              <span className="inline-flex items-center h-10 px-3 text-sm text-gray-600 bg-gray-100 rounded-lg font-medium">
                {filteredClients.length} client{filteredClients.length !== 1 ? 's' : ''}
              </span>
            </div>
          </div>
        </CardHeader>

        {selectedIds.size > 0 && (
          <IncompleteBulkActionsBar
            selectedCount={selectedIds.size}
            sirenReadyCount={sirenReadyForEnrichCount}
            isEnriching={isEnriching}
            enrichProgress={enrichProgress}
            groupedLegalForms={groupedLegalForms}
            availableSoftware={availableSoftware}
            regimesFiscaux={regimesFiscaux}
            onBulkSetField={bulkSetField}
            onBulkAssignSoftware={bulkAssignSoftware}
            onBulkRemoveSoftware={bulkRemoveSoftware}
            onBulkEnrichINPI={handleBulkEnrichINPI}
            onClearSelection={clearSelection}
          />
        )}

        {allPageSelected && filteredClients.length > PAGE_SIZE && (
          <div className="bg-teal-50/60 border-t border-teal-100 px-4 py-2.5 text-center text-sm text-gray-600">
            {selectAllFiltered ? (
              <>
                Les <strong className="text-teal-700">{filteredClients.length}</strong> clients correspondant aux filtres sont selectionnes.{' '}
                <button onClick={clearSelection} className="text-teal-600 hover:text-teal-700 font-medium underline underline-offset-2 transition-colors">
                  Tout deselectionner
                </button>
              </>
            ) : (
              <>
                Les {paginatedClients.length} clients de cette page sont selectionnes.{' '}
                <button onClick={selectAllFilteredClients} className="text-teal-600 hover:text-teal-700 font-medium underline underline-offset-2 transition-colors">
                  Selectionner les {filteredClients.length} clients correspondant aux filtres
                </button>
              </>
            )}
          </div>
        )}

        {filteredClients.length === 0 ? (
          <div className="text-center py-16">
            <Search className="w-16 h-16 text-gray-300 mx-auto mb-4" />
            <p className="text-gray-500 text-sm font-medium">Aucun client ne correspond aux filtres</p>
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-gray-200 bg-gray-50/50">
                    <th className="sticky left-0 z-20 bg-gray-50 w-[44px] min-w-[44px] py-3.5 px-3">
                      <input
                        ref={headerCheckboxRef}
                        type="checkbox"
                        checked={allPageSelected}
                        onChange={toggleSelectAllPage}
                        className="w-4 h-4 rounded border-gray-300 text-teal-600 focus:ring-teal-500 cursor-pointer"
                      />
                    </th>
                    <th className="sticky left-[44px] z-20 bg-gray-50 text-left py-3.5 px-4 font-medium text-gray-500 text-xs uppercase tracking-wide min-w-[200px] max-w-[240px] shadow-[4px_0_8px_-4px_rgba(0,0,0,0.08)]">
                      <button
                        type="button"
                        onClick={() => toggleSort('name')}
                        className="inline-flex items-center gap-1 hover:text-gray-700 transition-colors"
                      >
                        Entreprise
                        {sortKey === 'name'
                          ? (sortDir === 'asc' ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />)
                          : <ArrowUpDown className="w-3 h-3 opacity-40" />}
                      </button>
                    </th>
                    <th className="text-left py-3.5 px-3 font-medium text-gray-500 text-xs uppercase tracking-wide whitespace-nowrap">
                      <button
                        type="button"
                        onClick={() => toggleSort('completeness')}
                        className="inline-flex items-center gap-1 hover:text-gray-700 transition-colors"
                      >
                        Completude
                        {sortKey === 'completeness'
                          ? (sortDir === 'asc' ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />)
                          : <ArrowUpDown className="w-3 h-3 opacity-40" />}
                      </button>
                    </th>
                    <th className="text-left py-3.5 px-3 font-medium text-gray-500 text-xs uppercase tracking-wide whitespace-nowrap">
                      <button
                        type="button"
                        onClick={() => toggleSort('criticality')}
                        className="inline-flex items-center gap-1 hover:text-gray-700 transition-colors"
                        title="Score pondere : champs primaires (SIREN, forme juridique...) plus lourds, clients actifs x1.5"
                      >
                        Criticite
                        {sortKey === 'criticality'
                          ? (sortDir === 'asc' ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />)
                          : <ArrowUpDown className="w-3 h-3 opacity-40" />}
                      </button>
                    </th>
                    {TRACKED_FIELDS.map(field => (
                      <th
                        key={field.key}
                        className="text-left py-3.5 px-3 font-medium text-gray-500 text-xs uppercase tracking-wide whitespace-nowrap"
                      >
                        {field.shortLabel}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {paginatedClients.map(client => {
                    const modified = isRowModified(client.id);
                    const isSelected = selectedIds.has(client.id);
                    const swIds = clientSoftware.get(client.id) || [];
                    const comp = getCompleteness(client, swIds);
                    const missingKeys = getMissingFields(client, swIds);

                    const rowBg = modified
                      ? 'bg-teal-50/30 hover:bg-teal-50/50'
                      : isSelected
                        ? 'bg-teal-50/20 hover:bg-teal-50/30'
                        : 'bg-white hover:bg-gray-50/50';

                    const cellBg = modified
                      ? 'bg-teal-50/30 group-hover:bg-teal-50/50'
                      : isSelected
                        ? 'bg-teal-50/20 group-hover:bg-teal-50/30'
                        : 'bg-white group-hover:bg-gray-50/50';

                    return (
                      <tr
                        key={client.id}
                        className={`group transition-colors duration-150 ${rowBg}`}
                      >
                        <td className={`sticky left-0 z-10 py-3.5 px-3 ${cellBg}`}>
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => toggleSelectClient(client.id)}
                            className="w-4 h-4 rounded border-gray-300 text-teal-600 focus:ring-teal-500 cursor-pointer"
                          />
                        </td>
                        <td
                          className={`sticky left-[44px] z-10 py-3.5 px-4 font-medium text-gray-900 whitespace-nowrap min-w-[200px] max-w-[240px] truncate shadow-[4px_0_8px_-4px_rgba(0,0,0,0.08)] ${
                            modified
                              ? 'bg-teal-50/30 group-hover:bg-teal-50/50 border-l-4 border-l-teal-500'
                              : cellBg
                          }`}
                          title={client.nom_entreprise || '-'}
                        >
                          <div className="text-sm">{client.nom_entreprise || '-'}</div>
                          <div className="text-xs text-gray-400 font-normal mt-0.5">
                            {client.statut === 'actif' && <span className="text-emerald-600">Actif</span>}
                            {client.statut === 'inactif' && <span className="text-gray-500">Inactif</span>}
                            {client.statut === 'prospect' && <span className="text-blue-600">Prospect</span>}
                          </div>
                        </td>
                        <td className="py-3.5 px-3">
                          <CompletenessBar filled={comp.filled} total={comp.total} percent={comp.percent} />
                        </td>
                        <td className="py-3.5 px-3">
                          {(() => {
                            const score = Math.round(getCriticalityScore(client, swIds));
                            const critical = isCritical(client, swIds);
                            return (
                              <span
                                className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium ${
                                  critical
                                    ? 'bg-red-100 text-red-700'
                                    : score >= 4
                                      ? 'bg-amber-100 text-amber-700'
                                      : 'bg-gray-100 text-gray-600'
                                }`}
                                title={critical ? 'Client critique a completer en priorite' : 'Score de donnees manquantes'}
                              >
                                {critical && <Flame className="w-3 h-3" />}
                                {score}
                              </span>
                            );
                          })()}
                        </td>
                        {TRACKED_FIELDS.map(field => {
                          const value = field.key !== 'software'
                            ? getEffectiveValue(client, field.key as EditableFieldKey)
                            : '';
                          const validation: ValidationResult | undefined = field.key !== 'software'
                            ? validateField(field.key as EditableFieldKey, value)
                            : undefined;
                          const siretValue = field.key === 'siren'
                            ? getEffectiveValue(client, 'siret')
                            : '';
                          const sirenSuggestion = field.key === 'siren'
                            ? extractSirenFromSiret(siretValue)
                            : null;
                          const isDupSiren = field.key === 'siren'
                            && !!value.trim()
                            && sirenDuplicates.has(value.trim());
                          return (
                            <FieldCell
                              key={field.key}
                              client={client}
                              field={field}
                              isMissing={missingKeys.includes(field.key)}
                              effectiveValue={value}
                              effectiveSoftware={getEffectiveSoftware(client.id)}
                              availableSoftware={availableSoftware}
                              groupedLegalForms={groupedLegalForms}
                              regimesFiscaux={regimesFiscaux}
                              validation={validation}
                              isDuplicateSiren={isDupSiren}
                              sirenSuggestion={sirenSuggestion}
                              onFieldChange={handleFieldChange}
                              onOpenSoftwareModal={() => {
                                setSelectedClientForSoftware(client);
                                setShowSoftwareModal(true);
                              }}
                            />
                          );
                        })}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {totalPages > 1 && (
              <div className="flex items-center justify-between px-6 py-3 border-t border-gray-100 bg-gray-50/50">
                <span className="text-sm text-gray-500">
                  {(safePage - 1) * PAGE_SIZE + 1}-{Math.min(safePage * PAGE_SIZE, filteredClients.length)} sur {filteredClients.length}
                </span>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                    disabled={safePage <= 1}
                    className="p-1.5 rounded-lg text-gray-500 hover:bg-gray-200 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                  {Array.from({ length: Math.min(totalPages, 7) }, (_, i) => {
                    let page: number;
                    if (totalPages <= 7) {
                      page = i + 1;
                    } else if (safePage <= 4) {
                      page = i + 1;
                    } else if (safePage >= totalPages - 3) {
                      page = totalPages - 6 + i;
                    } else {
                      page = safePage - 3 + i;
                    }
                    return (
                      <button
                        key={page}
                        onClick={() => setCurrentPage(page)}
                        className={`min-w-[32px] h-8 px-2 rounded-lg text-sm font-medium transition-colors ${
                          page === safePage
                            ? 'bg-teal-600 text-white'
                            : 'text-gray-600 hover:bg-gray-200'
                        }`}
                      >
                        {page}
                      </button>
                    );
                  })}
                  <button
                    onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                    disabled={safePage >= totalPages}
                    className="p-1.5 rounded-lg text-gray-500 hover:bg-gray-200 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              </div>
            )}
          </>
        )}

        {hasChanges && (
          <div className="sticky bottom-0 bg-white border-t border-gray-200 px-6 py-4 flex items-center justify-between shadow-[0_-4px_12px_rgba(0,0,0,0.05)] z-30">
            <div className="flex items-center gap-3">
              <div className="flex items-center justify-center w-8 h-8 bg-teal-100 rounded-full">
                <span className="text-sm font-semibold text-teal-700">{changeCount}</span>
              </div>
              <span className="font-medium text-sm text-gray-700">
                {changeCount} modification{changeCount > 1 ? 's' : ''} en attente
              </span>
              {invalidFieldCount > 0 && (
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium bg-red-50 text-red-700 border border-red-200">
                  {invalidFieldCount} champ{invalidFieldCount > 1 ? 's' : ''} invalide{invalidFieldCount > 1 ? 's' : ''}
                </span>
              )}
              <button
                type="button"
                onClick={handleUndo}
                disabled={historyRef.current.past.length === 0}
                title="Annuler (Ctrl+Z)"
                className="p-1.5 rounded-md text-gray-500 hover:bg-gray-100 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              >
                <Undo2 className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={handleRedo}
                disabled={historyRef.current.future.length === 0}
                title="Retablir (Ctrl+Shift+Z)"
                className="p-1.5 rounded-md text-gray-500 hover:bg-gray-100 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              >
                <Redo2 className="w-4 h-4" />
              </button>
            </div>
            <div className="flex items-center gap-3">
              <Button
                variant="outline"
                size="sm"
                onClick={handleCancel}
                disabled={saving}
                className="border-gray-300 text-gray-700 hover:bg-gray-50"
              >
                <X className="w-4 h-4 mr-1.5" />
                Annuler
              </Button>
              <Button
                variant="primary"
                size="sm"
                onClick={handleSave}
                disabled={saving || invalidFieldCount > 0}
                title={invalidFieldCount > 0 ? 'Corrigez les champs invalides avant de sauvegarder' : undefined}
                className="bg-teal-600 hover:bg-teal-700 text-white"
              >
                {saving ? (
                  <>
                    <Loader className="w-4 h-4 mr-1.5 animate-spin" />
                    Enregistrement...
                  </>
                ) : (
                  <>
                    <Save className="w-4 h-4 mr-1.5" />
                    Enregistrer
                  </>
                )}
              </Button>
            </div>
          </div>
        )}
      </Card>

      <SoftwareManagementModal
        isOpen={showSoftwareModal}
        onClose={() => setShowSoftwareModal(false)}
        client={selectedClientForSoftware}
        availableSoftware={availableSoftware}
        currentSoftwareIds={selectedClientForSoftware ? getEffectiveSoftware(selectedClientForSoftware.id) : []}
        onToggleSoftware={(softwareId) => {
          if (selectedClientForSoftware) {
            handleSoftwareToggle(selectedClientForSoftware.id, softwareId);
          }
        }}
      />
    </div>
  );
}
