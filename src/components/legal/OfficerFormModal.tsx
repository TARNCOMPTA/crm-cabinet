import { useState, useEffect } from 'react';
import { Modal } from '../ui/Modal';
import { Input } from '../ui/Input';
import { Select } from '../ui/Select';
import { Button } from '../ui/Button';
import { Database } from '../../types/database';

type CompanyOfficer = Database['public']['Tables']['company_officers']['Row'];
type OfficerCompany = Database['public']['Tables']['officer_companies']['Row'];

interface OfficerFormData {
  personType: string;
  firstName: string;
  lastName: string;
  denomination: string;
  role: string;
  startDate: string;
  endDate: string;
  birthDate: string;
  nationality: string;
  isActive: boolean;
  notes: string;
}

interface OfficerFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (data: OfficerFormData, officerId?: string, relationId?: string) => Promise<void>;
  officer?: CompanyOfficer | null;
  relation?: OfficerCompany | null;
  clientName: string;
}

const ROLE_OPTIONS = [
  'Gerant',
  'President',
  'Directeur General',
  'Administrateur',
  'Membre du conseil de surveillance',
  'Associe',
  'Liquidateur',
  'Commissaire aux comptes',
  'Autre',
];

export function OfficerFormModal({ isOpen, onClose, onSave, officer, relation, clientName }: OfficerFormModalProps) {
  const [form, setForm] = useState<OfficerFormData>({
    personType: 'physique',
    firstName: '',
    lastName: '',
    denomination: '',
    role: 'Gerant',
    startDate: new Date().toISOString().split('T')[0],
    endDate: '',
    birthDate: '',
    nationality: '',
    isActive: true,
    notes: '',
  });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (officer && relation) {
      setForm({
        personType: officer.person_type || 'physique',
        firstName: officer.first_name || '',
        lastName: officer.last_name || '',
        denomination: officer.denomination || '',
        role: relation.role || 'Gerant',
        startDate: relation.start_date || new Date().toISOString().split('T')[0],
        endDate: relation.end_date || '',
        birthDate: officer.birth_date || '',
        nationality: officer.nationality || '',
        // `officer_companies.is_active` : DEFAULT true sans NOT NULL.
        isActive: relation.is_active ?? true,
        notes: relation.notes || '',
      });
    } else {
      setForm({
        personType: 'physique',
        firstName: '',
        lastName: '',
        denomination: '',
        role: 'Gerant',
        startDate: new Date().toISOString().split('T')[0],
        endDate: '',
        birthDate: '',
        nationality: '',
        isActive: true,
        notes: '',
      });
    }
  }, [officer, relation, isOpen]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      await onSave(form, officer?.id, relation?.id);
      onClose();
    } finally {
      setSaving(false);
    }
  }

  const isEdit = !!officer && !!relation;
  const isMorale = form.personType === 'morale';

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={isEdit ? 'Modifier le dirigeant' : `Ajouter un dirigeant - ${clientName}`}
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Type de personne</label>
          <div className="flex gap-3">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="radio"
                name="personType"
                value="physique"
                checked={form.personType === 'physique'}
                onChange={() => setForm(f => ({ ...f, personType: 'physique' }))}
                className="text-teal-600 focus:ring-teal-500 dark:bg-gray-700 dark:border-gray-600"
              />
              <span className="text-sm text-gray-700 dark:text-gray-300">Personne physique</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="radio"
                name="personType"
                value="morale"
                checked={form.personType === 'morale'}
                onChange={() => setForm(f => ({ ...f, personType: 'morale' }))}
                className="text-teal-600 focus:ring-teal-500 dark:bg-gray-700 dark:border-gray-600"
              />
              <span className="text-sm text-gray-700 dark:text-gray-300">Personne morale</span>
            </label>
          </div>
        </div>

        {isMorale ? (
          <Input
            label="Denomination sociale"
            value={form.denomination}
            onChange={e => setForm(f => ({ ...f, denomination: e.target.value, lastName: e.target.value }))}
            required
          />
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Input
              label="Prenom"
              value={form.firstName}
              onChange={e => setForm(f => ({ ...f, firstName: e.target.value }))}
              required
            />
            <Input
              label="Nom"
              value={form.lastName}
              onChange={e => setForm(f => ({ ...f, lastName: e.target.value }))}
              required
            />
          </div>
        )}

        <Select
          label="Role"
          value={form.role}
          onChange={e => setForm(f => ({ ...f, role: e.target.value }))}
          options={ROLE_OPTIONS.map(r => ({ value: r, label: r }))}
        />

        <div className="grid grid-cols-2 gap-3">
          <Input
            label="Date de debut"
            type="date"
            value={form.startDate}
            onChange={e => setForm(f => ({ ...f, startDate: e.target.value }))}
            required
          />
          <Input
            label="Date de fin"
            type="date"
            value={form.endDate}
            onChange={e => setForm(f => ({ ...f, endDate: e.target.value }))}
          />
        </div>

        {!isMorale && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Input
              label="Date de naissance"
              type="date"
              value={form.birthDate}
              onChange={e => setForm(f => ({ ...f, birthDate: e.target.value }))}
            />
            <Input
              label="Nationalite"
              value={form.nationality}
              onChange={e => setForm(f => ({ ...f, nationality: e.target.value }))}
            />
          </div>
        )}

        <div className="flex items-center gap-2">
          <input
            type="checkbox"
            id="isActive"
            checked={form.isActive}
            onChange={e => setForm(f => ({ ...f, isActive: e.target.checked }))}
            className="rounded border-gray-300 dark:border-gray-600 text-teal-600 focus:ring-teal-500 dark:bg-gray-700"
          />
          <label htmlFor="isActive" className="text-sm text-gray-700 dark:text-gray-300">Mandat actif</label>
        </div>

        <Input
          label="Notes"
          value={form.notes}
          onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
        />

        <div className="flex justify-end gap-3 pt-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            Annuler
          </Button>
          <Button type="submit" disabled={saving}>
            {saving ? 'Enregistrement...' : isEdit ? 'Modifier' : 'Ajouter'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
