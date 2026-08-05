import { useState } from 'react';
import { Archive } from 'lucide-react';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';

interface ArchiveClientModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => Promise<void>;
  clientName: string;
}

export default function ArchiveClientModal({
  isOpen,
  onClose,
  onConfirm,
  clientName,
}: ArchiveClientModalProps) {
  const [isLoading, setIsLoading] = useState(false);

  const handleConfirm = async () => {
    setIsLoading(true);
    try {
      await onConfirm();
      onClose();
    } catch (error) {
      // error handled by parent
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Archiver le client">
      <div className="space-y-4">
        <div className="flex items-start gap-3 p-4 bg-orange-50 border border-orange-200 rounded-lg">
          <Archive className="w-5 h-5 text-orange-600 flex-shrink-0 mt-0.5" />
          <div className="flex-1 text-sm text-orange-800">
            <p className="font-medium mb-1">Le client sera archivé</p>
            <p>
              Le client <span className="font-semibold">{clientName}</span> sera masqué de votre liste
              principale mais toutes ses données seront conservées. Vous pourrez le restaurer à tout moment.
            </p>
          </div>
        </div>

        <div className="flex justify-end gap-3 pt-4">
          <Button
            variant="secondary"
            onClick={onClose}
            disabled={isLoading}
          >
            Annuler
          </Button>
          <Button
            variant="primary"
            onClick={handleConfirm}
            disabled={isLoading}
            className="bg-orange-600 hover:bg-orange-700"
          >
            {isLoading ? 'Archivage...' : 'Archiver le client'}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
