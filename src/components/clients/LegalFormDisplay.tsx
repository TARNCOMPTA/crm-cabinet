import { useLegalFormsCache } from '../../hooks/useLegalFormsCache';
import { getLegalFormLabelSync } from '../../lib/legalFormsUtils';

interface LegalFormDisplayProps {
  value: string | null | undefined;
  className?: string;
}

export function LegalFormDisplay({ value, className = '' }: LegalFormDisplayProps) {
  const { cache, loading } = useLegalFormsCache();

  if (loading) {
    return <span className={className}>...</span>;
  }

  const label = getLegalFormLabelSync(value, cache);
  return <span className={className}>{label || '-'}</span>;
}
