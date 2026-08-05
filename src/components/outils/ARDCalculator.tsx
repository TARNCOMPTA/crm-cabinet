import { useState, useMemo } from 'react';
import { Card, CardContent } from '../ui/Card';
import { Input } from '../ui/Input';
import { Button } from '../ui/Button';
import {
  RotateCcw,
  Info,
  Calculator,
  ArrowRight,
  CheckCircle,
  AlertTriangle,
  XCircle,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import { parseNumber, formatCurrency, computeARD } from '../../lib/ardUtils';

export function ARDCalculator() {
  const [ca, setCa] = useState('');
  const [chargesTotales, setChargesTotales] = useState('');

  const [fraisCompta, setFraisCompta] = useState('');
  const [adhesionCGA, setAdhesionCGA] = useState('');
  const [cfe, setCfe] = useState('');
  const [autresCharges, setAutresCharges] = useState('');

  const [amortImmeuble, setAmortImmeuble] = useState('');
  const [amortMobilier, setAmortMobilier] = useState('');
  const [amortDerogatoires, setAmortDerogatoires] = useState('');

  const [amortReintegres, setAmortReintegres] = useState('');

  const [showChargesDetail, setShowChargesDetail] = useState(true);
  const [showAmortDetail, setShowAmortDetail] = useState(true);

  const hasInput =
    ca ||
    chargesTotales ||
    fraisCompta ||
    adhesionCGA ||
    cfe ||
    autresCharges ||
    amortImmeuble ||
    amortMobilier ||
    amortDerogatoires;

  const totalChargesNonAfferentes = useMemo(() => {
    return (
      parseNumber(fraisCompta) +
      parseNumber(adhesionCGA) +
      parseNumber(cfe) +
      parseNumber(autresCharges)
    );
  }, [fraisCompta, adhesionCGA, cfe, autresCharges]);

  const totalAmortissements = useMemo(() => {
    return (
      parseNumber(amortImmeuble) +
      parseNumber(amortMobilier) +
      parseNumber(amortDerogatoires)
    );
  }, [amortImmeuble, amortMobilier, amortDerogatoires]);

  const results = useMemo(() => {
    const a1 = parseNumber(ca);
    const aa1 = parseNumber(chargesTotales);
    const a4 = totalAmortissements;

    if (!a1 && !aa1 && !a4) return null;

    return computeARD({
      ca: a1,
      charges_totales: aa1,
      frais_compta: parseNumber(fraisCompta),
      adhesion_cga: parseNumber(adhesionCGA),
      cfe: parseNumber(cfe),
      autres_charges: parseNumber(autresCharges),
      amort_immeuble: parseNumber(amortImmeuble),
      amort_mobilier: parseNumber(amortMobilier),
      amort_derogatoires: parseNumber(amortDerogatoires),
      amort_reintegres: amortReintegres.trim() !== '' ? parseNumber(amortReintegres) : null,
    });
  }, [ca, chargesTotales, fraisCompta, adhesionCGA, cfe, autresCharges, amortImmeuble, amortMobilier, amortDerogatoires, amortReintegres]);

  const reset = () => {
    setCa('');
    setChargesTotales('');
    setFraisCompta('');
    setAdhesionCGA('');
    setCfe('');
    setAutresCharges('');
    setAmortImmeuble('');
    setAmortMobilier('');
    setAmortDerogatoires('');
    setAmortReintegres('');
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardContent className="py-6">
          <div className="mb-5">
            <h3 className="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-4 flex items-center gap-2">
              <span className="w-6 h-6 rounded-full bg-orange-100 dark:bg-orange-900/40 text-orange-700 dark:text-orange-400 flex items-center justify-center text-xs font-bold">
                1
              </span>
              Revenus de location meublee
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Input
                label="Chiffre d'affaires location meublee (A1)"
                type="text"
                inputMode="decimal"
                placeholder="0,00"
                value={ca}
                onChange={(e) => setCa(e.target.value)}
                icon={<span className="text-sm font-medium">EUR</span>}
                helperText="Loyers percus sur l'exercice"
              />
            </div>
          </div>

          <div className="border-t border-gray-200 dark:border-gray-800 pt-5 mb-5">
            <h3 className="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-4 flex items-center gap-2">
              <span className="w-6 h-6 rounded-full bg-orange-100 dark:bg-orange-900/40 text-orange-700 dark:text-orange-400 flex items-center justify-center text-xs font-bold">
                2
              </span>
              Charges de l'exercice
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Input
                label="Charges totales hors amortissements (Aa1)"
                type="text"
                inputMode="decimal"
                placeholder="0,00"
                value={chargesTotales}
                onChange={(e) => setChargesTotales(e.target.value)}
                icon={<span className="text-sm font-medium">EUR</span>}
                helperText="Total liasse 2033B hors amortissements"
              />
            </div>
          </div>

          <div className="border-t border-gray-200 dark:border-gray-800 pt-5 mb-5">
            <button
              onClick={() => setShowChargesDetail(!showChargesDetail)}
              className="flex items-center gap-2 text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-4 hover:text-gray-700 dark:hover:text-gray-300 transition-colors"
            >
              <span className="w-6 h-6 rounded-full bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-400 flex items-center justify-center text-xs font-bold">
                3
              </span>
              Charges non afferentes aux biens loues (AA2)
              {showChargesDetail ? (
                <ChevronUp className="w-4 h-4" />
              ) : (
                <ChevronDown className="w-4 h-4" />
              )}
            </button>

            {showChargesDetail && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Input
                  label="Frais de comptabilite"
                  type="text"
                  inputMode="decimal"
                  placeholder="0,00"
                  value={fraisCompta}
                  onChange={(e) => setFraisCompta(e.target.value)}
                  icon={<span className="text-sm font-medium">EUR</span>}
                />
                <Input
                  label="Adhesion CGA / AGA"
                  type="text"
                  inputMode="decimal"
                  placeholder="0,00"
                  value={adhesionCGA}
                  onChange={(e) => setAdhesionCGA(e.target.value)}
                  icon={<span className="text-sm font-medium">EUR</span>}
                />
                <Input
                  label="CFE"
                  type="text"
                  inputMode="decimal"
                  placeholder="0,00"
                  value={cfe}
                  onChange={(e) => setCfe(e.target.value)}
                  icon={<span className="text-sm font-medium">EUR</span>}
                />
                <Input
                  label="Autres charges generales"
                  type="text"
                  inputMode="decimal"
                  placeholder="0,00"
                  value={autresCharges}
                  onChange={(e) => setAutresCharges(e.target.value)}
                  icon={<span className="text-sm font-medium">EUR</span>}
                  helperText="Carburant, voyages, documentation..."
                />
              </div>
            )}

            <div className="mt-3 flex items-center gap-2 px-3 py-2 rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900">
              <span className="text-sm font-medium text-amber-800 dark:text-amber-300">
                Total AA2 :
              </span>
              <span className="text-sm font-bold text-amber-900 dark:text-amber-200 font-mono">
                {formatCurrency(totalChargesNonAfferentes)}
              </span>
            </div>
          </div>

          <div className="border-t border-gray-200 dark:border-gray-800 pt-5 mb-5">
            <button
              onClick={() => setShowAmortDetail(!showAmortDetail)}
              className="flex items-center gap-2 text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-4 hover:text-gray-700 dark:hover:text-gray-300 transition-colors"
            >
              <span className="w-6 h-6 rounded-full bg-orange-100 dark:bg-orange-900/40 text-orange-700 dark:text-orange-400 flex items-center justify-center text-xs font-bold">
                4
              </span>
              Amortissements pratiques (A4)
              {showAmortDetail ? (
                <ChevronUp className="w-4 h-4" />
              ) : (
                <ChevronDown className="w-4 h-4" />
              )}
            </button>

            {showAmortDetail && (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <Input
                  label="Amortissement immeuble"
                  type="text"
                  inputMode="decimal"
                  placeholder="0,00"
                  value={amortImmeuble}
                  onChange={(e) => setAmortImmeuble(e.target.value)}
                  icon={<span className="text-sm font-medium">EUR</span>}
                />
                <Input
                  label="Amortissement mobilier"
                  type="text"
                  inputMode="decimal"
                  placeholder="0,00"
                  value={amortMobilier}
                  onChange={(e) => setAmortMobilier(e.target.value)}
                  icon={<span className="text-sm font-medium">EUR</span>}
                />
                <Input
                  label="Amortissements derogatoires"
                  type="text"
                  inputMode="decimal"
                  placeholder="0,00"
                  value={amortDerogatoires}
                  onChange={(e) => setAmortDerogatoires(e.target.value)}
                  icon={<span className="text-sm font-medium">EUR</span>}
                />
              </div>
            )}

            <div className="mt-3 flex items-center gap-2 px-3 py-2 rounded-lg bg-orange-50 dark:bg-orange-950/30 border border-orange-200 dark:border-orange-900">
              <span className="text-sm font-medium text-orange-800 dark:text-orange-300">
                Total A4 :
              </span>
              <span className="text-sm font-bold text-orange-900 dark:text-orange-200 font-mono">
                {formatCurrency(totalAmortissements)}
              </span>
            </div>
          </div>

          <div className="border-t border-gray-200 dark:border-gray-800 pt-5">
            <h3 className="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-4 flex items-center gap-2">
              <span className="w-6 h-6 rounded-full bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-300 flex items-center justify-center text-xs font-bold">
                ?
              </span>
              Controle (optionnel)
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Input
                label="Amortissements deja reintegres sur 2033B (A6)"
                type="text"
                inputMode="decimal"
                placeholder="0,00"
                value={amortReintegres}
                onChange={(e) => setAmortReintegres(e.target.value)}
                icon={<span className="text-sm font-medium">EUR</span>}
                helperText="Laisser vide si non applicable"
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
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <Card className="border-teal-200 dark:border-teal-800 overflow-hidden">
              <div className="h-1 bg-teal-500" />
              <CardContent className="py-5">
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-10 h-10 rounded-lg bg-teal-50 dark:bg-teal-950 flex items-center justify-center">
                    <CheckCircle className="w-5 h-5 text-teal-600 dark:text-teal-400" />
                  </div>
                  <p className="text-sm font-medium text-gray-600 dark:text-gray-400">
                    Plafond deductible (A3)
                  </p>
                </div>
                <p className="text-2xl font-bold text-teal-700 dark:text-teal-400">
                  {formatCurrency(results.a3)}
                </p>
                {results.a3Raw < 0 && (
                  <p className="text-xs text-amber-600 dark:text-amber-400 mt-1">
                    {"Plafond ramene a 0 (charges > loyers)"}
                  </p>
                )}
              </CardContent>
            </Card>

            <Card className="border-orange-200 dark:border-orange-800 overflow-hidden">
              <div className="h-1 bg-orange-500" />
              <CardContent className="py-5">
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-10 h-10 rounded-lg bg-orange-50 dark:bg-orange-950 flex items-center justify-center">
                    <Calculator className="w-5 h-5 text-orange-600 dark:text-orange-400" />
                  </div>
                  <p className="text-sm font-medium text-gray-600 dark:text-gray-400">
                    Amortissements pratiques (A4)
                  </p>
                </div>
                <p className="text-2xl font-bold text-orange-700 dark:text-orange-400">
                  {formatCurrency(results.a4)}
                </p>
              </CardContent>
            </Card>

            <Card
              className={`overflow-hidden ${
                results.a5 > 0
                  ? 'border-red-200 dark:border-red-800'
                  : 'border-emerald-200 dark:border-emerald-800'
              }`}
            >
              <div className={`h-1 ${results.a5 > 0 ? 'bg-red-500' : 'bg-emerald-500'}`} />
              <CardContent className="py-5">
                <div className="flex items-center gap-3 mb-3">
                  <div
                    className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                      results.a5 > 0
                        ? 'bg-red-50 dark:bg-red-950'
                        : 'bg-emerald-50 dark:bg-emerald-950'
                    }`}
                  >
                    {results.a5 > 0 ? (
                      <AlertTriangle className="w-5 h-5 text-red-600 dark:text-red-400" />
                    ) : (
                      <CheckCircle className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
                    )}
                  </div>
                  <p className="text-sm font-medium text-gray-600 dark:text-gray-400">
                    Reputes differes (A5)
                  </p>
                </div>
                <p
                  className={`text-2xl font-bold ${
                    results.a5 > 0
                      ? 'text-red-700 dark:text-red-400'
                      : 'text-emerald-700 dark:text-emerald-400'
                  }`}
                >
                  {formatCurrency(results.a5)}
                </p>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                  {results.a5 > 0
                    ? 'A reintegrer fiscalement'
                    : 'Tout est deductible'}
                </p>
              </CardContent>
            </Card>
          </div>

          {results.hasA6 && (
            <Card
              className={`overflow-hidden ${
                results.regularisationStatus === 'ok'
                  ? 'border-emerald-200 dark:border-emerald-800'
                  : results.regularisationStatus === 'insuffisant'
                    ? 'border-amber-200 dark:border-amber-800'
                    : 'border-red-200 dark:border-red-800'
              }`}
            >
              <div
                className={`h-1 ${
                  results.regularisationStatus === 'ok'
                    ? 'bg-emerald-500'
                    : results.regularisationStatus === 'insuffisant'
                      ? 'bg-amber-500'
                      : 'bg-red-500'
                }`}
              />
              <CardContent className="py-5">
                <div className="flex items-center gap-4">
                  <div
                    className={`w-12 h-12 rounded-lg flex items-center justify-center flex-shrink-0 ${
                      results.regularisationStatus === 'ok'
                        ? 'bg-emerald-50 dark:bg-emerald-950'
                        : results.regularisationStatus === 'insuffisant'
                          ? 'bg-amber-50 dark:bg-amber-950'
                          : 'bg-red-50 dark:bg-red-950'
                    }`}
                  >
                    {results.regularisationStatus === 'ok' ? (
                      <CheckCircle className="w-6 h-6 text-emerald-600 dark:text-emerald-400" />
                    ) : results.regularisationStatus === 'insuffisant' ? (
                      <AlertTriangle className="w-6 h-6 text-amber-600 dark:text-amber-400" />
                    ) : (
                      <XCircle className="w-6 h-6 text-red-600 dark:text-red-400" />
                    )}
                  </div>
                  <div className="flex-1">
                    <p className="text-sm font-medium text-gray-600 dark:text-gray-400 mb-1">
                      Controle de regularisation (A5 - A6)
                    </p>
                    <p
                      className={`text-xl font-bold ${
                        results.regularisationStatus === 'ok'
                          ? 'text-emerald-700 dark:text-emerald-400'
                          : results.regularisationStatus === 'insuffisant'
                            ? 'text-amber-700 dark:text-amber-400'
                            : 'text-red-700 dark:text-red-400'
                      }`}
                    >
                      {formatCurrency(results.regularisation)}
                    </p>
                    <p
                      className={`text-sm mt-1 ${
                        results.regularisationStatus === 'ok'
                          ? 'text-emerald-600 dark:text-emerald-400'
                          : results.regularisationStatus === 'insuffisant'
                            ? 'text-amber-600 dark:text-amber-400'
                            : 'text-red-600 dark:text-red-400'
                      }`}
                    >
                      {results.regularisationStatus === 'ok'
                        ? 'Reintegration correcte'
                        : results.regularisationStatus === 'insuffisant'
                          ? 'Reintegration insuffisante - il manque ' +
                            formatCurrency(results.regularisation)
                          : 'Trop reintegre de ' +
                            formatCurrency(Math.abs(results.regularisation))}
                    </p>
                  </div>
                  <div className="text-right text-sm text-gray-500 dark:text-gray-400 flex-shrink-0">
                    <p>
                      A5 = {formatCurrency(results.a5)}
                    </p>
                    <p>
                      A6 = {formatCurrency(results.a6)}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          <Card>
            <CardContent className="py-0">
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
                      Chiffre d'affaires location meublee (A1)
                    </td>
                    <td className="py-3 text-right font-medium text-gray-900 dark:text-white">
                      {formatCurrency(results.a1)}
                    </td>
                  </tr>

                  <tr className="text-sm">
                    <td className="py-3 text-gray-600 dark:text-gray-400">
                      Charges totales hors amortissements (Aa1)
                    </td>
                    <td className="py-3 text-right font-medium text-gray-900 dark:text-white">
                      {formatCurrency(results.aa1)}
                    </td>
                  </tr>

                  <tr className="text-sm">
                    <td className="py-3 text-gray-600 dark:text-gray-400 flex items-center gap-2">
                      <ArrowRight className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
                      Charges non afferentes aux biens loues (AA2)
                    </td>
                    <td className="py-3 text-right font-medium text-gray-900 dark:text-white">
                      {formatCurrency(results.aa2)}
                    </td>
                  </tr>

                  <tr className="text-sm">
                    <td className="py-3 text-gray-600 dark:text-gray-400 flex items-center gap-2">
                      <ArrowRight className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
                      = Charges afferentes aux biens loues (A2 = Aa1 - AA2)
                    </td>
                    <td className="py-3 text-right font-medium text-gray-900 dark:text-white">
                      {formatCurrency(results.a2)}
                    </td>
                  </tr>

                  <tr className="text-sm font-semibold bg-teal-50/50 dark:bg-teal-950/20">
                    <td className="py-3 px-2 rounded-l-lg text-teal-800 dark:text-teal-300">
                      = Plafond amortissements deductibles (A3 = A1 - A2)
                      {results.a3Raw < 0 && (
                        <span className="font-normal text-xs ml-2 text-amber-600 dark:text-amber-400">
                          ramene a 0
                        </span>
                      )}
                    </td>
                    <td className="py-3 px-2 rounded-r-lg text-right text-teal-700 dark:text-teal-400">
                      {formatCurrency(results.a3)}
                    </td>
                  </tr>

                  <tr className="text-sm border-t-2 border-gray-200 dark:border-gray-700">
                    <td className="py-3 text-gray-600 dark:text-gray-400">
                      Amortissements pratiques (A4)
                    </td>
                    <td className="py-3 text-right font-medium text-gray-900 dark:text-white">
                      {formatCurrency(results.a4)}
                    </td>
                  </tr>

                  <tr className="text-sm">
                    <td className="py-3 text-gray-600 dark:text-gray-400 flex items-center gap-2">
                      <ArrowRight className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
                      Amortissements deductibles = min(A4, A3)
                    </td>
                    <td className="py-3 text-right font-medium text-emerald-700 dark:text-emerald-400">
                      {formatCurrency(results.amortDeductibles)}
                    </td>
                  </tr>

                  <tr
                    className={`text-sm font-semibold ${
                      results.a5 > 0
                        ? 'bg-red-50/50 dark:bg-red-950/20'
                        : 'bg-emerald-50/50 dark:bg-emerald-950/20'
                    }`}
                  >
                    <td
                      className={`py-3 px-2 rounded-l-lg ${
                        results.a5 > 0
                          ? 'text-red-800 dark:text-red-300'
                          : 'text-emerald-800 dark:text-emerald-300'
                      }`}
                    >
                      = Amortissements reputes differes (A5 = A4 - A3)
                    </td>
                    <td
                      className={`py-3 px-2 rounded-r-lg text-right ${
                        results.a5 > 0
                          ? 'text-red-700 dark:text-red-400'
                          : 'text-emerald-700 dark:text-emerald-400'
                      }`}
                    >
                      {formatCurrency(results.a5)}
                    </td>
                  </tr>

                  {results.hasA6 && (
                    <>
                      <tr className="text-sm border-t-2 border-gray-200 dark:border-gray-700">
                        <td className="py-3 text-gray-600 dark:text-gray-400">
                          Amortissements reintegres sur 2033B (A6)
                        </td>
                        <td className="py-3 text-right font-medium text-gray-900 dark:text-white">
                          {formatCurrency(results.a6)}
                        </td>
                      </tr>
                      <tr
                        className={`text-sm font-semibold ${
                          results.regularisationStatus === 'ok'
                            ? 'bg-emerald-50/50 dark:bg-emerald-950/20'
                            : results.regularisationStatus === 'insuffisant'
                              ? 'bg-amber-50/50 dark:bg-amber-950/20'
                              : 'bg-red-50/50 dark:bg-red-950/20'
                        }`}
                      >
                        <td
                          className={`py-3 px-2 rounded-l-lg ${
                            results.regularisationStatus === 'ok'
                              ? 'text-emerald-800 dark:text-emerald-300'
                              : results.regularisationStatus === 'insuffisant'
                                ? 'text-amber-800 dark:text-amber-300'
                                : 'text-red-800 dark:text-red-300'
                          }`}
                        >
                          = Ecart de regularisation (A5 - A6)
                        </td>
                        <td
                          className={`py-3 px-2 rounded-r-lg text-right ${
                            results.regularisationStatus === 'ok'
                              ? 'text-emerald-700 dark:text-emerald-400'
                              : results.regularisationStatus === 'insuffisant'
                                ? 'text-amber-700 dark:text-amber-400'
                                : 'text-red-700 dark:text-red-400'
                          }`}
                        >
                          {formatCurrency(results.regularisation)}
                        </td>
                      </tr>
                    </>
                  )}
                </tbody>
              </table>
            </CardContent>
          </Card>

          <div className="flex items-start gap-2 p-4 rounded-lg bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-900">
            <Info className="w-4 h-4 text-blue-500 mt-0.5 flex-shrink-0" />
            <div className="text-sm text-blue-700 dark:text-blue-300 space-y-1">
              <p className="font-medium">Formules appliquees (LMNP reel BIC) :</p>
              <p>A2 = Aa1 - AA2 (charges afferentes aux biens loues)</p>
              <p>A3 = max(0, A1 - A2) (plafond d'amortissements deductibles)</p>
              <p>A5 = max(0, A4 - A3) (amortissements reputes differes)</p>
              <p className="text-xs text-blue-600 dark:text-blue-400 mt-2">
                L'amortissement ne peut pas creer de deficit fiscal en LMNP. L'excedent est reporte sans limitation de duree.
              </p>
            </div>
          </div>
        </>
      )}

      {!hasInput && (
        <Card>
          <CardContent className="py-16 text-center">
            <div className="w-16 h-16 rounded-full bg-gray-100 dark:bg-gray-800 flex items-center justify-center mx-auto mb-4">
              <Calculator className="w-8 h-8 text-gray-400" />
            </div>
            <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-1">
              Calcul des Amortissements Reputes Differes
            </h3>
            <p className="text-sm text-gray-500 dark:text-gray-400 max-w-md mx-auto">
              Renseignez les donnees de l'exercice pour determiner le plafond d'amortissements deductibles et le montant a reintegrer fiscalement pour un loueur en meuble au regime reel BIC.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
