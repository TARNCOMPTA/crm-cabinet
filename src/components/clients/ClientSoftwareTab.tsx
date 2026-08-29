import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { useToast } from '../../contexts/ToastContext';
import { Card, CardContent } from '../ui/Card';
import { Button } from '../ui/Button';
import { Badge } from '../ui/Badge';
import { Modal } from '../ui/Modal';
import { Input } from '../ui/Input';
import { SearchableSelect } from '../ui/SearchableSelect';
import { ConfirmDialog } from '../ui/ConfirmDialog';
import { Package, Plus, Trash2, Calendar } from 'lucide-react';
import { codeErreur } from '../../lib/erreurs';

interface Software {
  id: string;
  name: string;
  category: string;
  description: string | null;
}

interface ClientSoftwareAssignment {
  id: string;
  software_id: string;
  start_date: string | null;
  end_date: string | null;
  notes: string | null;
  software: Software;
}

interface Props {
  clientId: string;
}

const CATEGORIES: Record<string, string> = {
  comptabilite: 'Comptabilite',
  paie: 'Paie',
  facturation: 'Facturation',
  gestion: 'Gestion',
  crm: 'CRM',
  autre: 'Autre',
};

const CATEGORY_COLORS: Record<string, string> = {
  comptabilite: 'bg-teal-100 text-teal-800',
  paie: 'bg-green-100 text-green-800',
  facturation: 'bg-amber-100 text-amber-800',
  gestion: 'bg-cyan-100 text-cyan-800',
  crm: 'bg-pink-100 text-pink-800',
  autre: 'bg-gray-100 text-gray-800',
};

