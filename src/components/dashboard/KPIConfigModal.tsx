import { useState } from 'react';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { Eye, EyeOff } from 'lucide-react';
import { arrayMove } from '@dnd-kit/sortable';
import { DragEndEvent } from '@dnd-kit/core';
import { SortableTableWrapper } from '../ui/SortableTableWrapper';
import { SortableListItem } from '../ui/SortableRow';

export interface KPIConfig {
  id: string;
  label: string;
  visible: boolean;
}

interface KPIConfigModalProps {
  isOpen: boolean;
  onClose: () => void;
  config: KPIConfig[];
  onSave: (config: KPIConfig[]) => void;
}

export function KPIConfigModal({ isOpen, onClose, config, onSave }: KPIConfigModalProps) {
  const [items, setItems] = useState<KPIConfig[]>(config);

  function toggleVisibility(id: string) {
    setItems(prev => prev.map(item =>
      item.id === id ? { ...item, visible: !item.visible } : item
    ));
  }

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = items.findIndex(i => i.id === active.id);
    const newIndex = items.findIndex(i => i.id === over.id);
    if (oldIndex === -1 || newIndex === -1) return;
    setItems(arrayMove(items, oldIndex, newIndex));
  }

  function handleSave() {
    onSave(items);
    onClose();
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Configurer les indicateurs" size="sm">
      <SortableTableWrapper ids={items.map(i => i.id)} onDragEnd={handleDragEnd}>
        <div className="space-y-1 mb-6">
          {items.map((item) => (
            <SortableListItem key={item.id} id={item.id} className={`px-2 py-2 rounded-lg border transition-colors ${
              'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800'
            }`}>
              <div className="flex items-center justify-between">
                <span className={`text-sm font-medium ${
                  item.visible
                    ? 'text-gray-900 dark:text-gray-100'
                    : 'text-gray-400 dark:text-gray-500'
                }`}>
                  {item.label}
                </span>
                <button
                  onClick={() => toggleVisibility(item.id)}
                  className="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                >
                  {item.visible ? (
                    <Eye className="w-4 h-4 text-teal-600 dark:text-teal-400" />
                  ) : (
                    <EyeOff className="w-4 h-4 text-gray-400" />
                  )}
                </button>
              </div>
            </SortableListItem>
          ))}
        </div>
      </SortableTableWrapper>
      <div className="flex justify-end gap-2">
        <Button variant="ghost" size="sm" onClick={onClose}>Annuler</Button>
        <Button size="sm" onClick={handleSave}>Enregistrer</Button>
      </div>
    </Modal>
  );
}
