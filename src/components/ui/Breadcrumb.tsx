import { Link } from 'react-router-dom';
import { ChevronRight, Home } from 'lucide-react';

export interface BreadcrumbItem {
  label: string;
  to?: string;
  icon?: React.ComponentType<{ className?: string }>;
}

interface BreadcrumbProps {
  items: BreadcrumbItem[];
  className?: string;
}

export function Breadcrumb({ items, className = '' }: BreadcrumbProps) {
  return (
    <nav aria-label="Fil d'Ariane" className={`flex items-center text-sm ${className}`}>
      <ol className="flex items-center flex-wrap gap-1 min-w-0">
        <li className="flex items-center">
          <Link
            to="/dashboard"
            className="flex items-center text-gray-500 hover:text-teal-600 dark:text-gray-400 dark:hover:text-teal-400 transition-colors"
            aria-label="Accueil"
          >
            <Home className="w-4 h-4" />
          </Link>
        </li>
        {items.map((item, idx) => {
          const isLast = idx === items.length - 1;
          const Icon = item.icon;
          return (
            <li key={idx} className="flex items-center min-w-0">
              <ChevronRight className="w-4 h-4 text-gray-300 dark:text-gray-600 mx-1 flex-shrink-0" />
              {item.to && !isLast ? (
                <Link
                  to={item.to}
                  className="flex items-center gap-1 text-gray-500 hover:text-teal-600 dark:text-gray-400 dark:hover:text-teal-400 transition-colors truncate"
                >
                  {Icon && <Icon className="w-3.5 h-3.5 flex-shrink-0" />}
                  <span className="truncate">{item.label}</span>
                </Link>
              ) : (
                <span
                  className={`flex items-center gap-1 truncate ${
                    isLast
                      ? 'font-medium text-gray-900 dark:text-gray-100'
                      : 'text-gray-500 dark:text-gray-400'
                  }`}
                  aria-current={isLast ? 'page' : undefined}
                >
                  {Icon && <Icon className="w-3.5 h-3.5 flex-shrink-0" />}
                  <span className="truncate">{item.label}</span>
                </span>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
