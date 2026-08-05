import { useState, useEffect } from 'react';
import { Modal } from '../ui/Modal';
import { Input } from '../ui/Input';
import { Textarea } from '../ui/Textarea';
import { Button } from '../ui/Button';
import { ICON_OPTIONS, COLOR_OPTIONS, getColorClasses } from './iconMap';

interface CategoryFormData {
  name: string;
  description: string | null;
  icon: string | null;
  color: string | null;
}

interface CategoryFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (data: { name: string; description: string; icon: string; color: string }) => Promise<void>;
  category?: CategoryFormData | null;
}

export function CategoryFormModal({ isOpen, onClose, onSubmit, category }: CategoryFormModalProps) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [icon, setIcon] = useState('Globe');
  const [color, setColor] = useState('blue');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setName(category?.name || '');
      setDescription(category?.description || '');
      setIcon(category?.icon || 'Globe');
      setColor(category?.color || 'blue');
    }
  }, [isOpen, category]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setSaving(true);
    try {
      await onSubmit({ name: name.trim(), description: description.trim(), icon, color });
      onClose();
    } finally {
      setSaving(false);
    }
  }

  const selectedColor = getColorClasses(color);

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={category ? 'Modifier la catégorie' : 'Nouvelle catégorie'}
    >
      <form onSubmit={handleSubmit} className="space-y-5">
        <Input
          label="Nom de la catégorie"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Ex: Fiscalité et Impôts"
          required
        />

        <Textarea
          label="Description (optionnelle)"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Brève description de la catégorie..."
          rows={2}
        />

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">Icône</label>
          <div className="grid grid-cols-5 gap-2">
            {ICON_OPTIONS.map((opt) => {
              const IconComp = opt.icon;
              const isSelected = icon === opt.name;
              return (
                <button
                  key={opt.name}
                  type="button"
                  onClick={() => setIcon(opt.name)}
                  className={`flex flex-col items-center gap-1 p-2.5 rounded-lg border-2 transition-all ${
                    isSelected
                      ? `${selectedColor.border} ${selectedColor.bg}`
                      : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                  }`}
                  title={opt.label}
                >
                  <IconComp className={`w-5 h-5 ${isSelected ? selectedColor.text : 'text-gray-500'}`} />
                  <span className={`text-[10px] leading-tight ${isSelected ? selectedColor.text : 'text-gray-400'}`}>
                    {opt.label}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">Couleur</label>
          <div className="flex gap-2 flex-wrap">
            {COLOR_OPTIONS.map((opt) => (
              <button
                key={opt.name}
                type="button"
                onClick={() => setColor(opt.name)}
                className={`w-9 h-9 rounded-full transition-all flex items-center justify-center ${opt.dot} ${
                  color === opt.name ? 'ring-2 ring-offset-2 ring-gray-400 scale-110' : 'hover:scale-105'
                }`}
                title={opt.label}
              >
                {color === opt.name && (
                  <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                )}
              </button>
            ))}
          </div>
        </div>

        <div className="flex justify-end gap-3 pt-2">
          <Button type="button" variant="secondary" onClick={onClose} disabled={saving}>
            Annuler
          </Button>
          <Button type="submit" disabled={saving || !name.trim()}>
            {saving ? 'Enregistrement...' : category ? 'Modifier' : 'Créer'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
