import { memo } from 'react';
import { Package, AlertCircle, AlertTriangle, Sparkles, Copy } from 'lucide-react';
import type { RegimeOption } from '../../hooks/useRegimesFiscaux';
import type { TrackedFieldKey, EditableFieldKey, ValidationResult } from '../../lib/incompleteFieldsConfig';
import type { Database } from '../../types/database';

type Client = Database['public']['Tables']['clients']['Row'];
type Software = Database['public']['Tables']['software']['Row'];

interface LegalForm {
  code: string;
  label: string;
  level: number;
}

interface FieldCellProps {
  client: Client;
  field: { key: TrackedFieldKey; editType: string };
  isMissing: boolean;
  effectiveValue: string;
  effectiveSoftware: string[];
  availableSoftware: Software[];
  groupedLegalForms: Record<number, LegalForm[]>;
  regimesFiscaux: RegimeOption[];
  validation?: ValidationResult;
  isDuplicateSiren?: boolean;
  sirenSuggestion?: string | null;
  onFieldChange: (clientId: string, field: EditableFieldKey, value: string) => void;
  onOpenSoftwareModal: () => void;
}

const INPUT_BASE = 'w-full h-8 px-2 text-sm border border-transparent rounded bg-transparent hover:border-gray-300 focus:border-teal-500 focus:bg-white focus:outline-none focus:ring-1 focus:ring-teal-500 transition-all';

function validationClasses(v?: ValidationResult): string {
  if (!v || v.level === 'valid') return '';
  if (v.level === 'invalid') return 'border-red-400 bg-red-50/50';
  return 'border-amber-300 bg-amber-50/40';
}

