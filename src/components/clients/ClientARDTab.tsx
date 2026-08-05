import { useState, useEffect, useMemo, useCallback } from 'react';
import { supabase } from '../../lib/supabase';
import { useToast } from '../../contexts/ToastContext';
import { Card, CardContent } from '../ui/Card';
import { Button } from '../ui/Button';
import { computeARDWithDeficits, formatCurrency, type ARDResults } from '../../lib/ardUtils';
import {
  Plus,
  Save,
  Calculator,
  CheckCircle,
  AlertTriangle,
  Info,
  Loader2,
} from 'lucide-react';

interface ClientARDTabProps {
  clientId: string;
}

interface ARDRow {
  id?: string;
  annee: number;
  ca: number;
  charges_totales: number;
  frais_compta: number;
  adhesion_cga: number;
  cfe: number;
  autres_charges: number;
  amort_immeuble: number;
  amort_mobilier: number;
  amort_derogatoires: number;
  amort_reintegres: number | null;
  deficit_anterieur: number | null;
}

const INPUT_FIELDS: { key: keyof Omit<ARDRow, 'id' | 'annee' | 'amort_reintegres'>; label: string; section: string }[] = [
  { key: 'ca', label: 'CA location meublee (A1)', section: 'revenus' },
  { key: 'charges_totales', label: 'Charges totales hors amort. (Aa1)', section: 'charges' },
  { key: 'frais_compta', label: 'Frais de comptabilite', section: 'aa2' },
  { key: 'adhesion_cga', label: 'Adhesion CGA / AGA', section: 'aa2' },
  { key: 'cfe', label: 'CFE', section: 'aa2' },
  { key: 'autres_charges', label: 'Autres charges generales', section: 'aa2' },
  { key: 'amort_immeuble', label: 'Amort. immeuble', section: 'a4' },
  { key: 'amort_mobilier', label: 'Amort. mobilier', section: 'a4' },
  { key: 'amort_derogatoires', label: 'Amort. derogatoires', section: 'a4' },
];

const SECTION_HEADERS: Record<string, string> = {
  revenus: 'Revenus de location meublee',
  charges: 'Charges de l\'exercice',
  aa2: 'Charges non afferentes (AA2)',
  a4: 'Amortissements pratiques (A4)',
};

function emptyRow(annee: number): ARDRow {
  return {
    annee,
    ca: 0,
    charges_totales: 0,
    frais_compta: 0,
    adhesion_cga: 0,
    cfe: 0,
    autres_charges: 0,
    amort_immeuble: 0,
    amort_mobilier: 0,
    amort_derogatoires: 0,
    amort_reintegres: null,
    deficit_anterieur: null,
  };
}

