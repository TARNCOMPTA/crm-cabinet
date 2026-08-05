import { useState, useEffect } from 'react';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { Select } from '../ui/Select';
import { RelanceInvoiceWithClient, ReglementData } from '../../lib/relanceService';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (invoiceId: string, data: ReglementData) => void;
  invoice: RelanceInvoiceWithClient | null;
  saving?: boolean;
}

const MODE_OPTIONS = [
  { value: 'virement', label: 'Virement' },
  { value: 'cheque', label: 'Cheque' },
  { value: 'especes', label: 'Especes' },
  { value: 'prelevement', label: 'Prelevement' },
  { value: 'cb', label: 'Carte bancaire' },
  { value: 'autre', label: 'Autre' },
];

function formatCurrency(amount: number) {
  return new Intl.NumberFormat('fr-FR', {
    style: 'currency',
    currency: 'EUR',
  }).format(amount);
}

export function ReglementModal({ isOpen, onClose, onConfirm, invoice, saving }: Props) {
  const [dateReglement, setDateReglement] = useState('');
  const [montantRegle, setMontantRegle] = useState('');
  const [modeReglement, setModeReglement] = useState('virement');

  useEffect(() => {
    if (!isOpen || !invoice) return;
    setDateReglement(new Date().toISOString().split('T')[0]);
    setMontantRegle(invoice.montant?.toString() || '');
    setModeReglement('virement');
  }, [isOpen, invoice]);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!invoice || !montantRegle) return;

    onConfirm(invoice.id, {
      date_reglement: dateReglement,
      montant_regle: parseFloat(montantRegle),
      mode_reglement: modeReglement,
    });
  }

  if (!invoice) return null;

  const montant = invoice.montant || 0;
  const parsedMontant = parseFloat(montantRegle) || 0;
  const isPartial = parsedMontant > 0 && parsedMontant < montant;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Enregistrer un reglement"
      size="md"
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-4 space-y-1">
          <div className="flex items-center justify-between">
            <p className="font-semibold text-gray-900 dark:text-white">
              {invoice.clients.nom_entreprise}
            </p>
            <span className="text-lg font-bold text-gray-900 dark:text-white">
              {formatCurrency(montant)}
            </span>
          </div>
          {invoice.numero_facture && (
            <p className="text-sm text-gray-600 dark:text-gray-400">
              {invoice.numero_facture}
            </p>
          )}
        </div>

        <Input
          label="Date de reglement"
          type="date"
          value={dateReglement}
          onChange={(e) => setDateReglement(e.target.value)}
          required
        />

        <Input
          label="Montant regle (EUR)"
          type="number"
          value={montantRegle}
          onChange={(e) => setMontantRegle(e.target.value)}
          min="0"
          step="0.01"
          required
        />

        {isPartial && (
          <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800">
            <span className="text-xs text-amber-700 dark:text-amber-300">
              Reglement partiel : {formatCurrency(parsedMontant)} sur {formatCurrency(montant)}
              {' '}({Math.round((parsedMontant / montant) * 100)}%)
            </span>
          </div>
        )}

        <Select
          label="Mode de reglement"
          value={modeReglement}
          onChange={(e) => setModeReglement(e.target.value)}
        >
          {MODE_OPTIONS.map((m) => (
            <option key={m.value} value={m.value}>
              {m.label}
            </option>
          ))}
        </Select>

        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            Annuler
          </Button>
          <Button type="submit" disabled={saving || !montantRegle || !dateReglement}>
            {saving ? 'Enregistrement...' : 'Enregistrer le reglement'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
