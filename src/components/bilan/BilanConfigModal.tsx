import { useState, useEffect } from 'react';
import { Plus, Trash2, ChevronUp, ChevronDown, FileSearch } from 'lucide-react';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '../ui/Tabs';
import { ConfirmDialog } from '../ui/ConfirmDialog';
import { COLUMN_COLORS, saveColumns, saveChecklistTemplates, getBilanCabinetOptions, setBilanDas2Enabled } from '../../lib/bilanService';
import type { BilanColumn, BilanChecklistTemplate } from '../../types/database';

interface EditableColumn {
  id?: string;
  name: string;
  color: string;
  position: number;
}

interface EditableTemplate {
  id?: string;
  name: string;
  position: number;
}

interface Props {
  isOpen: boolean;
  onClose: () => void;
  regime: string;
  year: number;
  columns: BilanColumn[];
  templates: BilanChecklistTemplate[];
  onSaved: () => void;
  onDas2Changed?: (enabled: boolean) => void;
}

export function BilanConfigModal({
  isOpen,
  onClose,
  regime,
  year,
  columns: initialColumns,
  templates: initialTemplates,
  onSaved,
  onDas2Changed,
}: Props) {
  const [cols, setCols] = useState<EditableColumn[]>([]);
  const [tpls, setTpls] = useState<EditableTemplate[]>([]);
  const [saving, setSaving] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<{ type: 'col' | 'tpl'; index: number } | null>(null);
  const [das2Enabled, setDas2Enabled] = useState(false);
  const [das2Loading, setDas2Loading] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setCols(initialColumns.map((c) => ({ id: c.id, name: c.name, color: c.color, position: c.position })));
      setTpls(initialTemplates.map((t) => ({ id: t.id, name: t.name, position: t.position })));
      loadOptions();
    }
  }, [isOpen, initialColumns, initialTemplates]);

  async function loadOptions() {
    const opts = await getBilanCabinetOptions();
    setDas2Enabled(opts?.das2_inpi_enabled ?? false);
  }

  async function handleToggleDas2() {
    setDas2Loading(true);
    try {
      const newVal = !das2Enabled;
      await setBilanDas2Enabled(newVal);
      setDas2Enabled(newVal);
      onDas2Changed?.(newVal);
    } finally {
      setDas2Loading(false);
    }
  }

  function moveItem<T>(arr: T[], from: number, to: number): T[] {
    const copy = [...arr];
    const [item] = copy.splice(from, 1);
    copy.splice(to, 0, item);
    return copy.map((it, i) => ({ ...it, position: i }));
  }

  function addColumn() {
    setCols((prev) => [...prev, { name: '', color: 'gray', position: prev.length }]);
  }

  function addTemplate() {
    setTpls((prev) => [...prev, { name: '', position: prev.length }]);
  }

  function removeColumn(index: number) {
    if (cols.length <= 1) return;
    setCols((prev) => prev.filter((_, i) => i !== index).map((c, i) => ({ ...c, position: i })));
    setDeleteConfirm(null);
  }

  function removeTemplate(index: number) {
    setTpls((prev) => prev.filter((_, i) => i !== index).map((t, i) => ({ ...t, position: i })));
    setDeleteConfirm(null);
  }

  async function handleSave() {
    const hasEmptyCol = cols.some((c) => !c.name.trim());
    const hasEmptyTpl = tpls.some((t) => !t.name.trim());
    if (hasEmptyCol || hasEmptyTpl) return;

    setSaving(true);
    try {
      await saveColumns(regime, cols);
      await saveChecklistTemplates(regime, year, tpls);
      onSaved();
      onClose();
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <Modal isOpen={isOpen} onClose={onClose} title={`Configuration ${regime}`} size="xl">
        <Tabs defaultValue="columns" className="space-y-4">
          <TabsList aria-label="Reglages du bilan">
            <TabsTrigger value="columns">Colonnes ({cols.length})</TabsTrigger>
            <TabsTrigger value="checklist">Checklist ({tpls.length})</TabsTrigger>
            <TabsTrigger value="options">Options</TabsTrigger>
          </TabsList>

          <TabsContent value="columns">
            <div className="space-y-2 mb-4">
              {cols.map((col, index) => (
                <div key={index} className="flex items-center gap-2 bg-gray-50 dark:bg-gray-800 rounded-lg p-3">
                  <div className="flex flex-col gap-0.5">
                    <button
                      type="button"
                      disabled={index === 0}
                      onClick={() => setCols(moveItem(cols, index, index - 1))}
                      className="p-0.5 text-gray-400 hover:text-gray-200 disabled:opacity-30"
                    >
                      <ChevronUp className="w-4 h-4" />
                    </button>
                    <button
                      type="button"
                      disabled={index === cols.length - 1}
                      onClick={() => setCols(moveItem(cols, index, index + 1))}
                      className="p-0.5 text-gray-400 hover:text-gray-200 disabled:opacity-30"
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
                          col.color === c.value ? 'border-gray-800 scale-110' : 'border-transparent hover:scale-105'
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
                        setDeleteConfirm({ type: 'col', index });
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
          </TabsContent>

          <TabsContent value="checklist">
            <div className="space-y-2 mb-4">
              {tpls.map((tpl, index) => (
                <div key={index} className="flex items-center gap-2 bg-gray-50 dark:bg-gray-800 rounded-lg p-3">
                  <div className="flex flex-col gap-0.5">
                    <button
                      type="button"
                      disabled={index === 0}
                      onClick={() => setTpls(moveItem(tpls, index, index - 1))}
                      className="p-0.5 text-gray-400 hover:text-gray-200 disabled:opacity-30"
                    >
                      <ChevronUp className="w-4 h-4" />
                    </button>
                    <button
                      type="button"
                      disabled={index === tpls.length - 1}
                      onClick={() => setTpls(moveItem(tpls, index, index + 1))}
                      className="p-0.5 text-gray-400 hover:text-gray-200 disabled:opacity-30"
                    >
                      <ChevronDown className="w-4 h-4" />
                    </button>
                  </div>

                  <Input
                    value={tpl.name}
                    onChange={(e) => {
                      const updated = [...tpls];
                      updated[index] = { ...updated[index], name: e.target.value };
                      setTpls(updated);
                    }}
                    placeholder="Nom de l'element"
                    className="flex-1"
                  />

                  <button
                    type="button"
                    onClick={() => {
                      if (tpl.id) {
                        setDeleteConfirm({ type: 'tpl', index });
                      } else {
                        removeTemplate(index);
                      }
                    }}
                    className="p-1.5 text-gray-400 hover:text-red-600"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
            <Button variant="outline" size="sm" onClick={addTemplate}>
              <Plus className="w-4 h-4 mr-1.5" />
              Ajouter un element
            </Button>
          </TabsContent>
          <TabsContent value="options">
            <div className="space-y-6">
              <div className="flex items-start gap-4 p-4 bg-gray-50 dark:bg-gray-800 rounded-xl">
                <div className="p-2.5 bg-teal-100 dark:bg-teal-900/40 rounded-lg">
                  <FileSearch className="w-5 h-5 text-teal-600 dark:text-teal-400" />
                </div>
                <div className="flex-1">
                  <div className="flex items-center justify-between">
                    <h4 className="font-semibold text-gray-900 dark:text-white text-sm">Fiche INPI (DAS2)</h4>
                    <button
                      type="button"
                      onClick={handleToggleDas2}
                      disabled={das2Loading}
                      className={`relative w-11 h-6 rounded-full transition-colors duration-200 ${
                        das2Enabled ? 'bg-teal-600' : 'bg-gray-300 dark:bg-gray-600'
                      }`}
                    >
                      <span
                        className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform duration-200 ${
                          das2Enabled ? 'translate-x-5' : 'translate-x-0'
                        }`}
                      />
                    </button>
                  </div>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-1.5 leading-relaxed">
                    Permet de rechercher une entreprise tierce par SIRET et de telecharger sa fiche INPI en PDF directement depuis chaque fiche bilan. Utile pour la preparation de la DAS2.
                  </p>
                </div>
              </div>
            </div>
          </TabsContent>
        </Tabs>

        <div className="flex justify-end gap-2 mt-6 pt-4 border-t">
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
          if (!deleteConfirm) return;
          if (deleteConfirm.type === 'col') removeColumn(deleteConfirm.index);
          else removeTemplate(deleteConfirm.index);
        }}
        title="Confirmer la suppression"
        message={
          deleteConfirm?.type === 'col'
            ? 'Les cartes dans cette colonne seront déplacées vers la première colonne restante.'
            : 'Cet élément sera supprimé de toutes les fiches existantes.'
        }
        confirmText="Supprimer"
        variant="danger"
      />
    </>
  );
}

/**
 * Pastilles de la charte du cabinet, et non les couleurs brutes de Tailwind.
 * Les clés restent inchangées : ce sont elles qui sont stockées en base, les
 * colonnes déjà configurées continuent donc de fonctionner — elles rendent
 * simplement la bonne teinte.
 */
function getSwatchColor(color: string): string {
  const map: Record<string, string> = {
    gray: '#7a6f74', // --neutral
    blue: '#3f7293', // --navy
    amber: '#b5781f', // --gold
    green: '#3f7d54', // --ok
    red: '#b3402f', // --red
    teal: '#7c2d5e', // --teal, l'accent bordeaux
    purple: '#6b4a7e',
  };
  return map[color] || map.gray;
}
