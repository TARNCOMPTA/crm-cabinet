import { Select } from '../ui/Select';

interface MonthPickerProps {
  value: string;
  onChange: (date: string) => void;
  label?: string;
  required?: boolean;
}

/**
 * Les douze mois, DECEMBRE EN TETE : c'est la cloture de la grande majorite des
 * dossiers, et la mettre en premier evite de derouler toute la liste pour le cas
 * courant. L'ordre n'est donc pas un oubli.
 *
 * Exportee pour la saisie de cloture dans la liste des clients
 * (ClientsTable.tsx) : deux listes de mois finiraient par diverger sur cet ordre
 * precis, qui est le seul detail qui compte ici.
 */
export const MOIS_CLOTURE = [
  { value: '12', label: 'Décembre' },
  { value: '01', label: 'Janvier' },
  { value: '02', label: 'Février' },
  { value: '03', label: 'Mars' },
  { value: '04', label: 'Avril' },
  { value: '05', label: 'Mai' },
  { value: '06', label: 'Juin' },
  { value: '07', label: 'Juillet' },
  { value: '08', label: 'Août' },
  { value: '09', label: 'Septembre' },
  { value: '10', label: 'Octobre' },
  { value: '11', label: 'Novembre' },
];

export function MonthPicker({ value, onChange, label = 'Mois de clôture', required = false }: MonthPickerProps) {
  const month = value ? value.substring(5, 7) : '';

  const handleMonthChange = (newMonth: string) => {
    const currentYear = new Date().getFullYear();
    const newDate = `${currentYear}-${newMonth}-01`;
    onChange(newDate);
  };

  return (
    <div>
      {label && (
        <label className="block text-sm font-medium text-gray-700 mb-2">
          {label}
          {required && <span className="text-red-500 ml-1">*</span>}
        </label>
      )}
      <Select
        value={month}
        onChange={(e) => handleMonthChange(e.target.value)}
        required={required}
      >
        <option value="">Sélectionner un mois</option>
        {MOIS_CLOTURE.map((m) => (
          <option key={m.value} value={m.value}>
            {m.label}
          </option>
        ))}
      </Select>
      {value && (
        <p className="mt-1 text-xs text-gray-500">
          Clôture le dernier jour de {MOIS_CLOTURE.find(m => m.value === month)?.label.toLowerCase()}
        </p>
      )}
    </div>
  );
}
