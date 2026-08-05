import { ButtonHTMLAttributes, forwardRef } from 'react';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost' | 'outline' | 'default' | 'warning';
  size?: 'sm' | 'md' | 'lg';
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ children, variant = 'primary', size = 'md', className = '', disabled, ...props }, ref) => {
    const baseStyles = 'inline-flex items-center justify-center font-medium rounded-xl transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-offset-2 dark:focus:ring-offset-ink-900 dark:focus:ring-cyan-400/60 disabled:opacity-50 disabled:cursor-not-allowed active:scale-[0.97]';

    const variants = {
      primary: 'bg-teal-600 text-white hover:bg-teal-700 shadow-sm hover:shadow-md focus:ring-teal-500 dark:bg-cyan-500 dark:hover:bg-cyan-400 dark:text-ink-950 dark:shadow-glow-cyan-sm dark:hover:shadow-glow-cyan',
      secondary: 'bg-gray-100 text-gray-900 hover:bg-gray-200 focus:ring-gray-500 dark:bg-white/[0.06] dark:text-slate-100 dark:hover:bg-white/[0.10] dark:ring-1 dark:ring-white/10',
      danger: 'bg-red-600 text-white hover:bg-red-700 shadow-sm focus:ring-red-500 dark:bg-red-500 dark:hover:bg-red-400',
      ghost: 'text-gray-700 hover:bg-gray-100 focus:ring-gray-500 dark:text-slate-300 dark:hover:bg-white/[0.06] dark:hover:text-white',
      outline: 'border border-gray-200 text-gray-700 hover:bg-gray-50 hover:border-gray-300 focus:ring-gray-500 dark:border-white/10 dark:text-slate-200 dark:hover:bg-white/[0.04] dark:hover:border-cyan-400/40',
      default: 'bg-gray-100 text-gray-700 hover:bg-gray-200 focus:ring-gray-500 dark:bg-white/[0.04] dark:text-slate-200 dark:hover:bg-white/[0.08] dark:ring-1 dark:ring-white/10',
      warning: 'bg-amber-500 text-white hover:bg-amber-600 shadow-sm focus:ring-amber-500 dark:bg-amber-500 dark:hover:bg-amber-400 dark:text-ink-950',
    };

    const sizes = {
      sm: 'px-3 py-1.5 text-sm',
      md: 'px-4 py-2 text-sm',
      lg: 'px-6 py-2.5 text-base',
    };

    return (
      <button
        ref={ref}
        className={`${baseStyles} ${variants[variant]} ${sizes[size]} ${className}`}
        disabled={disabled}
        {...props}
      >
        {children}
      </button>
    );
  }
);

Button.displayName = 'Button';
