import { ReactNode, MouseEventHandler } from 'react';

interface CardProps {
  children: ReactNode;
  className?: string;
  interactive?: boolean;
  /**
   * Quatre écrans passaient déjà `onClick` à `Card` — le kanban des tâches, le
   * dépôt de comptes, les rôles des collaborateurs et les exonérations — sans
   * que la prop soit déclarée ni transmise. React ne recopie pas les props
   * inconnues sur le DOM : le gestionnaire était donc purement perdu, et ces
   * cartes ne réagissaient pas au clic. TypeScript le signalait, au milieu du
   * bruit du cliquet.
   */
  onClick?: MouseEventHandler<HTMLDivElement>;
}

export function Card({ children, className = '', interactive = false, onClick }: CardProps) {
  return (
    <div
      className={`bg-white dark:bg-ink-900/60 dark:backdrop-blur-sm rounded-xl border border-gray-200/80 dark:border-white/[0.07] shadow-card dark:shadow-dark-soft ${interactive ? 'interactive-card' : ''} ${className}`}
      onClick={onClick}
    >
      {children}
    </div>
  );
}

interface CardHeaderProps {
  children: ReactNode;
  className?: string;
}

export function CardHeader({ children, className = '' }: CardHeaderProps) {
  return (
    <div className={`px-6 py-4 border-b border-gray-100 dark:border-white/[0.06] ${className}`}>
      {children}
    </div>
  );
}

interface CardContentProps {
  children: ReactNode;
  className?: string;
}

export function CardContent({ children, className = '' }: CardContentProps) {
  return <div className={`px-6 py-4 ${className}`}>{children}</div>;
}
