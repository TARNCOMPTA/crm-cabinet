import { useState } from 'react';
import { Badge } from '../ui/Badge';
import { CheckCircle, XCircle, Clock, Info } from 'lucide-react';

interface INPIStatusBadgeProps {
  lastSync: string | null;
  className?: string;
}

function formatDate(date: Date) {
  return date.toLocaleDateString('fr-FR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}

function getStatusInfo(daysSinceSync: number, syncDate: Date) {
  if (daysSinceSync > 90) {
    return {
      variant: 'orange' as const,
      icon: <XCircle className="w-3 h-3 mr-1" />,
      text: 'Obsolète',
      tooltip: `Les données INPI n'ont pas été synchronisées depuis plus de 90 jours (dernière sync : ${formatDate(syncDate)}). Les informations légales affichées peuvent ne plus être à jour. Lancez une synchronisation pour actualiser la fiche.`,
    };
  }
  if (daysSinceSync > 30) {
    return {
      variant: 'orange' as const,
      icon: <Clock className="w-3 h-3 mr-1" />,
      text: 'À actualiser',
      tooltip: `Les données INPI datent de plus de 30 jours (dernière sync : ${formatDate(syncDate)}). Une synchronisation est recommandée pour garantir la fiabilité des informations.`,
    };
  }
  return {
    variant: 'green' as const,
    icon: <CheckCircle className="w-3 h-3 mr-1" />,
    text: 'À jour',
    tooltip: `Données INPI synchronisées le ${formatDate(syncDate)}.`,
  };
}

export function INPIStatusBadge({ lastSync, className = '' }: INPIStatusBadgeProps) {
  const [showTooltip, setShowTooltip] = useState(false);

  if (!lastSync) {
    return (
      <div
        className={`relative inline-flex ${className}`}
        onMouseEnter={() => setShowTooltip(true)}
        onMouseLeave={() => setShowTooltip(false)}
      >
        <Badge variant="gray" className="cursor-help">
          <Clock className="w-3 h-3 mr-1" />
          Jamais synchronisé
          <Info className="w-3 h-3 ml-1 opacity-60" />
        </Badge>
        {showTooltip && (
          <Tooltip text="Ce client n'a jamais été synchronisé avec l'INPI. Lancez une synchronisation pour importer les données légales officielles." />
        )}
      </div>
    );
  }

  const syncDate = new Date(lastSync);
  const now = new Date();
  const daysSinceSync = Math.floor((now.getTime() - syncDate.getTime()) / (1000 * 60 * 60 * 24));
  const status = getStatusInfo(daysSinceSync, syncDate);

  return (
    <div
      className={`relative inline-flex ${className}`}
      onMouseEnter={() => setShowTooltip(true)}
      onMouseLeave={() => setShowTooltip(false)}
    >
      <Badge variant={status.variant} className="cursor-help">
        {status.icon}
        {status.text}
        {status.variant === 'orange' && <Info className="w-3 h-3 ml-1 opacity-60" />}
      </Badge>
      {showTooltip && <Tooltip text={status.tooltip} />}
    </div>
  );
}

function Tooltip({ text }: { text: string }) {
  return (
    <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 z-50 w-64 px-3 py-2 text-xs leading-relaxed text-white bg-gray-900 dark:bg-gray-700 rounded-lg shadow-lg pointer-events-none animate-in fade-in duration-150">
      {text}
      <div className="absolute top-full left-1/2 -translate-x-1/2 -mt-px border-4 border-transparent border-t-gray-900 dark:border-t-gray-700" />
    </div>
  );
}
