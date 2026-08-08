import { useState, useMemo } from 'react';
import { Card, CardContent } from '../ui/Card';
import { Input } from '../ui/Input';
import { Button } from '../ui/Button';
import { RotateCcw, Info, TrendingDown, Calculator, ArrowRight } from 'lucide-react';

function parseNumber(value: string): number {
  const cleaned = value.replace(/\s/g, '').replace(',', '.');
  const num = parseFloat(cleaned);
  return isNaN(num) ? 0 : num;
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(value);
}

export function CSGCalculator() {
  const [regulCsgN1, setRegulCsgN1] = useState('');
  const [totalCsgN1, setTotalCsgN1] = useState('');
  const [totalDedN1, setTotalDedN1] = useState('');
  const [totalCsgN, setTotalCsgN] = useState('');
  const [totalDedN, setTotalDedN] = useState('');

  const hasInput = regulCsgN1 || totalCsgN1 || totalDedN1 || totalCsgN || totalDedN;

  const results = useMemo(() => {
    const regul = parseNumber(regulCsgN1);
    const csgN1 = parseNumber(totalCsgN1);
    const dedN1 = parseNumber(totalDedN1);
    const csgN = parseNumber(totalCsgN);
    const dedN = parseNumber(totalDedN);

    if (!csgN && !regul && !dedN) return null;

    const ratioN1 = csgN1 !== 0 ? dedN1 / csgN1 : 0;
    const regulDedPart = ratioN1 * regul;
    const csgDedTotal = regulDedPart + dedN;
    const csgNonDed = csgN + regul - csgDedTotal;

    return {
      regul,
      csgN1,
      dedN1,
      csgN,
      dedN,
      ratioN1,
      regulDedPart,
      csgDedTotal,
      csgNonDed,
    };
  }, [regulCsgN1, totalCsgN1, totalDedN1, totalCsgN, totalDedN]);

  const reset = () => {
    setRegulCsgN1('');
    setTotalCsgN1('');
    setTotalDedN1('');
    setTotalCsgN('');
    setTotalDedN('');
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardContent className="py-6">
          <div className="mb-5">
            <h3 className="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-4 flex items-center gap-2">
              <span className="w-6 h-6 rounded-full bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-400 flex items-center justify-center text-xs font-bold">
                N-1
              </span>
              Annee precedente
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Input
                label="Regul CSG N-1"
                type="text"
                inputMode="decimal"
                placeholder="0,00"
                value={regulCsgN1}
                onChange={(e) => setRegulCsgN1(e.target.value)}
                icon={<span className="text-sm font-medium">EUR</span>}
                helperText="Regularisation CSG"
              />
              <Input
                label="Total CSG N-1"
                type="text"
                inputMode="decimal"
                placeholder="0,00"
                value={totalCsgN1}
                onChange={(e) => setTotalCsgN1(e.target.value)}
                icon={<span className="text-sm font-medium">EUR</span>}
                helperText="CSG totale"
              />
              <Input
                label="Total DED N-1"
                type="text"
                inputMode="decimal"
                placeholder="0,00"
                value={totalDedN1}
                onChange={(e) => setTotalDedN1(e.target.value)}
                icon={<span className="text-sm font-medium">EUR</span>}
                helperText="CSG deductible"
              />
            </div>
          </div>

          <div className="border-t border-gray-200 dark:border-gray-800 pt-5">
            <h3 className="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-4 flex items-center gap-2">
              <span className="w-6 h-6 rounded-full bg-teal-100 dark:bg-teal-900/40 text-teal-700 dark:text-teal-400 flex items-center justify-center text-xs font-bold">
                N
              </span>
              Annee en cours
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Input
                label="Total CSG N"
                type="text"
                inputMode="decimal"
                placeholder="0,00"
                value={totalCsgN}
                onChange={(e) => setTotalCsgN(e.target.value)}
                icon={<span className="text-sm font-medium">EUR</span>}
                helperText="CSG totale"
              />
              <Input
                label="Total DED N"
                type="text"
                inputMode="decimal"
                placeholder="0,00"
                value={totalDedN}
                onChange={(e) => setTotalDedN(e.target.value)}
                icon={<span className="text-sm font-medium">EUR</span>}
                helperText="CSG deductible"
              />
            </div>
          </div>

          <div className="mt-5 flex justify-end">
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
            <Card className="border-teal-200 dark:border-teal-800 overflow-hidden">
              <div className="h-1 bg-teal-500" />
              <CardContent className="py-5">
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-10 h-10 rounded-lg bg-teal-50 dark:bg-teal-950 flex items-center justify-center">
                    <TrendingDown className="w-5 h-5 text-teal-600 dark:text-teal-400" />
                  </div>
                  <p className="text-sm font-medium text-gray-600 dark:text-gray-400">
                    CSG Deductible Totale
                  </p>
                </div>
                <p className="text-2xl font-bold text-teal-700 dark:text-teal-400">
                  {formatCurrency(results.csgDedTotal)}
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
                    CSG Non Deductible
                  </p>
                </div>
                <p className="text-2xl font-bold text-amber-700 dark:text-amber-400">
                  {formatCurrency(results.csgNonDed)}
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
                      Ratio N-1 (Total DED N-1 / Total CSG N-1)
                    </td>
                    <td className="py-3 text-right font-medium text-gray-900 dark:text-white font-mono">
                      {results.csgN1 !== 0
                        ? (results.ratioN1 * 100).toFixed(4) + ' %'
                        : '—'}
                    </td>
                  </tr>
                  <tr className="text-sm">
                    <td className="py-3 text-gray-600 dark:text-gray-400 flex items-center gap-2">
                      <ArrowRight className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
                      Part deductible de la regul (Ratio x Regul N-1)
                    </td>
                    <td className="py-3 text-right font-medium text-gray-900 dark:text-white">
                      {formatCurrency(results.regulDedPart)}
                    </td>
                  </tr>
                  <tr className="text-sm">
                    <td className="py-3 text-gray-600 dark:text-gray-400 flex items-center gap-2">
                      <ArrowRight className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
                      + Total DED N
                    </td>
                    <td className="py-3 text-right font-medium text-gray-900 dark:text-white">
                      {formatCurrency(results.dedN)}
                    </td>
                  </tr>
                  <tr className="text-sm font-semibold bg-teal-50/50 dark:bg-teal-950/20">
                    <td className="py-3 px-2 rounded-l-lg text-teal-800 dark:text-teal-300">
                      = CSG Deductible Totale
                    </td>
                    <td className="py-3 px-2 rounded-r-lg text-right text-teal-700 dark:text-teal-400">
                      {formatCurrency(results.csgDedTotal)}
                    </td>
                  </tr>
                  <tr className="text-sm border-t-2 border-gray-200 dark:border-gray-700">
                    <td className="py-3 text-gray-600 dark:text-gray-400">
                      Total CSG N
                    </td>
                    <td className="py-3 text-right font-medium text-gray-900 dark:text-white">
                      {formatCurrency(results.csgN)}
                    </td>
                  </tr>
                  <tr className="text-sm">
                    <td className="py-3 text-gray-600 dark:text-gray-400 flex items-center gap-2">
                      <ArrowRight className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
                      + Regul CSG N-1
                    </td>
                    <td className="py-3 text-right font-medium text-gray-900 dark:text-white">
                      {formatCurrency(results.regul)}
                    </td>
                  </tr>
                  <tr className="text-sm">
                    <td className="py-3 text-gray-600 dark:text-gray-400 flex items-center gap-2">
                      <ArrowRight className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
                      - CSG Deductible Totale
                    </td>
                    <td className="py-3 text-right font-medium text-gray-900 dark:text-white">
                      {formatCurrency(results.csgDedTotal)}
                    </td>
                  </tr>
                  <tr className="text-sm font-semibold bg-amber-50/50 dark:bg-amber-950/20">
                    <td className="py-3 px-2 rounded-l-lg text-amber-800 dark:text-amber-300">
                      = CSG Non Deductible
                    </td>
                    <td className="py-3 px-2 rounded-r-lg text-right text-amber-700 dark:text-amber-400">
                      {formatCurrency(results.csgNonDed)}
                    </td>
                  </tr>
                </tbody>
              </table>
            </CardContent>
          </Card>

          <div className="flex items-start gap-2 p-4 rounded-lg bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-900">
            <Info className="w-4 h-4 text-blue-500 mt-0.5 flex-shrink-0" />
            <div className="text-sm text-blue-700 dark:text-blue-300 space-y-1">
              <p className="font-medium">Formules appliquees :</p>
              <p>CSG Ded. Totale = (Total DED N-1 / Total CSG N-1) x Regul N-1 + Total DED N</p>
              <p>CSG Non Ded. = Total CSG N + Regul CSG N-1 - CSG Ded. Totale</p>
            </div>
          </div>
        </>
      )}

      {!hasInput && (
        <Card>
          <CardContent className="py-16 text-center">
            <div className="w-16 h-16 rounded-full bg-gray-100 dark:bg-gray-800 flex items-center justify-center mx-auto mb-4">
              <TrendingDown className="w-8 h-8 text-gray-400" />
            </div>
            <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-1">
              Calcul CSG Deductible / Non Deductible
            </h3>
            <p className="text-sm text-gray-500 dark:text-gray-400 max-w-md mx-auto">
              Renseignez les montants de CSG de l'annee N-1 et de l'annee N pour calculer la repartition entre CSG deductible et CSG non deductible, en tenant compte de la regularisation.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
