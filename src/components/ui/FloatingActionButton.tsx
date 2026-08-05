import { useState } from 'react';
import { Plus } from 'lucide-react';

interface FloatingActionButtonProps {
  onClick: () => void;
  label: string;
}

export function FloatingActionButton({ onClick, label }: FloatingActionButtonProps) {
  const [hovered, setHovered] = useState(false);

  return (
    <div className="fixed bottom-24 right-6 z-[9999] flex items-center gap-3">
      <span
        className={`px-3 py-1.5 rounded-lg bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900 text-sm font-medium shadow-lg whitespace-nowrap pointer-events-none transition-all duration-200 ${
          hovered ? 'opacity-100 translate-x-0' : 'opacity-0 translate-x-2'
        }`}
      >
        {label}
      </span>
      <button
        type="button"
        onClick={onClick}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        className="w-14 h-14 rounded-full bg-teal-600 hover:bg-teal-700 text-white shadow-lg hover:shadow-xl flex items-center justify-center transition-all duration-300 hover:scale-110 active:scale-95 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:ring-offset-2 dark:focus:ring-offset-gray-900"
      >
        <Plus className="w-6 h-6 transition-transform duration-300" style={{ transform: hovered ? 'rotate(90deg)' : 'rotate(0deg)' }} />
      </button>
    </div>
  );
}