function CurrencyInput({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  const [focused, setFocused] = useState(false);
  const [raw, setRaw] = useState('');

  useEffect(() => {
    if (!focused) {
      setRaw(value === 0 ? '' : String(value));
    }
  }, [value, focused]);

  return (
    <input
      type="text"
      inputMode="decimal"
      className="w-full px-2 py-1.5 text-right text-sm font-mono border border-gray-200 dark:border-gray-700 rounded bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:border-teal-500 focus:ring-1 focus:ring-teal-500 outline-none transition-colors"
      value={focused ? raw : (value === 0 ? '' : new Intl.NumberFormat('fr-FR', { minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(value))}
      placeholder="0"
      onFocus={() => {
        setFocused(true);
        setRaw(value === 0 ? '' : String(value));
      }}
      onBlur={() => {
        setFocused(false);
        const cleaned = raw.replace(/\s/g, '').replace(',', '.');
        const num = parseFloat(cleaned);
        onChange(isNaN(num) ? 0 : num);
      }}
      onChange={(e) => setRaw(e.target.value)}
    />
  );
}

function NullableCurrencyInput({ value, onChange }: { value: number | null; onChange: (v: number | null) => void }) {
  const [focused, setFocused] = useState(false);
  const [raw, setRaw] = useState('');

  useEffect(() => {
    if (!focused) {
      setRaw(value === null ? '' : String(value));
    }
  }, [value, focused]);

  return (
    <input
      type="text"
      inputMode="decimal"
      className="w-full px-2 py-1.5 text-right text-sm font-mono border border-gray-200 dark:border-gray-700 rounded bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:border-teal-500 focus:ring-1 focus:ring-teal-500 outline-none transition-colors"
      value={focused ? raw : (value === null || value === 0 ? '' : new Intl.NumberFormat('fr-FR', { minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(value))}
      placeholder="-"
      onFocus={() => {
        setFocused(true);
        setRaw(value === null ? '' : String(value));
      }}
      onBlur={() => {
        setFocused(false);
        if (raw.trim() === '') {
          onChange(null);
        } else {
          const cleaned = raw.replace(/\s/g, '').replace(',', '.');
          const num = parseFloat(cleaned);
          onChange(isNaN(num) ? null : num);
        }
      }}
      onChange={(e) => setRaw(e.target.value)}
    />
  );
}

export function ClientARDTab({ clientId }: ClientARDTabProps) {
  const { showToast } = useToast();
  const [rows, setRows] = useState<ARDRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('client_ard_calculations')
        .select('*')
        .eq('client_id', clientId)
        .order('annee', { ascending: true });

      if (error) throw error;

      if (data && data.length > 0) {
        setRows(data.map((d: any) => ({
          id: d.id,
          annee: d.annee,
          ca: Number(d.ca) || 0,
          charges_totales: Number(d.charges_totales) || 0,
          frais_compta: Number(d.frais_compta) || 0,
          adhesion_cga: Number(d.adhesion_cga) || 0,
          cfe: Number(d.cfe) || 0,
          autres_charges: Number(d.autres_charges) || 0,
          amort_immeuble: Number(d.amort_immeuble) || 0,
          amort_mobilier: Number(d.amort_mobilier) || 0,
          amort_derogatoires: Number(d.amort_derogatoires) || 0,
          amort_reintegres: d.amort_reintegres !== null ? Number(d.amort_reintegres) : null,
          deficit_anterieur: d.deficit_anterieur !== null && d.deficit_anterieur !== undefined ? Number(d.deficit_anterieur) : null,
        })));
      } else {
        const currentYear = new Date().getFullYear();
        setRows([emptyRow(currentYear)]);
      }
      setDirty(false);
    } catch {
      showToast('Erreur lors du chargement des donnees ARD', 'error');
    } finally {
      setLoading(false);
    }
  }, [clientId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const results = useMemo<ARDResults[]>(() => {
    const out: ARDResults[] = [];
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      let deficitPrecedent: number;
      if (i === 0) {
        deficitPrecedent = row.deficit_anterieur ?? 0;
      } else {
        deficitPrecedent = out[i - 1].totalAReporter;
      }
      out.push(computeARDWithDeficits(row, deficitPrecedent));
    }
    return out;
  }, [rows]);

  function addYear() {
    const maxYear = rows.length > 0 ? Math.max(...rows.map((r) => r.annee)) : new Date().getFullYear() - 1;
    setRows([...rows, emptyRow(maxYear + 1)]);
    setDirty(true);
  }

  function updateField(index: number, field: keyof ARDRow, value: number | null) {
    setRows((prev) => {
      const updated = [...prev];
      updated[index] = { ...updated[index], [field]: value };
      return updated;
    });
    setDirty(true);
  }

  async function handleSave() {
    setSaving(true);
    try {
      for (const row of rows) {
        const payload = {
          client_id: clientId,
          annee: row.annee,
          ca: row.ca,
          charges_totales: row.charges_totales,
          frais_compta: row.frais_compta,
          adhesion_cga: row.adhesion_cga,
          cfe: row.cfe,
          autres_charges: row.autres_charges,
          amort_immeuble: row.amort_immeuble,
          amort_mobilier: row.amort_mobilier,
          amort_derogatoires: row.amort_derogatoires,
          amort_reintegres: row.amort_reintegres,
          deficit_anterieur: row.deficit_anterieur,
          updated_at: new Date().toISOString(),
        };

        if (row.id) {
          const { error } = await supabase
            .from('client_ard_calculations')
            .update(payload)
            .eq('id', row.id);
          if (error) throw error;
        } else {
          const { error } = await supabase
            .from('client_ard_calculations')
            .insert(payload);
          if (error) throw error;
        }
      }
      showToast('Donnees ARD enregistrees', 'success');
      await loadData();
    } catch (error: any) {
      showToast(error.message || 'Erreur lors de l\'enregistrement', 'error');
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-48">
        <Loader2 className="w-8 h-8 animate-spin text-teal-600" />
      </div>
    );
  }

  let lastSection = '';

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-orange-50 dark:bg-orange-950 flex items-center justify-center">
            <Calculator className="w-5 h-5 text-orange-600 dark:text-orange-400" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
              Amortissements Reputes Differes (ARD)
            </h2>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Suivi annuel LMNP reel BIC
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={addYear}>
            <Plus className="w-4 h-4 mr-1.5" />
            Ajouter une annee
          </Button>
          {dirty && (
            <Button size="sm" onClick={handleSave} disabled={saving}>
              {saving ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : <Save className="w-4 h-4 mr-1.5" />}
              Enregistrer
            </Button>
          )}
        </div>
      </div>

      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr className="bg-gray-50 dark:bg-gray-800/50">
                  <th className="sticky left-0 z-10 bg-gray-50 dark:bg-gray-800/50 text-left px-4 py-3 text-sm font-semibold text-gray-700 dark:text-gray-300 min-w-[260px] border-b border-r border-gray-200 dark:border-gray-700">
                    Poste
                  </th>
                  {rows.map((row) => (
                    <th
                      key={row.annee}
                      className="text-center px-3 py-3 text-sm font-bold text-gray-900 dark:text-white min-w-[150px] border-b border-gray-200 dark:border-gray-700"
                    >
                      {row.annee}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {INPUT_FIELDS.map((field) => {
                  const showHeader = field.section !== lastSection;
                  lastSection = field.section;

                  return (
                    <>
                      {showHeader && (
                        <tr key={`section-${field.section}`} className="bg-gray-100/60 dark:bg-gray-800/30">
                          <td
                            colSpan={rows.length + 1}
                            className="px-4 py-2 text-xs font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400 border-b border-gray-200 dark:border-gray-700"
                          >
                            {SECTION_HEADERS[field.section]}
                          </td>
                        </tr>
                      )}
                      <tr key={field.key} className="hover:bg-gray-50/50 dark:hover:bg-gray-800/20">
                        <td className="sticky left-0 z-10 bg-white dark:bg-gray-900 px-4 py-2 text-sm text-gray-700 dark:text-gray-300 border-b border-r border-gray-200 dark:border-gray-700">
                          {field.label}
                        </td>
                        {rows.map((row, ri) => (
                          <td key={`${row.annee}-${field.key}`} className="px-2 py-1.5 border-b border-gray-200 dark:border-gray-700">
                            <CurrencyInput
                              value={row[field.key] as number}
                              onChange={(v) => updateField(ri, field.key, v)}
                            />
                          </td>
                        ))}
                      </tr>
                    </>
                  );
                })}

                <tr className="bg-amber-50/50 dark:bg-amber-950/20">
                  <td className="sticky left-0 z-10 bg-amber-50 dark:bg-amber-950/30 px-4 py-2.5 text-sm font-semibold text-amber-800 dark:text-amber-300 border-b border-r border-gray-200 dark:border-gray-700">
                    = Total AA2
                  </td>
                  {results.map((r, ri) => (
                    <td key={`aa2-${rows[ri].annee}`} className="px-2 py-2.5 text-right text-sm font-mono font-semibold text-amber-800 dark:text-amber-300 border-b border-gray-200 dark:border-gray-700">
                      {formatCurrency(r.aa2)}
                    </td>
                  ))}
                </tr>

                <tr className="bg-gray-50/50 dark:bg-gray-800/20">
                  <td className="sticky left-0 z-10 bg-gray-50 dark:bg-gray-800/30 px-4 py-2.5 text-sm font-medium text-gray-600 dark:text-gray-400 border-b border-r border-gray-200 dark:border-gray-700">
                    = Charges afferentes (A2 = Aa1 - AA2)
                  </td>
                  {results.map((r, ri) => (
                    <td key={`a2-${rows[ri].annee}`} className="px-2 py-2.5 text-right text-sm font-mono font-medium text-gray-700 dark:text-gray-300 border-b border-gray-200 dark:border-gray-700">
                      {formatCurrency(r.a2)}
                    </td>
                  ))}
                </tr>

                <tr className="bg-teal-50/50 dark:bg-teal-950/20">
                  <td className="sticky left-0 z-10 bg-teal-50 dark:bg-teal-950/30 px-4 py-2.5 text-sm font-semibold text-teal-800 dark:text-teal-300 border-b border-r border-gray-200 dark:border-gray-700">
                    = Plafond deductible (A3)
                  </td>
                  {results.map((r, ri) => (
                    <td key={`a3-${rows[ri].annee}`} className="px-2 py-2.5 text-right text-sm font-mono font-bold text-teal-700 dark:text-teal-400 border-b border-gray-200 dark:border-gray-700">
                      {formatCurrency(r.a3)}
                    </td>
                  ))}
                </tr>

                <tr className="bg-orange-50/50 dark:bg-orange-950/20">
                  <td className="sticky left-0 z-10 bg-orange-50 dark:bg-orange-950/30 px-4 py-2.5 text-sm font-semibold text-orange-800 dark:text-orange-300 border-b border-r border-gray-200 dark:border-gray-700">
                    = Total amortissements (A4)
                  </td>
                  {results.map((r, ri) => (
                    <td key={`a4-${rows[ri].annee}`} className="px-2 py-2.5 text-right text-sm font-mono font-bold text-orange-700 dark:text-orange-400 border-b border-gray-200 dark:border-gray-700">
                      {formatCurrency(r.a4)}
                    </td>
                  ))}
                </tr>

                <tr className="bg-gray-50/50 dark:bg-gray-800/20">
                  <td className="sticky left-0 z-10 bg-gray-50 dark:bg-gray-800/30 px-4 py-2.5 text-sm font-medium text-emerald-700 dark:text-emerald-400 border-b border-r border-gray-200 dark:border-gray-700">
                    Amort. deductibles = min(A4, A3)
                  </td>
                  {results.map((r, ri) => (
                    <td key={`ded-${rows[ri].annee}`} className="px-2 py-2.5 text-right text-sm font-mono font-medium text-emerald-700 dark:text-emerald-400 border-b border-gray-200 dark:border-gray-700">
                      {formatCurrency(r.amortDeductibles)}
                    </td>
                  ))}
                </tr>

                <tr>
                  {(() => {
                    const a5Rows = results.map((r) => r.a5);
                    const anyPositive = a5Rows.some((v) => v > 0);
                    return (
                      <>
                        <td className={`sticky left-0 z-10 px-4 py-3 text-sm font-bold border-b border-r border-gray-200 dark:border-gray-700 ${anyPositive ? 'bg-red-50 dark:bg-red-950/30 text-red-800 dark:text-red-300' : 'bg-emerald-50 dark:bg-emerald-950/30 text-emerald-800 dark:text-emerald-300'}`}>
                          = Reputes differes (A5)
                        </td>
                        {results.map((r, ri) => (
                          <td
                            key={`a5-${rows[ri].annee}`}
                            className={`px-2 py-3 text-right text-sm font-mono font-bold border-b border-gray-200 dark:border-gray-700 ${r.a5 > 0 ? 'bg-red-50/50 dark:bg-red-950/20 text-red-700 dark:text-red-400' : 'bg-emerald-50/50 dark:bg-emerald-950/20 text-emerald-700 dark:text-emerald-400'}`}
                          >
                            <div className="flex items-center justify-end gap-1.5">
                              {r.a5 > 0 ? (
                                <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0" />
                              ) : (
                                <CheckCircle className="w-3.5 h-3.5 flex-shrink-0" />
                              )}
                              {formatCurrency(r.a5)}
                            </div>
                          </td>
                        ))}
                      </>
                    );
                  })()}
                </tr>

                <tr className="bg-gray-100/60 dark:bg-gray-800/30">
                  <td
                    colSpan={rows.length + 1}
                    className="px-4 py-2 text-xs font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400 border-b border-gray-200 dark:border-gray-700"
                  >
                    Controle (optionnel)
                  </td>
                </tr>

                <tr className="hover:bg-gray-50/50 dark:hover:bg-gray-800/20">
                  <td className="sticky left-0 z-10 bg-white dark:bg-gray-900 px-4 py-2 text-sm text-gray-700 dark:text-gray-300 border-b border-r border-gray-200 dark:border-gray-700">
                    Amort. reintegres 2033B (A6)
                  </td>
                  {rows.map((row, ri) => (
                    <td key={`a6-${row.annee}`} className="px-2 py-1.5 border-b border-gray-200 dark:border-gray-700">
                      <NullableCurrencyInput
                        value={row.amort_reintegres}
                        onChange={(v) => updateField(ri, 'amort_reintegres', v)}
                      />
                    </td>
                  ))}
                </tr>

                {results.some((r) => r.hasA6) && (
                  <tr>
                    <td className="sticky left-0 z-10 bg-white dark:bg-gray-900 px-4 py-2.5 text-sm font-semibold text-gray-700 dark:text-gray-300 border-b border-r border-gray-200 dark:border-gray-700">
                      = Ecart regularisation (A5 - A6)
                    </td>
                    {results.map((r, ri) => (
                      <td
                        key={`reg-${rows[ri].annee}`}
                        className={`px-2 py-2.5 text-right text-sm font-mono font-semibold border-b border-gray-200 dark:border-gray-700 ${
                          !r.hasA6
                            ? 'text-gray-400'
                            : r.regularisationStatus === 'ok'
                              ? 'text-emerald-700 dark:text-emerald-400 bg-emerald-50/50 dark:bg-emerald-950/20'
                              : r.regularisationStatus === 'insuffisant'
                                ? 'text-amber-700 dark:text-amber-400 bg-amber-50/50 dark:bg-amber-950/20'
                                : 'text-red-700 dark:text-red-400 bg-red-50/50 dark:bg-red-950/20'
                        }`}
                      >
                        {r.hasA6 ? formatCurrency(r.regularisation) : '-'}
                      </td>
                    ))}
                  </tr>
                )}

                <tr className="bg-gray-100/60 dark:bg-gray-800/30">
                  <td
                    colSpan={rows.length + 1}
                    className="px-4 py-2 text-xs font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400 border-b border-gray-200 dark:border-gray-700"
                  >
                    Resultat fiscal & suivi des deficits
                  </td>
                </tr>

                <tr className={`${results.some((r) => r.resultatFiscal < 0) ? 'bg-red-50/30 dark:bg-red-950/10' : 'bg-emerald-50/30 dark:bg-emerald-950/10'}`}>
                  <td className="sticky left-0 z-10 bg-gray-50 dark:bg-gray-800/30 px-4 py-2.5 text-sm font-semibold text-gray-700 dark:text-gray-300 border-b border-r border-gray-200 dark:border-gray-700">
                    = Resultat fiscal (A1 - A2 - Amort. ded.)
                  </td>
                  {results.map((r, ri) => (
                    <td
                      key={`rf-${rows[ri].annee}`}
                      className={`px-2 py-2.5 text-right text-sm font-mono font-bold border-b border-gray-200 dark:border-gray-700 ${r.resultatFiscal >= 0 ? 'text-emerald-700 dark:text-emerald-400' : 'text-red-700 dark:text-red-400'}`}
                    >
                      {formatCurrency(r.resultatFiscal)}
                    </td>
                  ))}
                </tr>

                <tr className="hover:bg-gray-50/50 dark:hover:bg-gray-800/20">
                  <td className="sticky left-0 z-10 bg-white dark:bg-gray-900 px-4 py-2 text-sm text-gray-700 dark:text-gray-300 border-b border-r border-gray-200 dark:border-gray-700">
                    ARD des années précédentes
                  </td>
                  {rows.map((row, ri) => (
                    <td key={`defprev-${row.annee}`} className="px-2 py-1.5 border-b border-gray-200 dark:border-gray-700">
                      {ri === 0 ? (
                        <NullableCurrencyInput
                          value={row.deficit_anterieur}
                          onChange={(v) => updateField(ri, 'deficit_anterieur', v)}
                        />
                      ) : (
                        <div className="px-2 py-1.5 text-right text-sm font-mono text-gray-700 dark:text-gray-300">
                          {formatCurrency(results[ri].deficitAnneePrecedente)}
                        </div>
                      )}
                    </td>
                  ))}
                </tr>

                <tr className="bg-gray-50/50 dark:bg-gray-800/20">
                  <td className="sticky left-0 z-10 bg-gray-50 dark:bg-gray-800/30 px-4 py-2.5 text-sm font-medium text-emerald-700 dark:text-emerald-400 border-b border-r border-gray-200 dark:border-gray-700">
                    Benefice impute
                  </td>
                  {results.map((r, ri) => (
                    <td key={`benimp-${rows[ri].annee}`} className="px-2 py-2.5 text-right text-sm font-mono font-medium text-emerald-700 dark:text-emerald-400 border-b border-gray-200 dark:border-gray-700">
                      {r.beneficeImpute > 0 ? formatCurrency(r.beneficeImpute) : '-'}
                    </td>
                  ))}
                </tr>

                <tr className="bg-gray-50/50 dark:bg-gray-800/20">
                  <td className="sticky left-0 z-10 bg-gray-50 dark:bg-gray-800/30 px-4 py-2.5 text-sm font-medium text-red-700 dark:text-red-400 border-b border-r border-gray-200 dark:border-gray-700">
                    ARD de l'année
                  </td>
                  {results.map((r, ri) => (
                    <td key={`defyr-${rows[ri].annee}`} className="px-2 py-2.5 text-right text-sm font-mono font-medium text-red-700 dark:text-red-400 border-b border-gray-200 dark:border-gray-700">
                      {r.a5 > 0 ? formatCurrency(r.a5) : '-'}
                    </td>
                  ))}
                </tr>

                <tr>
                  {(() => {
                    const anyDeficit = results.some((r) => r.totalAReporter > 0);
                    return (
                      <>
                        <td className={`sticky left-0 z-10 px-4 py-3 text-sm font-bold border-b border-r border-gray-200 dark:border-gray-700 ${anyDeficit ? 'bg-amber-50 dark:bg-amber-950/30 text-amber-800 dark:text-amber-300' : 'bg-emerald-50 dark:bg-emerald-950/30 text-emerald-800 dark:text-emerald-300'}`}>
                          Total a reporter l'annee suivante
                        </td>
                        {results.map((r, ri) => (
                          <td
                            key={`total-${rows[ri].annee}`}
                            className={`px-2 py-3 text-right text-sm font-mono font-bold border-b border-gray-200 dark:border-gray-700 ${r.totalAReporter > 0 ? 'bg-amber-50/50 dark:bg-amber-950/20 text-amber-700 dark:text-amber-400' : 'bg-emerald-50/50 dark:bg-emerald-950/20 text-emerald-700 dark:text-emerald-400'}`}
                          >
                            <div className="flex items-center justify-end gap-1.5">
                              {r.totalAReporter > 0 ? (
                                <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0" />
                              ) : (
                                <CheckCircle className="w-3.5 h-3.5 flex-shrink-0" />
                              )}
                              {formatCurrency(r.totalAReporter)}
                            </div>
                          </td>
                        ))}
                      </>
                    );
                  })()}
                </tr>
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <div className="flex items-start gap-2 p-4 rounded-lg bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-900">
        <Info className="w-4 h-4 text-blue-500 mt-0.5 flex-shrink-0" />
        <div className="text-sm text-blue-700 dark:text-blue-300 space-y-1">
          <p className="font-medium">Formules appliquees (LMNP reel BIC) :</p>
          <p>A2 = Aa1 - AA2 (charges afferentes aux biens loues)</p>
          <p>A3 = max(0, A1 - A2) (plafond d'amortissements deductibles)</p>
          <p>A5 = max(0, A4 - A3) (amortissements reputes differes)</p>
          <p>Resultat fiscal = A1 - A2 - Amort. deductibles</p>
          <p>Benefice impute = min(Deficit N-1, max(0, Resultat fiscal))</p>
          <p>Deficit de l'annee = max(0, -Resultat fiscal)</p>
          <p>Total a reporter = ARD precedentes - Benefice impute + ARD de l'annee (A5)</p>
          <p className="text-xs text-blue-600 dark:text-blue-400 mt-2">
            L'amortissement ne peut pas creer de deficit fiscal en LMNP. L'excedent est reporte sans limitation de duree.
            Le deficit de l'annee precedente est saisissable manuellement pour la 1ere annee, puis calcule automatiquement.
          </p>
        </div>
      </div>
    </div>
  );
}
