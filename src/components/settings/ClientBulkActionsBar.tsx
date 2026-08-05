import { Button } from '../ui/Button';
import { CheckSquare, UserPlus, UserMinus, Calendar } from 'lucide-react';
import { ClientStatus, Database } from '../../types/database';
import { useState } from 'react';
import type { RegimeOption } from '../../hooks/useRegimesFiscaux';

type Software = Database['public']['Tables']['software']['Row'];

interface ClientBulkActionsBarProps {
  selectedCount: number;
  onChangeStatus: (status: ClientStatus) => void;
  onChangeRegime: (regime: string) => void;
  onAssignAll: () => void;
  onUnassignAll: () => void;
  onClearSelection: () => void;
  onSetClosingDate?: (date: string) => void;
  onAssignSoftware?: (softwareId: string) => void;
  onRemoveSoftware?: (softwareId: string) => void;
  availableSoftware?: Software[];
  regimesFiscaux: RegimeOption[];
}

export function ClientBulkActionsBar({
  selectedCount,
  onChangeStatus,
  onChangeRegime,
  onAssignAll,
  onUnassignAll,
  onClearSelection,
  onSetClosingDate,
  onAssignSoftware,
  onRemoveSoftware,
  availableSoftware = [],
  regimesFiscaux,
}: ClientBulkActionsBarProps) {
  const [showDateInput, setShowDateInput] = useState(false);
  const [dateValue, setDateValue] = useState('');

  const handleSetDate = () => {
    if (dateValue && onSetClosingDate) {
      onSetClosingDate(dateValue);
      setDateValue('');
      setShowDateInput(false);
    }
  };

  return (
    <div className="flex flex-wrap items-center gap-3 bg-white border border-gray-200 rounded-lg px-4 py-3 shadow-sm">
      <div className="flex items-center gap-2 text-gray-700 font-medium text-sm whitespace-nowrap">
        <CheckSquare className="w-4 h-4 text-teal-600" />
        {selectedCount} selectionne{selectedCount > 1 ? 's' : ''}
      </div>

      <div className="h-5 w-px bg-gray-200 hidden sm:block" />

      <select
        className="text-sm border border-gray-300 rounded-md px-3 py-2 bg-white text-gray-700 hover:border-gray-400 focus:outline-none focus:ring-1 focus:ring-teal-500 focus:border-teal-500 cursor-pointer transition-colors"
        defaultValue=""
        onChange={(e) => {
          if (e.target.value) {
            onChangeStatus(e.target.value as ClientStatus);
            e.target.value = '';
          }
        }}
      >
        <option value="" disabled>Changer le statut</option>
        <option value="actif">Actif</option>
        <option value="inactif">Inactif</option>
        <option value="prospect">Prospect</option>
      </select>

      <select
        className="text-sm border border-gray-300 rounded-md px-3 py-2 bg-white text-gray-700 hover:border-gray-400 focus:outline-none focus:ring-1 focus:ring-teal-500 focus:border-teal-500 cursor-pointer transition-colors"
        defaultValue=""
        onChange={(e) => {
          if (e.target.value) {
            onChangeRegime(e.target.value);
            e.target.value = '';
          }
        }}
      >
        <option value="" disabled>Changer le regime</option>
        {regimesFiscaux.map((regime) => (
          <option key={regime.value} value={regime.value}>
            {regime.label}
          </option>
        ))}
      </select>

      <Button size="sm" variant="outline" onClick={onAssignAll} className="text-sm gap-1.5 border-gray-300 hover:bg-gray-50">
        <UserPlus className="w-3.5 h-3.5" />
        Assigner tous
      </Button>

      <Button size="sm" variant="outline" onClick={onUnassignAll} className="text-sm gap-1.5 border-gray-300 hover:bg-gray-50">
        <UserMinus className="w-3.5 h-3.5" />
        Desassigner tous
      </Button>

      {onSetClosingDate && (
        <>
          {!showDateInput ? (
            <Button size="sm" variant="outline" onClick={() => setShowDateInput(true)} className="text-sm gap-1.5 border-gray-300 hover:bg-gray-50">
              <Calendar className="w-3.5 h-3.5" />
              Date de cloture
            </Button>
          ) : (
            <div className="flex items-center gap-2">
              <input
                type="date"
                value={dateValue}
                onChange={(e) => setDateValue(e.target.value)}
                className="text-sm border border-gray-300 rounded-md px-3 py-2 bg-white text-gray-700 hover:border-gray-400 focus:outline-none focus:ring-1 focus:ring-teal-500 focus:border-teal-500 transition-colors"
              />
              <Button size="sm" onClick={handleSetDate} disabled={!dateValue} className="bg-teal-600 hover:bg-teal-700">
                OK
              </Button>
              <button
                onClick={() => { setShowDateInput(false); setDateValue(''); }}
                className="text-sm text-gray-600 hover:text-gray-800 transition-colors"
              >
                Annuler
              </button>
            </div>
          )}
        </>
      )}

      {onAssignSoftware && availableSoftware.length > 0 && (
        <select
          className="text-sm border border-gray-300 rounded-md px-3 py-2 bg-white text-gray-700 hover:border-gray-400 focus:outline-none focus:ring-1 focus:ring-teal-500 focus:border-teal-500 cursor-pointer transition-colors"
          defaultValue=""
          onChange={(e) => {
            if (e.target.value) {
              onAssignSoftware(e.target.value);
              e.target.value = '';
            }
          }}
        >
          <option value="" disabled>Ajouter logiciel</option>
          {availableSoftware.map(software => (
            <option key={software.id} value={software.id}>
              {software.name}
            </option>
          ))}
        </select>
      )}

      {onRemoveSoftware && availableSoftware.length > 0 && (
        <select
          className="text-sm border border-gray-300 rounded-md px-3 py-2 bg-white text-gray-700 hover:border-gray-400 focus:outline-none focus:ring-1 focus:ring-teal-500 focus:border-teal-500 cursor-pointer transition-colors"
          defaultValue=""
          onChange={(e) => {
            if (e.target.value) {
              onRemoveSoftware(e.target.value);
              e.target.value = '';
            }
          }}
        >
          <option value="" disabled>Retirer logiciel</option>
          {availableSoftware.map(software => (
            <option key={software.id} value={software.id}>
              {software.name}
            </option>
          ))}
        </select>
      )}

      <div className="flex-1" />

      <button
        onClick={onClearSelection}
        className="text-sm text-teal-600 hover:text-teal-700 font-medium whitespace-nowrap transition-colors"
      >
        Tout deselectionner
      </button>
    </div>
  );
}
