import React from 'react';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { Select } from '../ui/Select';
import { SearchableSelect } from '../ui/SearchableSelect';
import { Textarea } from '../ui/Textarea';
import { UserCheck } from 'lucide-react';
import { TaskTemplateWithCategory } from '../../lib/taskService';
import { Database } from '../../types/database';

type TaskCategory = Database['public']['Tables']['task_categories']['Row'];

export interface TaskCreateFormData {
  titre: string;
  description: string;
  client_id: string;
  assignee_id: string;
  priorite: string;
  category_id: string;
  date_echeance: string;
  estimated_hours: string;
}

export interface TaskCreateModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (e: React.FormEvent) => void;
  formData: TaskCreateFormData;
  onFormDataChange: (data: TaskCreateFormData) => void;
  createMode: 'free' | 'template';
  onCreateModeChange: (mode: 'free' | 'template') => void;
  selectedTemplateId: string;
  onTemplateSelect: (templateId: string) => void;
  onAssignToMe: () => void;
  clients: Array<{ id: string; nom_entreprise: string }>;
  users: Array<{ id: string; prenom: string | null; nom: string | null; avatar_url: string | null; avatar_color: string | null }>;
  categories: TaskCategory[];
  templates: TaskTemplateWithCategory[];
}

export function TaskCreateModal({
  isOpen,
  onClose,
  onSubmit,
  formData,
  onFormDataChange,
  createMode,
  onCreateModeChange,
  selectedTemplateId,
  onTemplateSelect,
  onAssignToMe,
  clients,
  users,
  categories,
  templates,
}: TaskCreateModalProps) {
  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Nouvelle tache" size="lg">
      <form onSubmit={onSubmit} className="space-y-4">
        <div className="flex gap-2 mb-4">
          <Button
            type="button"
            variant={createMode === 'free' ? 'primary' : 'outline'}
            onClick={() => onCreateModeChange('free')}
            className="flex-1"
          >
            Tache libre
          </Button>
          <Button
            type="button"
            variant={createMode === 'template' ? 'primary' : 'outline'}
            onClick={() => onCreateModeChange('template')}
            className="flex-1"
          >
            Depuis un modele
          </Button>
        </div>

        {createMode === 'template' && (
          <Select
            label="Modèle de tâche"
            value={selectedTemplateId}
            onChange={(e) => {
              onTemplateSelect(e.target.value);
            }}
            options={[
              { value: '', label: 'Sélectionner un modèle' },
              ...templates.map((t) => ({
                value: t.id,
                label: `${t.titre}${t.task_categories ? ` (${t.task_categories.nom})` : ''}`,
              })),
            ]}
          />
        )}

        <Input
          label="Titre"
          value={formData.titre}
          onChange={(e) => onFormDataChange({ ...formData, titre: e.target.value })}
          required
        />

        <Textarea
          label="Description"
          value={formData.description}
          onChange={(e) => onFormDataChange({ ...formData, description: e.target.value })}
          rows={3}
        />

        <SearchableSelect
          label="Client (optionnel)"
          value={formData.client_id}
          onChange={(val) => onFormDataChange({ ...formData, client_id: val })}
          placeholder="Rechercher un client..."
          options={clients.map((c) => ({ value: c.id, label: c.nom_entreprise }))}
        />

        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-2">
            Assigne a
          </label>
          <div className="flex gap-2">
            <Select
              value={formData.assignee_id}
              onChange={(e) => onFormDataChange({ ...formData, assignee_id: e.target.value })}
              options={[
                { value: '', label: 'Non assigne' },
                ...users.map((u) => ({
                  value: u.id,
                  label: `${u.prenom || ''} ${u.nom || ''}`.trim() || 'Sans nom',
                })),
              ]}
            />
            <Button type="button" variant="outline" onClick={onAssignToMe}>
              <UserCheck className="w-4 h-4 mr-2" />
              Me l'assigner
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Select
            label="Priorité"
            value={formData.priorite}
            onChange={(e) => onFormDataChange({ ...formData, priorite: e.target.value })}
            options={[
              { value: 'basse', label: 'Basse' },
              { value: 'moyenne', label: 'Moyenne' },
              { value: 'haute', label: 'Haute' },
              { value: 'urgente', label: 'Urgente' },
            ]}
          />

          <Select
            label="Catégorie"
            value={formData.category_id}
            onChange={(e) => onFormDataChange({ ...formData, category_id: e.target.value })}
            options={[
              { value: '', label: 'Aucune catégorie' },
              ...categories.map((c) => ({ value: c.id, label: c.nom })),
            ]}
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Input
            label="Date d'échéance"
            type="date"
            value={formData.date_echeance}
            onChange={(e) => onFormDataChange({ ...formData, date_echeance: e.target.value })}
          />

          <Input
            label="Heures estimées"
            type="number"
            step="0.5"
            min="0"
            value={formData.estimated_hours}
            onChange={(e) => onFormDataChange({ ...formData, estimated_hours: e.target.value })}
          />
        </div>

        <div className="flex justify-end gap-2 mt-6">
          <Button type="button" variant="secondary" onClick={onClose}>
            Annuler
          </Button>
          <Button type="submit">Creer la tache</Button>
        </div>
      </form>
    </Modal>
  );
}
