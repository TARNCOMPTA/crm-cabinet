import { useEffect, useState } from 'react';
import {
  Scale,
  Users,
  UserCheck,
  CheckSquare,
  BarChart3,
  Shield,
  Percent,
  TrendingUp,
  FileText,
  Monitor,
  Archive,
  ClipboardList,
} from 'lucide-react';
import {
  fetchClientCrossReferences,
  type CrossReferenceResult,
} from '../../lib/clientCrossReferencesService';
import { CrossReferenceCard } from './CrossReferenceCard';
import { Skeleton } from '../ui/Skeleton';

interface ClientSynthesisTabProps {
  clientId: string;
}

const MODULE_CONFIG: Record<
  string,
  {
    title: string;
    icon: React.ComponentType<{ className?: string }>;
    link: string;
    borderColor: string;
  }
> = {
  legal_acts: {
    title: 'Actes juridiques',
    icon: Scale,
    link: '/legal',
    borderColor: 'border-l-blue-500',
  },
  assemblies: {
    title: 'Assemblees generales',
    icon: Users,
    link: '/legal',
    borderColor: 'border-l-blue-400',
  },
  officers: {
    title: 'Dirigeants',
    icon: UserCheck,
    link: '/legal',
    borderColor: 'border-l-blue-600',
  },
  tasks: {
    title: 'Tâches',
    icon: CheckSquare,
    link: '/tasks',
    borderColor: 'border-l-amber-500',
  },
  bilans: {
    title: 'Bilans',
    icon: BarChart3,
    link: '/balance-sheets',
    borderColor: 'border-l-emerald-500',
  },
  habilitations: {
    title: 'Habilitations',
    icon: Shield,
    link: '/tax-authorizations',
    borderColor: 'border-l-teal-500',
  },
  exemptions: {
    title: 'Exonérations',
    icon: Percent,
    link: '/exemptions',
    borderColor: 'border-l-green-500',
  },
  opportunities: {
    title: 'Opportunités',
    icon: TrendingUp,
    link: '/opportunities',
    borderColor: 'border-l-sky-500',
  },
  software: {
    title: 'Logiciels',
    icon: Monitor,
    link: '/software',
    borderColor: 'border-l-cyan-500',
  },
  depot_comptes: {
    title: 'Depots des comptes',
    icon: Archive,
    link: '/legal',
    borderColor: 'border-l-rose-500',
  },
  meeting_notes: {
    title: 'Comptes-rendus RDV',
    icon: ClipboardList,
    link: '',
    borderColor: 'border-l-amber-600',
  },
};

/**
 * L'ordre d'affichage, et le SEUL endroit qui decide qu'un module existe.
 *
 * `activeModules` filtre sur les donnees reellement rendues par
 * `fetchClientCrossReferences` : une cle qui n'y figure pas ne s'affiche jamais.
 * Deux entrees en profitaient pour survivre sans rien montrer —
 * « Echeances fiscales » (`/fiscal-deadlines`) et « Documents generes »
 * (`/documents`), toutes deux pointant vers des ecrans RETIRES du produit. Leur
 * carte ne pouvait pas apparaitre, donc leur lien mort ne pouvait pas etre
 * clique : personne ne les signalait, et elles donnaient a lire une liste de
 * modules qui n'existent plus.
 *
 * Ajouter une cle ici sans que le service la produise reproduit exactement cela.
 */
const MODULE_ORDER = [
  'legal_acts',
  'assemblies',
  'officers',
  'tasks',
  'bilans',
  'habilitations',
  'exemptions',
  'opportunities',
  'software',
  'depot_comptes',
  'meeting_notes',
];

export function ClientSynthesisTab({ clientId }: ClientSynthesisTabProps) {
  const [data, setData] = useState<Record<string, CrossReferenceResult> | null>(
    null
  );
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetchClientCrossReferences(clientId)
      .then((result) => {
        if (!cancelled) {
          setData(result);
          setLoading(false);
        }
      })
      .catch(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [clientId]);

  if (loading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {[...Array(6)].map((_, i) => (
          <div
            key={i}
            className="bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-800 p-4 space-y-3"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <Skeleton className="h-8 w-8 rounded-lg" />
                <Skeleton className="h-4 w-28" />
              </div>
              <Skeleton className="h-6 w-8 rounded-full" />
            </div>
            <div className="space-y-2">
              <Skeleton className="h-3.5 w-full" />
              <Skeleton className="h-3.5 w-3/4" />
              <Skeleton className="h-3.5 w-5/6" />
            </div>
            <Skeleton className="h-3 w-16" />
          </div>
        ))}
      </div>
    );
  }

  const activeModules = MODULE_ORDER.filter((key) => data?.[key]);

  if (activeModules.length === 0) {
    return (
      <div className="text-center py-16">
        <div className="w-12 h-12 mx-auto mb-4 rounded-full bg-gray-100 dark:bg-gray-800 flex items-center justify-center">
          <FileText className="w-6 h-6 text-gray-400" />
        </div>
        <p className="text-gray-500 dark:text-gray-400 text-sm">
          Aucune reference trouvee pour ce client
        </p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
      {activeModules.map((key) => {
        const config = MODULE_CONFIG[key];
        const moduleData = data![key];
        return (
          <CrossReferenceCard
            key={key}
            icon={config.icon}
            title={config.title}
            count={moduleData.count}
            items={moduleData.items}
            link={config.link}
            borderColor={config.borderColor}
          />
        );
      })}
    </div>
  );
}
