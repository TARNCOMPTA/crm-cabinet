import { useState, useEffect } from 'react';
import { Plus, Trash2, ChevronUp, ChevronDown } from 'lucide-react';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { ConfirmDialog } from '../ui/ConfirmDialog';
import { COLUMN_COLORS, saveColumns } from '../../lib/opportunityService';
import type { OpportunityColumn } from '../../types/database';

interface EditableColumn {
  id?: string;
  name: string;
  color: string;
  position: number;
}

interface Props {
  isOpen: boolean;
  onClose: () => void;
  columns: OpportunityColumn[];
  onSaved: () => void;
}

export function OpportunityConfigModal({
  isOpen,
  onClose,
  columns: initialColumns,
  onSaved,
}: Props) {
  const [cols, setCols] = useState<EditableColumn[]>([]);
  const [saving, setSaving] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<number | null>(null);

  useEffect(() => {
    if (isOpen) {
      setCols(initialColumns.map((c) => ({ id: c.id, name: c.name, color: c.color, position: c.position })));
    }
  }, [isOpen, initialColumns]);

  function moveItem(arr: EditableColumn[], from: number, to: number): EditableColumn[] {
    const copy = [...arr];
    const [item] = copy.splice(from, 1);
    copy.splice(to, 0, item);
    return copy.map((it, i) => ({ ...it, position: i }));
  }

  function addColumn() {
    setCols((prev) => [...prev, { name: '', color: 'gray', position: prev.length }]);
  }

  function removeColumn(index: number) {
    if (cols.length <= 1) return;
    setCols((prev) => prev.filter((_, i) => i !== index).map((c, i) => ({ ...c, position: i })));
    setDeleteConfirm(null);
  }

  async function handleSave() {
    if (cols.some((c) => !c.name.trim())) return;

    setSaving(true);
    try {
      await saveColumns(cols);
      onSaved();
      onClose();
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <Modal isOpen={isOpen} onClose={onClose} title="Configuration du pipeline" size="xl">
        <div className="space-y-2 mb-4">
          {cols.map((col, index) => (
            <div key={index} className="flex items-center gap-2 bg-gray-50 dark:bg-gray-800 rounded-lg p-3">
              <div className="flex flex-col gap-0.5">
                <button
                  type="button"
                  disabled={index === 0}
                  onClick={() => setCols(moveItem(cols, index, index - 1))}
                  className="p-0.5 text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 disabled:opacity-30"
                >
                  <ChevronUp className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  disabled={index === cols.length - 1}
                  onClick={() => setCols(moveItem(cols, index, index + 1))}
                  className="p-0.5 text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 disabled:opacity-30"
                >
                  <ChevronDown className="w-4 h-4" />
                </button>
              </div>

              <Input
                value={col.name}
                onChange={(e) => {
                  const updated = [...cols];
                  updated[index] = { ...updated[index], name: e.target.value };
                  setCols(updated);
                }}
                placeholder="Nom de la colonne"
                className="flex-1"
              />

              <div className="flex items-center gap-1.5">
                {COLUMN_COLORS.map((c) => (
                  <button
                    key={c.value}
                    type="button"
                    onClick={() => {
                      const updated = [...cols];
                      updated[index] = { ...updated[index], color: c.value };
                      setCols(updated);
                    }}
                    className={`w-6 h-6 rounded-full border-2 transition-transform ${
                      col.color === c.value ? 'border-gray-800 dark:border-gray-200 scale-110' : 'border-transparent hover:scale-105'
                    }`}
                    style={{ backgroundColor: getSwatchColor(c.value) }}
                    title={c.label}
                  />
                ))}
              </div>

              <button
                type="button"
                onClick={() => {
                  if (col.id) {
                    setDeleteConfirm(index);
                  } else {
                    removeColumn(index);
                  }
                }}
                disabled={cols.length <= 1}
                className="p-1.5 text-gray-400 hover:text-red-600 disabled:opacity-30"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          ))}
        </div>

        <Button variant="outline" size="sm" onClick={addColumn}>
          <Plus className="w-4 h-4 mr-1.5" />
          Ajouter une colonne
        </Button>

        <div className="flex justify-end gap-2 mt-6 pt-4 border-t dark:border-gray-700">
          <Button variant="secondary" onClick={onClose}>Annuler</Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? 'Enregistrement...' : 'Enregistrer'}
          </Button>
        </div>
      </Modal>

      <ConfirmDialog
        isOpen={deleteConfirm !== null}
        onClose={() => setDeleteConfirm(null)}
        onConfirm={() => {
          if (deleteConfirm !== null) removeColumn(deleteConfirm);
        }}
        title="Confirmer la suppression"
        message="Les cartes dans cette colonne seront deplacees vers la premiere colonne restante."
        confirmText="Supprimer"
        variant="danger"
      />
    </>
  );
}

/** Pastilles de la charte — meme principe que BilanConfigModal. */
function getSwatchColor(color: string): string {
  const map: Record<string, string> = {
    gray: '#7a6f74', // --neutral
    blue: '#3f7293', // --navy
    amber: '#b5781f', // --gold
    green: '#3f7d54', // --ok
    red: '#b3402f', // --red
    teal: '#7c2d5e', // --teal, l'accent bordeaux
  };
  return map[color] || map.gray;
}
