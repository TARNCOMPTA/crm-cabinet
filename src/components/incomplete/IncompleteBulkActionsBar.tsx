import { useState } from 'react';
import { CheckSquare, Calendar, Package, CreditCard as Edit3, Sparkles, Loader } from 'lucide-react';
import { Button } from '../ui/Button';
import type { RegimeOption } from '../../hooks/useRegimesFiscaux';
import { TRACKED_FIELDS, type EditableFieldKey } from '../../lib/incompleteFieldsConfig';
import type { Database } from '../../types/database';

type Software = Database['public']['Tables']['software']['Row'];

interface LegalForm {
  code: string;
  label: string;
  level: number;
}

const TEXT_FIELDS = TRACKED_FIELDS.filter(
  f => f.editType === 'text' || f.editType === 'number'
);

interface IncompleteBulkActionsBarProps {
  selectedCount: number;
  sirenReadyCount: number;
  isEnriching: boolean;
  enrichProgress: { current: number; total: number } | null;
  groupedLegalForms: Record<number, LegalForm[]>;
  availableSoftware: Software[];
  regimesFiscaux: RegimeOption[];
  onBulkSetField: (field: EditableFieldKey, value: string) => void;
  onBulkAssignSoftware: (softwareId: string) => void;
  onBulkRemoveSoftware: (softwareId: string) => void;
  onBulkEnrichINPI: () => void;
  onClearSelection: () => void;
}

const SELECT_CLASS =
  'text-sm border border-gray-300 rounded-md px-3 py-2 bg-white text-gray-700 hover:border-gray-400 focus:outline-none focus:ring-1 focus:ring-teal-500 focus:border-teal-500 cursor-pointer transition-colors';

