import { Link } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import type { CrossReferenceItem } from '../../lib/clientCrossReferencesService';

interface CrossReferenceCardProps {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  count: number;
  items: CrossReferenceItem[];
  link: string;
  borderColor: string;
}

export function CrossReferenceCard({
  icon: Icon,
  title,
  count,
  items,
  link,
  borderColor,
}: CrossReferenceCardProps) {
  return (
    <div
      className={`bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-800 shadow-sm border-l-4 ${borderColor} hover:shadow-md transition-shadow duration-200`}
    >
      <div className="p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2.5">
            <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-gray-100 dark:bg-gray-800">
              <Icon className="w-4 h-4 text-gray-600 dark:text-gray-400" />
            </div>
            <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
              {title}
            </h3>
          </div>
          <span className="inline-flex items-center justify-center min-w-[24px] h-6 px-2 rounded-full bg-teal-100 dark:bg-teal-900/40 text-teal-700 dark:text-teal-400 text-xs font-bold">
            {count}
          </span>
        </div>

        {items.length > 0 && (
          <ul className="space-y-1.5 mb-3">
            {items.map((item, i) => (
              <li
                key={i}
                className="flex items-baseline justify-between gap-2 text-sm"
              >
                <span className="text-gray-700 dark:text-gray-300 truncate">
                  {item.label}
                </span>
                {item.sublabel && (
                  <span className="text-gray-400 dark:text-gray-500 text-xs whitespace-nowrap flex-shrink-0">
                    {item.sublabel}
                  </span>
                )}
              </li>
            ))}
          </ul>
        )}

        {link && (
          <Link
            to={link}
            className="inline-flex items-center gap-1 text-xs font-medium text-teal-600 hover:text-teal-700 dark:text-teal-400 dark:hover:text-teal-300 transition-colors"
          >
            Voir tout
            <ArrowRight className="w-3 h-3" />
          </Link>
        )}
      </div>
    </div>
  );
}
