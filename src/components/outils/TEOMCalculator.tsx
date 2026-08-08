import { useState, useMemo } from 'react';
import { Card, CardContent } from '../ui/Card';
import { Input } from '../ui/Input';
import { Button } from '../ui/Button';
import { RotateCcw, Info, Landmark, Calculator, ArrowRight } from 'lucide-react';

function parseNumber(value: string): number {
  const cleaned = value.replace(/\s/g, '').replace(',', '.');
  const num = parseFloat(cleaned);
  return isNaN(num) ? 0 : num;
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(value);
}

export function TEOMCalculator() {
  const [taxeFonciereTotale, setTaxeFonciereTotale] = useState('');
  const [teom, setTeom] = useState('');
  const [fraisGestion, setFraisGestion] = useState('');

  const hasInput = taxeFonciereTotale || teom || fraisGestion;

  const results = useMemo(() => {
    const tfTotal = parseNumber(taxeFonciereTotale);
    const teomVal = parseNumber(teom);
    const frais = parseNumber(fraisGestion);

    if (!tfTotal || tfTotal <= 0) return null;

    const prorataFraisGestion = tfTotal > 0 ? (teomVal * frais) / tfTotal : 0;
    const montantARetrancher = teomVal + prorataFraisGestion;
    const taxeDeductible = tfTotal - montantARetrancher;

    return {
      tfTotal,
      teomVal,
      frais,
      prorataFraisGestion,
      montantARetrancher,
      taxeDeductible,
    };
  }, [taxeFonciereTotale, teom, fraisGestion]);

  const reset = () => {
    setTaxeFonciereTotale('');
    setTeom('');
    setFraisGestion('');
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardContent className="py-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <Input
              label="Taxe fonciere totale"
              type="text"
              inputMode="decimal"
              placeholder="0,00"
              value={taxeFonciereTotale}
              onChange={(e) => setTaxeFonciereTotale(e.target.value)}
              icon={<span className="text-sm font-medium">EUR</span>}
              helperText="Montant total de l'avis d'imposition"
            />
            <Input
              label="TEOM"
              type="text"
              inputMode="decimal"
              placeholder="0,00"
              value={teom}
              onChange={(e) => setTeom(e.target.value)}
              icon={<span className="text-sm font-medium">EUR</span>}
              helperText="Taxe d'enlevement des ordures menageres"
            />
            <Input
              label="Frais de gestion totaux"
              type="text"
              inputMode="decimal"
              placeholder="0,00"
              value={fraisGestion}
              onChange={(e) => setFraisGestion(e.target.value)}
              icon={<span className="text-sm font-medium">EUR</span>}
              helperText="Montant total des frais de gestion"
            />
          </div>
          <div className="mt-4 flex justify-end">
            <Button variant="outline" size="sm" onClick={reset}>
              <RotateCcw className="w-4 h-4 mr-2" />
              Reinitialiser
            </Button>
          </div>
        </CardContent>
      </Card>

      {results && (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Card className="border-emerald-200 dark:border-emerald-800 overflow-hidden">
              <div className="h-1 bg-emerald-500" />
              <CardContent className="py-5">
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-10 h-10 rounded-lg bg-emerald-50 dark:bg-emerald-950 flex items-center justify-center">
                    <Landmark className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
                  </div>
                  <p className="text-sm font-medium text-gray-600 dark:text-gray-400">
                    Taxe fonciere deductible
                  </p>
                </div>
                <p className="text-2xl font-bold text-emerald-700 dark:text-emerald-400">
                  {formatCurrency(results.taxeDeductible)}
                </p>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                  Montant annuel a reporter sur la declaration
                </p>
              </CardContent>
            </Card>

            <Card className="border-amber-200 dark:border-amber-800 overflow-hidden">
              <div className="h-1 bg-amber-500" />
              <CardContent className="py-5">
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-10 h-10 rounded-lg bg-amber-50 dark:bg-amber-950 flex items-center justify-center">
                    <Calculator className="w-5 h-5 text-amber-600 dark:text-amber-400" />
                  </div>
                  <p className="text-sm font-medium text-gray-600 dark:text-gray-400">
                    Montant non deductible
                  </p>
                </div>
                <p className="text-2xl font-bold text-amber-700 dark:text-amber-400">
                  {formatCurrency(results.montantARetrancher)}
                </p>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                  TEOM + prorata frais de gestion
                </p>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardContent className="py-0 overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-gray-200 dark:border-gray-800">
                    <th className="text-left py-3 text-sm font-semibold text-gray-700 dark:text-gray-300">
                      Etape du calcul
                    </th>
                    <th className="text-right py-3 text-sm font-semibold text-gray-700 dark:text-gray-300">
                      Valeur
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                  <tr className="text-sm">
                    <td className="py-3 text-gray-600 dark:text-gray-400">
                      Taxe fonciere totale
                    </td>
                    <td className="py-3 text-right font-medium text-gray-900 dark:text-white">
                      {formatCurrency(results.tfTotal)}
                    </td>
                  </tr>
                  <tr className="text-sm">
                    <td className="py-3 text-gray-600 dark:text-gray-400">
                      TEOM
                    </td>
                    <td className="py-3 text-right font-medium text-gray-900 dark:text-white">
                      {formatCurrency(results.teomVal)}
                    </td>
                  </tr>
                  <tr className="text-sm">
                    <td className="py-3 text-gray-600 dark:text-gray-400">
                      Frais de gestion totaux
                    </td>
                    <td className="py-3 text-right font-medium text-gray-900 dark:text-white">
                      {formatCurrency(results.frais)}
                    </td>
                  </tr>
                  <tr className="text-sm">
                    <td className="py-3 text-gray-600 dark:text-gray-400 flex items-center gap-2">
                      <ArrowRight className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
                      Prorata frais de gestion (TEOM x Frais / Taxe totale)
                    </td>
                    <td className="py-3 text-right font-medium text-gray-900 dark:text-white">
                      {formatCurrency(results.prorataFraisGestion)}
                    </td>
                  </tr>
                  <tr className="text-sm font-semibold bg-amber-50/50 dark:bg-amber-950/20">
                    <td className="py-3 px-2 rounded-l-lg text-amber-800 dark:text-amber-300 flex items-center gap-2">
                      <ArrowRight className="w-3.5 h-3.5 flex-shrink-0" />
                      Total a retrancher (TEOM + prorata)
                    </td>
                    <td className="py-3 px-2 rounded-r-lg text-right text-amber-700 dark:text-amber-400">
                      {formatCurrency(results.montantARetrancher)}
                    </td>
                  </tr>
                  <tr className="text-sm font-semibold border-t-2 border-gray-200 dark:border-gray-700 bg-emerald-50/50 dark:bg-emerald-950/20">
                    <td className="py-3 px-2 rounded-l-lg text-emerald-800 dark:text-emerald-300">
                      = Taxe fonciere deductible
                    </td>
                    <td className="py-3 px-2 rounded-r-lg text-right text-emerald-700 dark:text-emerald-400">
                      {formatCurrency(results.taxeDeductible)}
                    </td>
                  </tr>
                </tbody>
              </table>
            </CardContent>
          </Card>

          <div className="flex items-start gap-2 p-4 rounded-lg bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-900">
            <Info className="w-4 h-4 text-blue-500 mt-0.5 flex-shrink-0" />
            <div className="text-sm text-blue-700 dark:text-blue-300 space-y-1">
              <p className="font-medium">Formule appliquee :</p>
              <p>Taxe fonciere deductible = Taxe fonciere totale - TEOM - (TEOM x Frais de gestion / Taxe fonciere totale)</p>
              <p>La TEOM et sa part proportionnelle des frais de gestion doivent etre retranchees pour obtenir le montant deductible des revenus fonciers.</p>
            </div>
          </div>
        </>
      )}

      {!hasInput && (
        <Card>
          <CardContent className="py-16 text-center">
            <div className="w-16 h-16 rounded-full bg-gray-100 dark:bg-gray-800 flex items-center justify-center mx-auto mb-4">
              <Landmark className="w-8 h-8 text-gray-400" />
            </div>
            <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-1">
              Taxe Fonciere Deductible
            </h3>
            <p className="text-sm text-gray-500 dark:text-gray-400 max-w-md mx-auto">
              Renseignez les montants figurant sur votre avis de taxe fonciere pour calculer le montant deductible a reporter sur votre declaration de revenus fonciers.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
