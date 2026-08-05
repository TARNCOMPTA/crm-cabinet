import { useMemo } from 'react';
import { useLegalFormsFull } from '../../hooks/useLegalFormsCache';
import { Select } from '../ui/Select';

interface LegalFormSelectProps {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
}

export function LegalFormSelect({ value, onChange, disabled }: LegalFormSelectProps) {
  const { forms, loading } = useLegalFormsFull();

  const groupedForms = useMemo(() => {
    return forms.reduce((acc, form) => {
      const level = form.level ?? 0;
      if (!acc[level]) {
        acc[level] = [];
      }
      acc[level].push(form);
      return acc;
    }, {} as Record<number, typeof forms>);
  }, [forms]);

  if (loading) {
    return (
      <Select value={value} onChange={(e) => onChange(e.target.value)} disabled>
        <option>Chargement...</option>
      </Select>
    );
  }

  return (
    <Select value={value} onChange={(e) => onChange(e.target.value)} disabled={disabled}>
      <option value="">Sélectionner une forme juridique...</option>
      {Object.entries(groupedForms)
        .sort(([a], [b]) => Number(a) - Number(b))
        .map(([level, forms]) => (
          <optgroup key={level} label={`Niveau ${level}`}>
            {forms.map((form) => (
              <option key={form.code} value={form.label}>
                {form.code} - {form.label}
              </option>
            ))}
          </optgroup>
        ))}
    </Select>
  );
}
