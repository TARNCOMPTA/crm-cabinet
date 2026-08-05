import { useState, useEffect } from 'react';
import { AlertTriangle, Trash2 } from 'lucide-react';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { DeletionStats } from '../../lib/clientDeletionService';

interface DeleteClientModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => Promise<void>;
  clientName: string;
  stats: DeletionStats | null;
  isLoadingStats: boolean;
}

export default function DeleteClientModal({
  isOpen,
  onClose,
  onConfirm,
  clientName,
  stats,
  isLoadingStats,
}: DeleteClientModalProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [confirmationText, setConfirmationText] = useState('');

  useEffect(() => {
    if (!isOpen) {
      setConfirmationText('');
    }
  }, [isOpen]);

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

  const isConfirmationValid = confirmationText === clientName;
  const totalItems = stats ? Object.values(stats).reduce((sum, count) => sum + count, 0) : 0;

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Supprimer définitivement le client">
      <div className="space-y-4">
        <div className="flex items-start gap-3 p-4 bg-red-50 border border-red-200 rounded-lg">
          <AlertTriangle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
          <div className="flex-1 text-sm text-red-800">
            <p className="font-bold mb-2">Action irréversible !</p>
            <p>
              Cette action supprimera définitivement le client <span className="font-semibold">{clientName}</span> et
              toutes ses données associées. Cette opération ne peut pas être annulée.
            </p>
          </div>
        </div>

        {isLoadingStats ? (
          <div className="p-4 bg-gray-50 rounded-lg">
            <p className="text-sm text-gray-600">Calcul des éléments à supprimer...</p>
          </div>
        ) : stats && totalItems > 0 ? (
          <div className="p-4 bg-gray-50 rounded-lg space-y-2">
            <p className="text-sm font-medium text-gray-900 mb-3">
              Les éléments suivants seront supprimés :
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm">
              {stats.habilitations > 0 && (
                <div className="text-gray-700">
                  <span className="font-medium">{stats.habilitations}</span> habilitation(s)
                </div>
              )}
              {stats.legal_acts > 0 && (
                <div className="text-gray-700">
                  <span className="font-medium">{stats.legal_acts}</span> acte(s) juridique(s)
                </div>
              )}
              {stats.client_collaborators > 0 && (
                <div className="text-gray-700">
                  <span className="font-medium">{stats.client_collaborators}</span> collaborateur(s)
                </div>
              )}
              {stats.tasks > 0 && (
                <div className="text-gray-700">
                  <span className="font-medium">{stats.tasks}</span> tâche(s)
                </div>
              )}
              {stats.tax_authorizations > 0 && (
                <div className="text-gray-700">
                  <span className="font-medium">{stats.tax_authorizations}</span> habilitation(s) fiscale(s)
                </div>
              )}
              {stats.tax_exemptions > 0 && (
                <div className="text-gray-700">
                  <span className="font-medium">{stats.tax_exemptions}</span> exonération(s)
                </div>
              )}
              {stats.balance_sheets > 0 && (
                <div className="text-gray-700">
                  <span className="font-medium">{stats.balance_sheets}</span> bilan(s)
                </div>
              )}
              {stats.general_assemblies > 0 && (
                <div className="text-gray-700">
                  <span className="font-medium">{stats.general_assemblies}</span> assemblée(s)
                </div>
              )}
              {stats.inpi_sync_history > 0 && (
                <div className="text-gray-700">
                  <span className="font-medium">{stats.inpi_sync_history}</span> sync(s) INPI
                </div>
              )}
              {stats.officer_companies > 0 && (
                <div className="text-gray-700">
                  <span className="font-medium">{stats.officer_companies}</span> dirigeant(s)
                </div>
              )}
              {stats.legal_documents > 0 && (
                <div className="text-gray-700">
                  <span className="font-medium">{stats.legal_documents}</span> document(s) juridique(s)
                </div>
              )}
              {stats.client_software > 0 && (
                <div className="text-gray-700">
                  <span className="font-medium">{stats.client_software}</span> logiciel(s)
                </div>
              )}
            </div>
            <div className="pt-2 mt-2 border-t border-gray-300">
              <p className="text-sm font-bold text-gray-900">
                Total : {totalItems} élément(s)
              </p>
            </div>
          </div>
        ) : (
          <div className="p-4 bg-gray-50 rounded-lg">
            <p className="text-sm text-gray-600">Aucune donnée associée à supprimer.</p>
          </div>
        )}

        <div className="space-y-2">
          <label className="block text-sm font-medium text-gray-700">
            Pour confirmer, tapez le nom du client :
          </label>
          <Input
            type="text"
            value={confirmationText}
            onChange={(e) => setConfirmationText(e.target.value)}
            placeholder={clientName}
            disabled={isLoading}
          />
          <p className="text-xs text-gray-500">
            Tapez exactement : <span className="font-mono font-semibold">{clientName}</span>
          </p>
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
            variant="danger"
            onClick={handleConfirm}
            disabled={isLoading || !isConfirmationValid}
            className="bg-red-600 hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Trash2 className="w-4 h-4 mr-2" />
            {isLoading ? 'Suppression...' : 'Supprimer définitivement'}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
