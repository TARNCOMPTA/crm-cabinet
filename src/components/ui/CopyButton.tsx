import { useState } from 'react';
import { Copy, Check } from 'lucide-react';
import { useToast } from '../../contexts/ToastContext';

interface CopyButtonProps {
  value: string;
  label?: string;
}

export function CopyButton({ value, label = 'Valeur' }: CopyButtonProps) {
  const [copied, setCopied] = useState(false);
  const { showToast } = useToast();

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      showToast(`${label} copié`, 'success');
      setTimeout(() => setCopied(false), 2000);
    } catch {
      showToast('Erreur lors de la copie', 'error');
    }
  }

  if (!value) return null;

  return (
    <button
      onClick={handleCopy}
      className="p-1.5 text-gray-400 hover:text-teal-600 hover:bg-teal-50 rounded transition-colors"
      title={`Copier ${label}`}
    >
      {copied ? (
        <Check className="w-4 h-4 text-green-600" />
      ) : (
        <Copy className="w-4 h-4" />
      )}
    </button>
  );
}