export function ClientSoftwareTab({ clientId }: Props) {
  const { showToast } = useToast();
  const [assignments, setAssignments] = useState<ClientSoftwareAssignment[]>([]);
  const [availableSoftware, setAvailableSoftware] = useState<Software[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    software_id: '',
    start_date: '',
    end_date: '',
    notes: '',
  });

  useEffect(() => {
    loadData();
  }, [clientId]);

  async function loadData() {
    try {
      setLoading(true);
      const [assignmentsRes, softwareRes] = await Promise.all([
        supabase
          .from('client_software')
          .select(`
            id,
            software_id,
            start_date,
            end_date,
            notes,
            software:software_id (
              id,
              name,
              category,
              description
            )
          `)
          .eq('client_id', clientId),
        supabase
          .from('software')
          .select('id, name, category, description')
          .eq('is_active', true)
          .order('name'),
      ]);

      if (assignmentsRes.error) throw assignmentsRes.error;
      if (softwareRes.error) throw softwareRes.error;

      setAssignments(assignmentsRes.data || []);
      setAvailableSoftware(softwareRes.data || []);
    } catch {
      showToast('Erreur lors du chargement des logiciels', 'error');
    } finally {
      setLoading(false);
    }
  }

  function getUnassignedSoftware() {
    const assignedIds = new Set(assignments.map((a) => a.software_id));
    return availableSoftware.filter((s) => !assignedIds.has(s.id));
  }

  async function handleAssign() {
    if (!formData.software_id) {
      showToast('Veuillez selectionner un logiciel', 'error');
      return;
    }

    try {
      const { error } = await supabase.from('client_software').insert({
        client_id: clientId,
        software_id: formData.software_id,
        start_date: formData.start_date || null,
        end_date: formData.end_date || null,
        notes: formData.notes || null,
      });

      if (error) throw error;
      showToast('Logiciel assigne', 'success');
      setShowModal(false);
      setFormData({ software_id: '', start_date: '', end_date: '', notes: '' });
      loadData();
    } catch (error) {
      if (codeErreur(error) === '23505') {
        showToast('Ce logiciel est deja assigne', 'error');
      } else {
        showToast("Erreur lors de l'assignation", 'error');
      }
    }
  }

  async function handleRemove(assignmentId: string) {
    try {
      const { error } = await supabase
        .from('client_software')
        .delete()
        .eq('id', assignmentId);

      if (error) throw error;
      showToast('Logiciel retire', 'success');
      setDeleteConfirm(null);
      loadData();
    } catch {
      showToast('Erreur lors de la suppression', 'error');
    }
  }

  function formatDate(date: string | null) {
    if (!date) return null;
    return new Date(date).toLocaleDateString('fr-FR');
  }

  if (loading) {
    return (
      <Card>
        <CardContent className="py-12">
          <div className="flex items-center justify-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-teal-600" />
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Package className="w-5 h-5 text-gray-500" />
          <h2 className="text-lg font-semibold text-gray-900">Logiciels</h2>
          {assignments.length > 0 && (
            <Badge className="bg-gray-100 text-gray-700">{assignments.length}</Badge>
          )}
        </div>
        <Button
          size="sm"
          onClick={() => setShowModal(true)}
          disabled={getUnassignedSoftware().length === 0}
        >
          <Plus className="w-4 h-4 mr-1.5" />
          Ajouter
        </Button>
      </div>

      {assignments.length === 0 ? (
        <Card>
          <CardContent className="py-12">
            <div className="text-center">
              <Package className="mx-auto h-10 w-10 text-gray-300" />
              <p className="mt-3 text-sm text-gray-500">Aucun logiciel assigne a ce client</p>
              {getUnassignedSoftware().length > 0 && (
                <Button
                  variant="outline"
                  size="sm"
                  className="mt-4"
                  onClick={() => setShowModal(true)}
                >
                  <Plus className="w-4 h-4 mr-1.5" />
                  Assigner un logiciel
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {assignments.map((assignment) => (
            <Card key={assignment.id} className="group hover:shadow-md transition-shadow">
              <CardContent className="py-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1.5">
                      <Package className="w-4 h-4 text-gray-400 flex-shrink-0" />
                      <span className="font-medium text-gray-900 truncate">
                        {assignment.software.name}
                      </span>
                    </div>
                    <Badge className={CATEGORY_COLORS[assignment.software.category] || CATEGORY_COLORS.autre}>
                      {CATEGORIES[assignment.software.category] || assignment.software.category}
                    </Badge>
                  </div>
                  <button
                    onClick={() => setDeleteConfirm(assignment.id)}
                    className="opacity-0 group-hover:opacity-100 p-1.5 text-gray-400 hover:text-red-500 rounded-md hover:bg-red-50 transition-all"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>

                {(assignment.start_date || assignment.end_date) && (
                  <div className="mt-3 flex items-center gap-1.5 text-xs text-gray-500">
                    <Calendar className="w-3.5 h-3.5" />
                    <span>
                      {formatDate(assignment.start_date) || '...'}
                      {' - '}
                      {formatDate(assignment.end_date) || 'en cours'}
                    </span>
                  </div>
                )}

                {assignment.notes && (
                  <p className="mt-2 text-xs text-gray-500 line-clamp-2">{assignment.notes}</p>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Modal
        isOpen={showModal}
        onClose={() => setShowModal(false)}
        title="Assigner un logiciel"
      >
        <div className="space-y-4">
          <SearchableSelect
            label="Logiciel"
            value={formData.software_id}
            onChange={(val) => setFormData({ ...formData, software_id: val })}
            placeholder="Rechercher un logiciel..."
            required
            options={getUnassignedSoftware().map((s) => ({
              value: s.id,
              label: s.name,
              subtitle: CATEGORIES[s.category] || s.category,
            }))}
          />

          <div className="grid grid-cols-2 gap-4">
            <Input
              label="Date de debut"
              type="date"
              value={formData.start_date}
              onChange={(e) => setFormData({ ...formData, start_date: e.target.value })}
            />
            <Input
              label="Date de fin"
              type="date"
              value={formData.end_date}
              onChange={(e) => setFormData({ ...formData, end_date: e.target.value })}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
            <textarea
              value={formData.notes}
              onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
              rows={3}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent resize-none"
              placeholder="Notes optionnelles..."
            />
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <Button variant="outline" onClick={() => setShowModal(false)}>
              Annuler
            </Button>
            <Button onClick={handleAssign} disabled={!formData.software_id}>
              Assigner
            </Button>
          </div>
        </div>
      </Modal>

      <ConfirmDialog
        isOpen={!!deleteConfirm}
        onClose={() => setDeleteConfirm(null)}
        onConfirm={() => deleteConfirm && handleRemove(deleteConfirm)}
        title="Retirer le logiciel"
        message="Voulez-vous retirer ce logiciel du client ?"
        confirmText="Retirer"
        variant="danger"
      />
    </div>
  );
}
