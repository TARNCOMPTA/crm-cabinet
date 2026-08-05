import { ReactNode, memo } from 'react';

export interface BadgeProps {
  children: ReactNode;
  variant?: 'default' | 'success' | 'warning' | 'danger' | 'info' | 'blue' | 'orange' | 'green' | 'gray' | 'violet';
  className?: string;
  title?: string;
  style?: React.CSSProperties;
}

const variants = {
  default: 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-300',
  success: 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-400',
  warning: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/40 dark:text-yellow-400',
  danger: 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-400',
  info: 'bg-teal-100 text-teal-800 dark:bg-teal-900/40 dark:text-teal-400',
  blue: 'bg-teal-100 text-teal-800 dark:bg-teal-900/40 dark:text-teal-400',
  orange: 'bg-orange-100 text-orange-800 dark:bg-orange-900/40 dark:text-orange-400',
  green: 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-400',
  gray: 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-300',
  violet: 'bg-violet-100 text-violet-800 dark:bg-violet-900/40 dark:text-violet-400',
};

export const Badge = memo(function Badge({ children, variant = 'default', className = '', title, style }: BadgeProps) {
  return (
    <span
      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${variants[variant]} ${className}`}
      title={title}
      style={style}
    >
      {children}
    </span>
  );
});
