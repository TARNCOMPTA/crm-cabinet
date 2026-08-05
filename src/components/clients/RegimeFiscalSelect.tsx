import { Select } from '../ui/Select';
import type { RegimeOption } from '../../hooks/useRegimesFiscaux';

interface RegimeFiscalSelectProps {
  value: string;
  onChange: (value: string) => void;
  regimes: RegimeOption[];
  label?: string;
  required?: boolean;
}

export function RegimeFiscalSelect({ value, onChange, regimes, label = 'Regime fiscal', required = false }: RegimeFiscalSelectProps) {
  return (
    <div>
      {label && (
        <label className="block text-sm font-medium text-gray-700 mb-2">
          {label}
          {required && <span className="text-red-500 ml-1">*</span>}
        </label>
      )}
      <Select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        required={required}
      >
        <option value="">Selectionner un regime fiscal</option>
        {regimes.map((regime) => (
          <option key={regime.value} value={regime.value}>
            {regime.label}
          </option>
        ))}
      </Select>
      {value && (
        <p className="mt-1 text-xs text-gray-500">
          {regimes.find(r => r.value === value)?.description}
        </p>
      )}
    </div>
  );
}
