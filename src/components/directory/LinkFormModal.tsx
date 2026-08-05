import { useState, useEffect } from 'react';
import { Modal } from '../ui/Modal';
import { Input } from '../ui/Input';
import { Textarea } from '../ui/Textarea';
import { Select } from '../ui/Select';
import { Button } from '../ui/Button';

interface LinkFormData {
  title: string;
  url: string;
  description: string | null;
  category_id: string;
}

interface CategoryOption {
  id: string;
  name: string;
}

interface LinkFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (data: { title: string; url: string; description: string; category_id: string }) => Promise<void>;
  link?: LinkFormData | null;
  categories: CategoryOption[];
  defaultCategoryId?: string;
}

export function LinkFormModal({ isOpen, onClose, onSubmit, link, categories, defaultCategoryId }: LinkFormModalProps) {
  const [title, setTitle] = useState('');
  const [url, setUrl] = useState('');
  const [description, setDescription] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [saving, setSaving] = useState(false);
  const [urlError, setUrlError] = useState('');

  useEffect(() => {
    if (isOpen) {
      setTitle(link?.title || '');
      setUrl(link?.url || '');
      setDescription(link?.description || '');
      setCategoryId(link?.category_id || defaultCategoryId || categories[0]?.id || '');
      setUrlError('');
    }
  }, [isOpen, link, defaultCategoryId, categories]);

  function validateUrl(value: string) {
    if (!value.trim()) {
      setUrlError('');
      return;
    }
    try {
      const u = value.startsWith('http') ? value : `https://${value}`;
      new URL(u);
      setUrlError('');
    } catch {
      setUrlError('URL invalide');
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim() || !url.trim() || !categoryId) return;

    const finalUrl = url.startsWith('http') ? url.trim() : `https://${url.trim()}`;
    try {
      new URL(finalUrl);
    } catch {
      setUrlError('URL invalide');
      return;
    }

    setSaving(true);
    try {
      await onSubmit({
        title: title.trim(),
        url: finalUrl,
        description: description.trim(),
        category_id: categoryId,
      });
      onClose();
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={link ? 'Modifier le lien' : 'Nouveau lien'}
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <Input
          label="Titre"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Ex: impots.gouv.fr"
          required
        />

        <Input
          label="URL"
          value={url}
          onChange={(e) => {
            setUrl(e.target.value);
            validateUrl(e.target.value);
          }}
          placeholder="https://www.exemple.fr"
          error={urlError}
          required
        />

        <Textarea
          label="Description (optionnelle)"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Brève description du site..."
          rows={2}
        />

        <Select
          label="Catégorie"
          value={categoryId}
          onChange={(e) => setCategoryId(e.target.value)}
          required
        >
          {categories.map((cat) => (
            <option key={cat.id} value={cat.id}>
              {cat.name}
            </option>
          ))}
        </Select>

        <div className="flex justify-end gap-3 pt-2">
          <Button type="button" variant="secondary" onClick={onClose} disabled={saving}>
            Annuler
          </Button>
          <Button type="submit" disabled={saving || !title.trim() || !url.trim()}>
            {saving ? 'Enregistrement...' : link ? 'Modifier' : 'Créer'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
