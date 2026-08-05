import { ShieldOff, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { getMissingByCategory, REFERENCE_SERVICE_NAMES } from '../../lib/habilitationsReference';
import type { CompletenessResult, ServiceEntry } from '../../types/habilitations';

interface HabilitationsExpandedRowProps {
  isWithout: boolean;
  completeness: CompletenessResult;
  services: ServiceEntry[];
}

export function HabilitationsExpandedRow({ isWithout, completeness, services }: HabilitationsExpandedRowProps) {
  const { missing } = completeness;
  const missingByCategory = getMissingByCategory(missing);
  const extraServiceNames = services
    .map((s) => s.service)
    .filter((name) => !REFERENCE_SERVICE_NAMES.includes(name));

  if (!isWithout && missing.length === 0) {
    return (
      <div className="ml-12 p-3 bg-green-50 dark:bg-green-900/20 border border-green-100 dark:border-green-800 rounded-lg flex items-center gap-2">
        <CheckCircle2 className="w-4 h-4 text-green-500" />
        <span className="text-xs font-medium text-green-700 dark:text-green-300">
          Dossier complet - tous les services sont ouverts
        </span>
      </div>
    );
  }

  return (
    <div className="ml-12 space-y-2">
      <div className="p-4 bg-red-50/50 dark:bg-red-900/20 border border-red-100 dark:border-red-800 rounded-lg">
        <p className="text-xs font-semibold text-red-800 dark:text-red-300 mb-3 flex items-center gap-1.5">
          {isWithout ? <ShieldOff className="w-3.5 h-3.5" /> : <AlertTriangle className="w-3.5 h-3.5" />}
          {isWithout
            ? 'Aucune habilitation importee - tous les services sont manquants'
            : `Services manquants (${missing.length})`}
        </p>
        <div className="space-y-2.5">
          {Object.entries(missingByCategory).map(([category, serviceNames]) => (
            <div key={category}>
              <p className="text-[10px] font-medium text-red-600/70 dark:text-red-400/70 uppercase tracking-wider mb-1">
                {category}
              </p>
              <div className="flex flex-wrap gap-1">
                {serviceNames.map((name) => (
                  <span
                    key={name}
                    className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-red-100/80 text-red-700 dark:bg-red-900/40 dark:text-red-300 line-through decoration-red-400/50"
                  >
                    {name}
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      {!isWithout && extraServiceNames.length > 0 && (
        <div className="p-3 bg-gray-50 dark:bg-gray-800 border border-gray-100 dark:border-gray-700 rounded-lg">
          <p className="text-[10px] font-medium text-gray-500 uppercase tracking-wider mb-1">
            Services hors referentiel
          </p>
          <div className="flex flex-wrap gap-1">
            {extraServiceNames.map((name) => (
              <span
                key={name}
                className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-500 dark:bg-gray-700 dark:text-gray-400"
              >
                {name}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