export function IncompleteBulkActionsBar({
  selectedCount,
  sirenReadyCount,
  isEnriching,
  enrichProgress,
  groupedLegalForms,
  availableSoftware,
  regimesFiscaux,
  onBulkSetField,
  onBulkAssignSoftware,
  onBulkRemoveSoftware,
  onBulkEnrichINPI,
  onClearSelection,
}: IncompleteBulkActionsBarProps) {
  const [activeDateField, setActiveDateField] = useState<'date_cloture' | 'date_creation_entreprise' | null>(null);
  const [dateValue, setDateValue] = useState('');
  const [activeTextField, setActiveTextField] = useState<EditableFieldKey | null>(null);
  const [textValue, setTextValue] = useState('');

  const handleDateConfirm = () => {
    if (dateValue && activeDateField) {
      onBulkSetField(activeDateField, dateValue);
      setDateValue('');
      setActiveDateField(null);
    }
  };

  const handleTextConfirm = () => {
    if (textValue && activeTextField) {
      onBulkSetField(activeTextField, textValue);
      setTextValue('');
      setActiveTextField(null);
    }
  };

  const handleDateCancel = () => {
    setActiveDateField(null);
    setDateValue('');
  };

  const handleTextCancel = () => {
    setActiveTextField(null);
    setTextValue('');
  };

  return (
    <div className="border-t border-gray-100 bg-teal-50/40 px-4 py-3">
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2 text-gray-700 font-medium text-sm whitespace-nowrap">
          <CheckSquare className="w-4 h-4 text-teal-600" />
          {selectedCount} selectionne{selectedCount > 1 ? 's' : ''}
        </div>

        <div className="h-5 w-px bg-gray-200 hidden sm:block" />

        <select
          className={SELECT_CLASS}
          defaultValue=""
          onChange={e => {
            if (e.target.value) {
              onBulkSetField('forme_juridique', e.target.value);
              e.target.value = '';
            }
          }}
        >
          <option value="" disabled>Forme juridique</option>
          {Object.entries(groupedLegalForms)
            .sort(([a], [b]) => Number(a) - Number(b))
            .map(([level, forms]) => (
              <optgroup key={level} label={`Niveau ${level}`}>
                {forms.map(form => (
                  <option key={form.code} value={form.label}>
                    {form.code} - {form.label}
                  </option>
                ))}
              </optgroup>
            ))}
        </select>

        <select
          className={SELECT_CLASS}
          defaultValue=""
          onChange={e => {
            if (e.target.value) {
              onBulkSetField('regime_fiscal', e.target.value);
              e.target.value = '';
            }
          }}
        >
          <option value="" disabled>Regime fiscal</option>
          {regimesFiscaux.map(r => (
            <option key={r.value} value={r.value}>{r.label}</option>
          ))}
        </select>

        {activeDateField === 'date_cloture' ? (
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-500 font-medium">Cloture :</span>
            <input
              type="date"
              value={dateValue}
              onChange={e => setDateValue(e.target.value)}
              className={SELECT_CLASS}
              autoFocus
            />
            <Button size="sm" onClick={handleDateConfirm} disabled={!dateValue} className="bg-teal-600 hover:bg-teal-700 text-white">
              OK
            </Button>
            <button onClick={handleDateCancel} className="text-sm text-gray-600 hover:text-gray-800 transition-colors">
              Annuler
            </button>
          </div>
        ) : (
          <Button
            size="sm"
            variant="outline"
            onClick={() => { setActiveDateField('date_cloture'); setDateValue(''); }}
            className="text-sm gap-1.5 border-gray-300 hover:bg-gray-50"
          >
            <Calendar className="w-3.5 h-3.5" />
            Cloture
          </Button>
        )}

        {activeDateField === 'date_creation_entreprise' ? (
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-500 font-medium">Creation :</span>
            <input
              type="date"
              value={dateValue}
              onChange={e => setDateValue(e.target.value)}
              className={SELECT_CLASS}
              autoFocus
            />
            <Button size="sm" onClick={handleDateConfirm} disabled={!dateValue} className="bg-teal-600 hover:bg-teal-700 text-white">
              OK
            </Button>
            <button onClick={handleDateCancel} className="text-sm text-gray-600 hover:text-gray-800 transition-colors">
              Annuler
            </button>
          </div>
        ) : (
          <Button
            size="sm"
            variant="outline"
            onClick={() => { setActiveDateField('date_creation_entreprise'); setDateValue(''); }}
            className="text-sm gap-1.5 border-gray-300 hover:bg-gray-50"
          >
            <Calendar className="w-3.5 h-3.5" />
            Creation
          </Button>
        )}

        {activeTextField ? (
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-500 font-medium">
              {TEXT_FIELDS.find(f => f.key === activeTextField)?.shortLabel} :
            </span>
            <input
              type={TRACKED_FIELDS.find(f => f.key === activeTextField)?.editType === 'number' ? 'number' : 'text'}
              value={textValue}
              onChange={e => setTextValue(e.target.value)}
              placeholder="Valeur..."
              className="text-sm border border-gray-300 rounded-md px-3 py-2 bg-white text-gray-700 focus:outline-none focus:ring-1 focus:ring-teal-500 focus:border-teal-500 transition-colors w-40"
              autoFocus
            />
            <Button size="sm" onClick={handleTextConfirm} disabled={!textValue} className="bg-teal-600 hover:bg-teal-700 text-white">
              OK
            </Button>
            <button onClick={handleTextCancel} className="text-sm text-gray-600 hover:text-gray-800 transition-colors">
              Annuler
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-1.5">
            <Edit3 className="w-3.5 h-3.5 text-gray-400" />
            <select
              className={SELECT_CLASS}
              defaultValue=""
              onChange={e => {
                if (e.target.value) {
                  setActiveTextField(e.target.value as EditableFieldKey);
                  setTextValue('');
                  e.target.value = '';
                }
              }}
            >
              <option value="" disabled>Remplir un champ...</option>
              {TEXT_FIELDS.map(f => (
                <option key={f.key} value={f.key}>{f.label}</option>
              ))}
            </select>
          </div>
        )}

        {availableSoftware.length > 0 && (
          <>
            <select
              className={SELECT_CLASS}
              defaultValue=""
              onChange={e => {
                if (e.target.value) {
                  onBulkAssignSoftware(e.target.value);
                  e.target.value = '';
                }
              }}
            >
              <option value="" disabled>
                <Package className="w-3.5 h-3.5 inline" /> Ajouter logiciel
              </option>
              {availableSoftware.map(sw => (
                <option key={sw.id} value={sw.id}>{sw.name}</option>
              ))}
            </select>

            <select
              className={SELECT_CLASS}
              defaultValue=""
              onChange={e => {
                if (e.target.value) {
                  onBulkRemoveSoftware(e.target.value);
                  e.target.value = '';
                }
              }}
            >
              <option value="" disabled>Retirer logiciel</option>
              {availableSoftware.map(sw => (
                <option key={sw.id} value={sw.id}>{sw.name}</option>
              ))}
            </select>
          </>
        )}

        <Button
          size="sm"
          onClick={onBulkEnrichINPI}
          disabled={isEnriching || sirenReadyCount === 0}
          className="bg-teal-600 hover:bg-teal-700 text-white gap-1.5 disabled:bg-gray-300 disabled:cursor-not-allowed"
          title={
            sirenReadyCount === 0
              ? 'Aucun client selectionne avec SIREN renseigne'
              : `Enrichir ${sirenReadyCount} client${sirenReadyCount > 1 ? 's' : ''} via l'API INPI`
          }
        >
          {isEnriching ? (
            <>
              <Loader className="w-3.5 h-3.5 animate-spin" />
              {enrichProgress ? `INPI ${enrichProgress.current}/${enrichProgress.total}` : 'Enrichissement...'}
            </>
          ) : (
            <>
              <Sparkles className="w-3.5 h-3.5" />
              Enrichir INPI {sirenReadyCount > 0 ? `(${sirenReadyCount})` : ''}
            </>
          )}
        </Button>

        <div className="flex-1" />

        <button
          onClick={onClearSelection}
          className="text-sm text-teal-600 hover:text-teal-700 font-medium whitespace-nowrap transition-colors"
        >
          Tout deselectionner
        </button>
      </div>
    </div>
  );
}
