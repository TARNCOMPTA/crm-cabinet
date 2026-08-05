import { useState, useRef, useEffect } from 'react';
import { Maximize2 } from 'lucide-react';
import { Modal } from './Modal';
import { Button } from './Button';

interface ExpandableTextareaProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  minRows?: number;
  maxHeightClass?: string;
}

export function ExpandableTextarea({
  label,
  value,
  onChange,
  placeholder,
  minRows = 6,
  maxHeightClass = 'max-h-64',
}: ExpandableTextareaProps) {
  const [fullscreen, setFullscreen] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fullscreenRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (fullscreen && fullscreenRef.current) {
      fullscreenRef.current.focus();
      const len = fullscreenRef.current.value.length;
      fullscreenRef.current.setSelectionRange(len, len);
    }
  }, [fullscreen]);

  const lineCount = value ? value.split('\n').length : 0;
  const charCount = value.length;

  return (
    <div className="w-full">
      <div className="flex items-center justify-between mb-1 gap-3">
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
          {label}
        </label>
        <button
          type="button"
          onClick={() => setFullscreen(true)}
          className="inline-flex items-center gap-1 text-xs text-gray-500 dark:text-gray-400 hover:text-teal-600 dark:hover:text-teal-400 transition-colors"
          title="Agrandir"
        >
          <Maximize2 className="w-3.5 h-3.5" />
          Agrandir
        </button>
      </div>
      <textarea
        ref={textareaRef}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        rows={minRows}
        className={`w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 border-gray-300 dark:border-gray-700 resize-y overflow-auto ${maxHeightClass} whitespace-pre-wrap font-mono text-sm`}
      />
      {charCount > 0 && (
        <div className="mt-1 flex items-center justify-between text-[11px] text-gray-400 dark:text-gray-500">
          <span>{lineCount} ligne{lineCount > 1 ? 's' : ''} - {charCount} caractere{charCount > 1 ? 's' : ''}</span>
        </div>
      )}

      {fullscreen && (
        <Modal
          isOpen={fullscreen}
          onClose={() => setFullscreen(false)}
          title={label}
          size="xl"
        >
          <div className="flex flex-col gap-4">
            <textarea
              ref={fullscreenRef}
              value={value}
              onChange={(e) => onChange(e.target.value)}
              placeholder={placeholder}
              className="w-full px-4 py-3 border rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 border-gray-300 dark:border-gray-700 resize-none whitespace-pre-wrap font-mono text-sm leading-relaxed"
              style={{ height: '70vh' }}
            />
            <div className="flex items-center justify-between">
              <span className="text-xs text-gray-500 dark:text-gray-400">
                {lineCount} ligne{lineCount > 1 ? 's' : ''} - {charCount} caractere{charCount > 1 ? 's' : ''}
              </span>
              <Button onClick={() => setFullscreen(false)}>
                Fermer
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
