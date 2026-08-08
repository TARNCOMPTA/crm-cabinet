import { useState, useEffect, useMemo } from 'react';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { Select } from '../ui/Select';
import { Search, Loader, Save, RotateCcw } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { Database } from '../../types/database';
import { useToast } from '../../contexts/ToastContext';
import { Badge } from '../ui/Badge';
import { useRegimesFiscaux } from '../../hooks/useRegimesFiscaux';
import { useSortableTable } from '../../hooks/useSortableTable';
import { SortableTableWrapper } from '../ui/SortableTableWrapper';
import { SortableRow } from '../ui/SortableRow';

type Client = Database['public']['Tables']['clients']['Row'];

interface AssignmentsManagementModalProps {
  isOpen: boolean;
  onClose: () => void;
  userId: string;
  userName: string;
  onUpdate: () => void;
}

export function AssignmentsManagementModal({
  isOpen,
  onClose,
  userId,
  userName,
  onUpdate
}: AssignmentsManagementModalProps) {
  const { profile } = useAuth();
  const { showToast } = useToast();
  const { regimes: REGIMES_FISCAUX } = useRegimesFiscaux();
  /**
   * La PROJECTION demandee par la requete, pas la ligne entiere : l'ecran ne lit
   * que ces six colonnes, et annoncer les trente-cinq promettait des champs
   * absents.
   */
  type ClientListe = Pick<
    Client,
    'id' | 'nom_entreprise' | 'siret' | 'siren' | 'statut' | 'numero_dossier' | 'regime_fiscal'
  >;
  const [clients, setClients] = useState<ClientListe[]>([]);
  const [assignments, setAssignments] = useState<Set<string>>(new Set());
  const [initialAssignments, setInitialAssignments] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [filterRegime, setFilterRegime] = useState<string>('all');

  useEffect(() => {
    if (isOpen && userId) {
      loadData();
    }
  }, [isOpen, userId]);

  async function loadData() {
    if (!profile) return;

    try {
      setLoading(true);

      const [clientsResult, assignmentsResult] = await Promise.all([
        supabase
          .from('clients')
          // `regime_fiscal` manquait, alors que le filtre par regime la lit.
      .select('id, nom_entreprise, siret, siren, statut, numero_dossier, regime_fiscal')
          .neq('statut', 'archive')
          .order('nom_entreprise'),
        supabase
          .from('client_collaborators')
          .select('client_id')
          .eq('user_id', userId)
      ]);

      if (clientsResult.error) throw clientsResult.error;
      if (assignmentsResult.error) throw assignmentsResult.error;

      setClients(clientsResult.data || []);

      const assignedIds = new Set(
        (assignmentsResult.data || []).map(a => a.client_id)
      );
      setAssignments(assignedIds);
      setInitialAssignments(assignedIds);
    } catch (error) {
      showToast('Erreur lors du chargement des données', 'error');
    } finally {
      setLoading(false);
    }
  }

  const filteredClients = useMemo(() => {
    return clients.filter(client => {
      const matchesSearch =
        client.nom_entreprise?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        client.numero_dossier?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        client.siren?.includes(searchTerm);

      const matchesStatus = filterStatus === 'all' || client.statut === filterStatus;
      const matchesRegime = filterRegime === 'all' || client.regime_fiscal === filterRegime;

      return matchesSearch && matchesStatus && matchesRegime;
    });
  }, [clients, searchTerm, filterStatus, filterRegime]);

  const {
    sortedItems: dndClients,
    orderedIds: dndOrderedIds,
    handleDragEnd,
    isCustomOrder,
    resetOrder,
  } = useSortableTable({
    context: 'assignments',
    items: filteredClients,
    getId: (c) => c.id,
  });

  const toggleAssignment = (clientId: string) => {
    setAssignments(prev => {
      const newSet = new Set(prev);
      if (newSet.has(clientId)) {
        newSet.delete(clientId);
      } else {
        newSet.add(clientId);
      }
      return newSet;
    });
  };

  const handleSave = async () => {
    try {
      setSaving(true);

      const toAdd = Array.from(assignments).filter(id => !initialAssignments.has(id));
      const toRemove = Array.from(initialAssignments).filter(id => !assignments.has(id));

      if (toRemove.length > 0) {
        const { error } = await supabase
          .from('client_collaborators')
          .delete()
          .eq('user_id', userId)
          .in('client_id', toRemove);

        if (error) throw error;
      }

      if (toAdd.length > 0) {
        const inserts = toAdd.map(clientId => ({
          client_id: clientId,
          user_id: userId,
          role: 'assistant'
        }));

        const { error } = await supabase
          .from('client_collaborators')
          .insert(inserts);

        if (error) throw error;
      }

      showToast('Affectations mises à jour avec succès', 'success');
      onUpdate();
      onClose();
    } catch (error: any) {
      showToast('Erreur lors de la sauvegarde', 'error');
    } finally {
      setSaving(false);
    }
  };

  const hasChanges = useMemo(() => {
    if (assignments.size !== initialAssignments.size) return true;
    return Array.from(assignments).some(id => !initialAssignments.has(id));
  }, [assignments, initialAssignments]);

  // `clients.statut` est nullable : DEFAULT 'actif' sans NOT NULL.
  const getStatusBadgeColor = (status: string | null) => {
    switch (status) {
      case 'actif':
        return 'bg-green-100 text-green-800';
      case 'inactif':
        return 'bg-gray-100 text-gray-800';
      case 'prospect':
        return 'bg-blue-100 text-blue-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={`Gérer les affectations de ${userName}`}
      size="xl"
    >
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <Badge variant="info" className="text-base px-4 py-2">
            {assignments.size} client{assignments.size !== 1 ? 's' : ''} assigné{assignments.size !== 1 ? 's' : ''}
          </Badge>
          {hasChanges && (
            <span className="text-sm text-orange-600 font-medium">
              Modifications non sauvegardées
            </span>
          )}
        </div>

        <div className="flex flex-col md:flex-row gap-4">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <Input
              type="text"
              placeholder="Rechercher un client..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10"
            />
          </div>
          <Select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            className="md:w-48"
          >
            <option value="all">Tous les statuts</option>
            <option value="actif">Actif</option>
            <option value="inactif">Inactif</option>
            <option value="prospect">Prospect</option>
          </Select>
          <Select
            value={filterRegime}
            onChange={(e) => setFilterRegime(e.target.value)}
            className="md:w-48"
          >
            <option value="all">Tous les régimes</option>
            {REGIMES_FISCAUX.map((regime) => (
              <option key={regime.value} value={regime.value}>
                {regime.label}
              </option>
            ))}
          </Select>
        </div>

        {isCustomOrder && (
          <div className="flex items-center justify-between">
            <span className="text-xs text-teal-600 font-medium">Ordre personnalise actif</span>
            <button
              onClick={resetOrder}
              className="inline-flex items-center gap-1 text-xs text-gray-500 hover:text-gray-700 transition-colors"
            >
              <RotateCcw className="w-3 h-3" />
              Reinitialiser
            </button>
          </div>
        )}

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader className="w-8 h-8 animate-spin text-blue-600" />
          </div>
        ) : (
          <div className="max-h-96 overflow-auto border border-gray-200 rounded-lg">
            <SortableTableWrapper ids={dndOrderedIds} onDragEnd={handleDragEnd}>
            <table className="w-full">
              <thead className="sticky top-0 bg-gray-50 z-10">
                <tr className="border-b border-gray-200">
                  <th className="w-8 py-3 px-1" />
                  <th className="text-left py-3 px-4 font-semibold text-gray-700 w-12">
                    <input
                      type="checkbox"
                      checked={filteredClients.length > 0 && filteredClients.every(c => assignments.has(c.id))}
                      onChange={(e) => {
                        if (e.target.checked) {
                          setAssignments(new Set([...assignments, ...filteredClients.map(c => c.id)]));
                        } else {
                          const newSet = new Set(assignments);
                          filteredClients.forEach(c => newSet.delete(c.id));
                          setAssignments(newSet);
                        }
                      }}
                      className="w-5 h-5 rounded border-gray-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                    />
                  </th>
                  <th className="text-left py-3 px-4 font-semibold text-gray-700">
                    Nom de l'entreprise
                  </th>
                  <th className="text-left py-3 px-4 font-semibold text-gray-700">
                    N° Dossier
                  </th>
                  <th className="text-left py-3 px-4 font-semibold text-gray-700">
                    Statut
                  </th>
                </tr>
              </thead>
              <tbody>
                {dndClients.map((client) => (
                  <SortableRow
                    key={client.id}
                    id={client.id}
                    className="border-b border-gray-100 hover:bg-gray-50 transition-colors cursor-pointer"
                  >
                    <td className="py-3 px-4">
                      <input
                        type="checkbox"
                        checked={assignments.has(client.id)}
                        onChange={() => toggleAssignment(client.id)}
                        className="w-5 h-5 rounded border-gray-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                      />
                    </td>
                    <td className="py-3 px-4 font-medium text-gray-900 cursor-pointer" onClick={() => toggleAssignment(client.id)}>
                      {client.nom_entreprise || '-'}
                    </td>
                    <td className="py-3 px-4 text-gray-700 cursor-pointer" onClick={() => toggleAssignment(client.id)}>
                      {client.numero_dossier || '-'}
                    </td>
                    <td className="py-3 px-4">
                      <Badge className={getStatusBadgeColor(client.statut)}>
                        {client.statut}
                      </Badge>
                    </td>
                  </SortableRow>
                ))}
              </tbody>
            </table>
            </SortableTableWrapper>
            {dndClients.length === 0 && (
              <div className="text-center py-8 text-gray-500">
                Aucun client trouvé
              </div>
            )}
          </div>
        )}

        <div className="flex justify-end gap-3 pt-4 border-t">
          <Button variant="outline" onClick={onClose}>
            Annuler
          </Button>
          <Button
            onClick={handleSave}
            disabled={!hasChanges || saving}
          >
            {saving ? (
              <>
                <Loader className="w-4 h-4 mr-2 animate-spin" />
                Sauvegarde...
              </>
            ) : (
              <>
                <Save className="w-4 h-4 mr-2" />
                Sauvegarder
              </>
            )}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