export const FieldCell = memo(function FieldCell({
  client,
  field,
  isMissing,
  effectiveValue,
  effectiveSoftware,
  availableSoftware,
  groupedLegalForms,
  regimesFiscaux,
  validation,
  isDuplicateSiren,
  sirenSuggestion,
  onFieldChange,
  onOpenSoftwareModal,
}: FieldCellProps) {
  const cellBg = isMissing && !effectiveValue ? 'bg-red-50/40' : '';

  if (field.key === 'software') {
    return (
      <td className={`py-3 px-3 ${isMissing && effectiveSoftware.length === 0 ? 'bg-red-50/40' : ''}`}>
        <div className="flex items-center gap-1.5">
          {effectiveSoftware.length > 0 ? (
            <>
              {effectiveSoftware.slice(0, 1).map(swId => {
                const sw = availableSoftware.find(s => s.id === swId);
                return sw ? (
                  <span key={sw.id} className="inline-flex items-center px-2 py-0.5 text-xs font-medium bg-gray-100 text-gray-700 rounded">
                    {sw.name}
                  </span>
                ) : null;
              })}
              {effectiveSoftware.length > 1 && (
                <span className="text-xs text-gray-500">+{effectiveSoftware.length - 1}</span>
              )}
            </>
          ) : (
            <span className="text-xs text-red-400 font-medium">Manquant</span>
          )}
          <button
            onClick={onOpenSoftwareModal}
            className="p-1 text-gray-400 hover:text-teal-600 hover:bg-teal-50 rounded transition-colors"
            title="Gerer les logiciels"
          >
            <Package className="w-3.5 h-3.5" />
          </button>
        </div>
      </td>
    );
  }

  if (field.key === 'forme_juridique') {
    return (
      <td className={`py-3 px-3 ${cellBg}`}>
        <select
          value={effectiveValue}
          onChange={e => onFieldChange(client.id, 'forme_juridique', e.target.value)}
          className={`${INPUT_BASE} max-w-[180px] cursor-pointer ${!effectiveValue ? 'text-red-400' : 'text-gray-700'}`}
        >
          <option value="">{isMissing ? 'Manquant' : '-'}</option>
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
      </td>
    );
  }

  if (field.key === 'regime_fiscal') {
    return (
      <td className={`py-3 px-3 ${cellBg}`}>
        <select
          value={effectiveValue}
          onChange={e => onFieldChange(client.id, 'regime_fiscal', e.target.value)}
          className={`${INPUT_BASE} max-w-[120px] cursor-pointer ${!effectiveValue ? 'text-red-400' : 'text-gray-700'}`}
        >
          <option value="">{isMissing ? 'Manquant' : '-'}</option>
          {regimesFiscaux.map(r => (
            <option key={r.value} value={r.value}>{r.label}</option>
          ))}
        </select>
      </td>
    );
  }

  if (field.editType === 'date') {
    return (
      <td className={`py-3 px-3 ${cellBg}`}>
        <input
          type="date"
          value={effectiveValue}
          onChange={e => onFieldChange(client.id, field.key as EditableFieldKey, e.target.value)}
          className={`${INPUT_BASE} max-w-[150px] ${!effectiveValue ? 'text-red-400' : 'text-gray-700'}`}
        />
      </td>
    );
  }

  if (field.editType === 'number') {
    return (
      <td className={`py-3 px-3 ${cellBg}`}>
        <div className="flex items-center gap-1">
          <input
            type="number"
            value={effectiveValue}
            onChange={e => onFieldChange(client.id, field.key as EditableFieldKey, e.target.value)}
            placeholder={isMissing ? 'Manquant' : '-'}
            className={`${INPUT_BASE} max-w-[120px] ${!effectiveValue ? 'placeholder:text-red-400' : ''} ${validationClasses(validation)}`}
          />
          {validation && validation.level !== 'valid' && (
            <span
              title={validation.message}
              className={validation.level === 'invalid' ? 'text-red-500' : 'text-amber-500'}
            >
              {validation.level === 'invalid'
                ? <AlertCircle className="w-3.5 h-3.5" />
                : <AlertTriangle className="w-3.5 h-3.5" />}
            </span>
          )}
        </div>
      </td>
    );
  }

  const fieldKey = field.key as EditableFieldKey;
  const showSirenSuggestion = field.key === 'siren' && !effectiveValue && !!sirenSuggestion;

  return (
    <td className={`py-3 px-3 ${cellBg}`}>
      <div className="flex items-center gap-1">
        <input
          type="text"
          value={effectiveValue}
          onChange={e => onFieldChange(client.id, fieldKey, e.target.value)}
          placeholder={isMissing ? 'Manquant' : '-'}
          // 160 px suffisent pour un SIREN ou un code APE, pas pour une rue :
          // « 12 RUE de l Exemple » y est tronque a la saisie.
          className={`${INPUT_BASE} ${fieldKey === 'adresse_ligne1' ? 'max-w-[240px]' : 'max-w-[160px]'} ${!effectiveValue ? 'placeholder:text-red-400' : ''} ${validationClasses(validation)}`}
        />
        {showSirenSuggestion && (
          <button
            type="button"
            onClick={() => onFieldChange(client.id, 'siren', sirenSuggestion!)}
            title={`Deduire le SIREN du SIRET (${sirenSuggestion})`}
            className="shrink-0 inline-flex items-center gap-0.5 px-1.5 h-6 rounded text-[10px] font-medium bg-teal-50 text-teal-700 hover:bg-teal-100 border border-teal-200 transition-colors"
          >
            <Sparkles className="w-3 h-3" />
            Auto
          </button>
        )}
        {field.key === 'siren' && isDuplicateSiren && effectiveValue && (
          <span
            title="Ce SIREN est deja utilise par un autre client"
            className="shrink-0 text-amber-500"
          >
            <Copy className="w-3.5 h-3.5" />
          </span>
        )}
        {validation && validation.level !== 'valid' && (
          <span
            title={validation.message}
            className={validation.level === 'invalid' ? 'text-red-500' : 'text-amber-500'}
          >
            {validation.level === 'invalid'
              ? <AlertCircle className="w-3.5 h-3.5" />
              : <AlertTriangle className="w-3.5 h-3.5" />}
          </span>
        )}
      </div>
    </td>
  );
});
