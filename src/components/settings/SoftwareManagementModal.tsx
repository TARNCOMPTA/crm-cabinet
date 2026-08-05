import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { Package } from 'lucide-react';
import { Database } from '../../types/database';

type Software = Database['public']['Tables']['software']['Row'];
type Client = Database['public']['Tables']['clients']['Row'];

interface SoftwareManagementModalProps {
  isOpen: boolean;
  onClose: () => void;
  client: Client | null;
  availableSoftware: Software[];
  currentSoftwareIds: string[];
  onToggleSoftware: (softwareId: string) => void;
}

export function SoftwareManagementModal({
  isOpen,
  onClose,
  client,
  availableSoftware,
  currentSoftwareIds,
  onToggleSoftware,
}: SoftwareManagementModalProps) {
  if (!client) return null;

  const categorizedSoftware = availableSoftware.reduce((acc, software) => {
    if (!acc[software.category]) {
      acc[software.category] = [];
    }
    acc[software.category].push(software);
    return acc;
  }, {} as Record<string, Software[]>);

  const categoryLabels: Record<string, string> = {
    comptabilite: 'Comptabilité',
    paie: 'Paie',
    facturation: 'Facturation',
    gestion: 'Gestion',
    crm: 'CRM',
    autre: 'Autre',
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Gestion des logiciels">
      <div className="space-y-6">
        <div className="flex items-center gap-3 p-4 bg-gray-50 rounded-lg border border-gray-100">
          <div className="w-10 h-10 bg-teal-100 rounded-lg flex items-center justify-center">
            <Package className="w-5 h-5 text-teal-600" />
          </div>
          <div>
            <h3 className="font-semibold text-gray-900">{client.nom_entreprise}</h3>
            <p className="text-sm text-gray-600">
              {currentSoftwareIds.length} logiciel{currentSoftwareIds.length !== 1 ? 's' : ''} assigné
              {currentSoftwareIds.length !== 1 ? 's' : ''}
            </p>
          </div>
        </div>

        <div className="space-y-5 max-h-96 overflow-y-auto pr-2">
          {Object.entries(categorizedSoftware).map(([category, software]) => (
            <div key={category} className="space-y-2.5">
              <h4 className="text-xs font-medium text-gray-500 uppercase tracking-wider px-1">
                {categoryLabels[category] || category}
              </h4>
              <div className="space-y-2">
                {software.map(s => {
                  const isAssigned = currentSoftwareIds.includes(s.id);
                  return (
                    <button
                      key={s.id}
                      onClick={() => onToggleSoftware(s.id)}
                      className={`w-full flex items-center justify-between p-3 rounded-lg border transition-all ${
                        isAssigned
                          ? 'border-teal-500 bg-teal-50/50'
                          : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <input
                          type="checkbox"
                          checked={isAssigned}
                          onChange={() => {}}
                          className="w-5 h-5 rounded border-gray-300 text-teal-600 focus:ring-teal-500 cursor-pointer transition-colors"
                        />
                        <div className="text-left">
                          <div className="font-medium text-gray-900 text-sm">{s.name}</div>
                          {s.description && (
                            <div className="text-xs text-gray-500 mt-0.5">{s.description}</div>
                          )}
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>

        {availableSoftware.length === 0 && (
          <div className="text-center py-12">
            <Package className="w-16 h-16 text-gray-300 mx-auto mb-4" />
            <p className="text-gray-500 font-medium">Aucun logiciel disponible</p>
            <p className="text-sm text-gray-400 mt-1">
              Ajoutez des logiciels dans les paramètres pour pouvoir les assigner
            </p>
          </div>
        )}

        <div className="flex justify-end pt-4 border-t border-gray-100">
          <Button onClick={onClose} className="bg-teal-600 hover:bg-teal-700 text-white">
            Fermer
          </Button>
        </div>
      </div>
    </Modal>
  );
}
