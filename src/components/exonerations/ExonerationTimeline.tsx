import { useState, useEffect, useCallback } from 'react';
import { Calendar, Clock, CheckCircle, MousePointerClick, Calculator, Save, Trash2, Loader2, Paperclip, FileText, Download } from 'lucide-react';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { useToast } from '../../contexts/ToastContext';
import { useAuth } from '../../contexts/AuthContext';
import { ConfirmDialog } from '../ui/ConfirmDialog';
import {
  ExonerationWithClient,
  computeDegressiveTimeline,
  getCurrentRate,
  computeResultProrata,
  fetchExemptionResults,
  saveExemptionResult,
  deleteExemptionResult,
  uploadRescritDocument,
  deleteRescritDocument,
  downloadRescritDocument,
  YearSlice,
  ExemptionResult,
  ProrataResult,
} from '../../lib/exonerationService';

interface Props {
  item: ExonerationWithClient;
  savedResults?: ExemptionResult[];
  onResultsChanged?: () => void;
  onJustificatifChanged?: () => void;
}

function formatDate(date: Date): string {
  return date.toLocaleDateString('fr-FR', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

function formatCurrency(value: number): string {
  return value.toLocaleString('fr-FR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

const rateColors: Record<number, string> = {
  100: 'bg-emerald-500',
  75: 'bg-teal-500',
  50: 'bg-amber-500',
  25: 'bg-orange-500',
};

const rateTextColors: Record<number, string> = {
  100: 'text-emerald-600 dark:text-emerald-400',
  75: 'text-teal-600 dark:text-teal-400',
  50: 'text-amber-600 dark:text-amber-400',
  25: 'text-orange-600 dark:text-orange-400',
};

function getFullYearsElapsed(start: Date, target: Date): number {
  let years = target.getFullYear() - start.getFullYear();
  const monthDiff = target.getMonth() - start.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && target.getDate() < start.getDate())) {
    years--;
  }
  return Math.max(0, years);
}

function getRateForYears(years: number): number {
  if (years < 5) return 100;
  if (years < 6) return 75;
  if (years < 7) return 50;
  if (years < 8) return 25;
  return 0;
}

function buildSliceDescription(slice: YearSlice, dateDebut: string): string {
  const start = new Date(dateDebut);
  const anniversaryMonth = start.getMonth();
  const anniversaryDay = start.getDate();

  const yearStart = slice.startDate;
  const yearEnd = slice.endDate;

  const anniversary = new Date(slice.calendarYear, anniversaryMonth, anniversaryDay);

  if (anniversary <= yearStart || anniversary > yearEnd) {
    const fullYears = getFullYearsElapsed(start, yearStart);
    const rate = getRateForYears(fullYears);
    return `${slice.months} mois a ${rate}%`;
  }

  const msBeforeAnniv = anniversary.getTime() - yearStart.getTime();
  const msAfterAnniv = yearEnd.getTime() - anniversary.getTime();
  const monthsBefore = Math.max(1, Math.round(msBeforeAnniv / (30.44 * 24 * 60 * 60 * 1000)));
  const monthsAfter = Math.max(1, Math.round(msAfterAnniv / (30.44 * 24 * 60 * 60 * 1000)));

  const fullYearsBefore = getFullYearsElapsed(start, yearStart);
  const fullYearsAfter = getFullYearsElapsed(start, anniversary);

  const rateBefore = getRateForYears(fullYearsBefore);
  const rateAfter = getRateForYears(fullYearsAfter);

  if (rateBefore === rateAfter) {
    return `${slice.months} mois a ${rateBefore}%`;
  }

  return `${monthsBefore} mois a ${rateBefore}% et ${monthsAfter} mois a ${rateAfter}%`;
}

function formatCompact(value: number): string {
  if (value >= 1000000) return `${(value / 1000000).toFixed(1)}M`;
  if (value >= 1000) return `${(value / 1000).toFixed(1)}k`;
  return value.toFixed(0);
}

interface SliceBarProps {
  slice: YearSlice;
  isSelected: boolean;
  savedResult: ExemptionResult | null;
  onClick: () => void;
}

function SliceBar({ slice, isSelected, savedResult, onClick }: SliceBarProps) {
  const today = new Date();
  const isPast = today > slice.endDate && !slice.isCurrent;
  const isFuture = today < slice.startDate;

  let barClass = rateColors[slice.rate] || 'bg-gray-300';
  if (isPast) barClass += ' opacity-50';
  if (isFuture) barClass = 'bg-gray-200 dark:bg-gray-700';

  return (
    <button
      type="button"
      onClick={onClick}
      className="flex flex-col items-center gap-1 group"
      style={{ flex: slice.months }}
    >
      <div className="relative w-full">
        <div
          className={`h-8 rounded ${barClass} transition-all cursor-pointer group-hover:scale-y-125 group-hover:brightness-110 ${
            slice.isCurrent ? 'ring-2 ring-offset-1 ring-teal-400 dark:ring-teal-500' : ''
          } ${isSelected && !slice.isCurrent ? 'ring-2 ring-offset-1 ring-gray-400 dark:ring-gray-500' : ''}`}
        />
        {slice.isCurrent && !isSelected && (
          <div className="absolute -top-5 left-1/2 -translate-x-1/2">
            <span className="text-[10px] font-bold text-teal-600 dark:text-teal-400 whitespace-nowrap bg-teal-50 dark:bg-teal-900/40 px-1.5 py-0.5 rounded">
              Aujourd'hui
            </span>
          </div>
        )}
        {isSelected && (
          <div className="absolute -top-5 left-1/2 -translate-x-1/2">
            <span className="text-[10px] font-bold text-gray-700 dark:text-gray-200 whitespace-nowrap bg-white dark:bg-gray-700 px-1.5 py-0.5 rounded shadow-sm border border-gray-200 dark:border-gray-600">
              {slice.calendarYear}
            </span>
          </div>
        )}
        {savedResult && !isSelected && (
          <div className="absolute -bottom-1.5 left-1/2 -translate-x-1/2">
            <div className="w-2 h-2 rounded-full bg-teal-500 border border-white dark:border-gray-800" />
          </div>
        )}
      </div>
      <span className={`text-xs font-semibold ${isSelected ? 'text-gray-900 dark:text-white' : 'text-gray-700 dark:text-gray-300'}`}>
        {slice.rate}%
      </span>
      <span className={`text-[10px] leading-tight text-center ${isSelected ? 'text-gray-700 dark:text-gray-200 font-medium' : 'text-gray-500 dark:text-gray-400'}`}>
        {slice.calendarYear}
      </span>
      {savedResult && (
        <div className="flex flex-col items-center gap-0.5 mt-0.5">
          <span className="text-[9px] font-semibold text-emerald-600 dark:text-emerald-400 whitespace-nowrap leading-none">
            {formatCompact(savedResult.resultat_exonere)}
          </span>
          <span className="text-[9px] text-amber-600 dark:text-amber-400 whitespace-nowrap leading-none">
            {formatCompact(savedResult.resultat_impose)}
          </span>
        </div>
      )}
    </button>
  );
}

interface ResultPanelProps {
  slice: YearSlice;
  dateDebut: string;
  existingResult: ExemptionResult | null;
  taxExemptionId: string;
  onSaved: () => void;
}

function ResultPanel({ slice, dateDebut, existingResult, taxExemptionId, onSaved }: ResultPanelProps) {
  const { showToast } = useToast();
  const [resultat, setResultat] = useState('');
  const [prorata, setProrata] = useState<ProrataResult | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    if (existingResult) {
      setResultat(existingResult.resultat_exercice.toString());
      setProrata({
        segments: existingResult.detail_calcul,
        totalExonere: existingResult.resultat_exonere,
        totalImpose: existingResult.resultat_impose,
      });
    } else {
      setResultat('');
      setProrata(null);
    }
  }, [existingResult, slice.calendarYear]);

  const handleCalculate = useCallback(() => {
    const val = parseFloat(resultat);
    if (isNaN(val) || val < 0) {
      setProrata(null);
      return;
    }
    const result = computeResultProrata(dateDebut, slice.calendarYear, val);
    setProrata(result);
  }, [resultat, dateDebut, slice.calendarYear]);

  const handleSave = async () => {
    const val = parseFloat(resultat);
    if (isNaN(val) || val < 0 || !prorata) return;

    setSaving(true);
    try {
      await saveExemptionResult({
        tax_exemption_id: taxExemptionId,
        calendar_year: slice.calendarYear,
        resultat_exercice: val,
        resultat_exonere: prorata.totalExonere,
        resultat_impose: prorata.totalImpose,
        detail_calcul: prorata.segments,
      });
      showToast('Resultat sauvegarde', 'success');
      onSaved();
    } catch {
      showToast('Erreur lors de la sauvegarde', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!existingResult) return;
    setDeleting(true);
    try {
      await deleteExemptionResult(existingResult.id);
      setResultat('');
      setProrata(null);
      showToast('Resultat supprime', 'success');
      onSaved();
    } catch {
      showToast('Erreur lors de la suppression', 'error');
    } finally {
      setDeleting(false);
    }
  };

  const isExpiredSlice = slice.rate === 0;

  return (
    <div className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-700 animate-in fade-in slide-in-from-top-2 duration-300">
      <div className="flex items-center gap-2 mb-4">
        <Calculator className="w-4 h-4 text-teal-600 dark:text-teal-400" />
        <h4 className="text-sm font-semibold text-gray-900 dark:text-white">
          Resultat de l'exercice {slice.calendarYear}
        </h4>
      </div>

      {isExpiredSlice ? (
        <div className="bg-gray-100 dark:bg-gray-700/50 rounded-lg p-4">
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Exoneration expiree pour cette annee -- le resultat est 100% imposable.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row gap-3 items-end">
            <div className="flex-1 w-full">
              <Input
                label="Resultat de l'exercice (EUR)"
                type="number"
                value={resultat}
                onChange={(e) => setResultat(e.target.value)}
                onBlur={handleCalculate}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleCalculate();
                  }
                }}
                placeholder="Ex : 50 000"
                min="0"
                step="0.01"
              />
            </div>
            <Button
              type="button"
              variant="secondary"
              onClick={handleCalculate}
              disabled={!resultat || parseFloat(resultat) < 0}
              className="shrink-0"
            >
              <Calculator className="w-4 h-4 mr-1.5" />
              Calculer
            </Button>
          </div>

          {prorata && (
            <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
              <div className="px-4 py-3 border-b border-gray-100 dark:border-gray-700">
                <p className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Detail du calcul
                </p>
              </div>

              <div className="px-4 py-3 space-y-2">
                {prorata.segments.map((seg, idx) => (
                  <div key={idx} className="flex items-center justify-between text-sm">
                    <span className="text-gray-600 dark:text-gray-400">
                      {formatCurrency(parseFloat(resultat))} x {seg.months}/{prorata.segments.reduce((a, s) => a + s.months, 0)} x {seg.rate}%
                    </span>
                    <span className="font-medium text-gray-900 dark:text-white">
                      {formatCurrency(seg.amount)} EUR
                    </span>
                  </div>
                ))}
              </div>

              <div className="border-t border-gray-100 dark:border-gray-700">
                <div className="grid grid-cols-2 divide-x divide-gray-100 dark:divide-gray-700">
                  <div className="px-4 py-3">
                    <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">Resultat exonere</p>
                    <p className="text-lg font-bold text-emerald-600 dark:text-emerald-400">
                      {formatCurrency(prorata.totalExonere)} EUR
                    </p>
                  </div>
                  <div className="px-4 py-3">
                    <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">Resultat impose</p>
                    <p className="text-lg font-bold text-amber-600 dark:text-amber-400">
                      {formatCurrency(prorata.totalImpose)} EUR
                    </p>
                  </div>
                </div>
              </div>

              <div className="px-4 py-3 bg-gray-50 dark:bg-gray-800/80 border-t border-gray-100 dark:border-gray-700 flex items-center justify-end gap-2">
                {existingResult && (
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={handleDelete}
                    disabled={deleting}
                    className="text-red-600 hover:text-red-700 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-900/20"
                  >
                    {deleting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4 mr-1.5" />}
                    Supprimer
                  </Button>
                )}
                <Button
                  type="button"
                  onClick={handleSave}
                  disabled={saving}
                >
                  {saving ? <Loader2 className="w-4 h-4 animate-spin mr-1.5" /> : <Save className="w-4 h-4 mr-1.5" />}
                  {existingResult ? 'Mettre a jour' : 'Sauvegarder'}
                </Button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function ExonerationTimeline({ item, savedResults: propResults, onResultsChanged, onJustificatifChanged }: Props) {
  const { profile } = useAuth();
  const { showToast } = useToast();
  const timeline = computeDegressiveTimeline(item.date_debut);
  const { isExpired } = getCurrentRate(item.date_debut);
  const currentSlice = timeline.find((s) => s.isCurrent);
  const currentYearDescription = currentSlice
    ? buildSliceDescription(currentSlice, item.date_debut)
    : null;
  const [selectedYear, setSelectedYear] = useState<number | null>(null);
  const [results, setResults] = useState<ExemptionResult[]>(propResults || []);
  const [loadingResults, setLoadingResults] = useState(!propResults);
  const [uploading, setUploading] = useState(false);
  const [deletingDoc, setDeletingDoc] = useState(false);
  const [showDeleteDocConfirm, setShowDeleteDocConfirm] = useState(false);
  const [downloading, setDownloading] = useState(false);

  useEffect(() => {
    if (propResults) {
      setResults(propResults);
      setLoadingResults(false);
      return;
    }

    let cancelled = false;
    const load = async () => {
      try {
        const data = await fetchExemptionResults(item.id);
        if (!cancelled) setResults(data);
      } catch {
        // silent
      } finally {
        if (!cancelled) setLoadingResults(false);
      }
    };
    load();
    return () => { cancelled = true; };
  }, [item.id, propResults]);

  const handleResultsChanged = useCallback(async () => {
    try {
      const data = await fetchExemptionResults(item.id);
      setResults(data);
    } catch {
      // silent
    }
    onResultsChanged?.();
  }, [item.id, onResultsChanged]);

  const resultsByYear = new Map(results.map((r) => [r.calendar_year, r]));

  const selectedSlice = selectedYear !== null
    ? timeline.find((s) => s.calendarYear === selectedYear) || null
    : null;

  const selectedDescription = selectedSlice
    ? buildSliceDescription(selectedSlice, item.date_debut)
    : null;

  const selectedResult = selectedYear !== null
    ? resultsByYear.get(selectedYear) || null
    : null;

  function handleSliceClick(calendarYear: number) {
    setSelectedYear((prev) => (prev === calendarYear ? null : calendarYear));
  }

  return (
    <div className="bg-gray-50 dark:bg-gray-800/50 rounded-xl p-5 space-y-5">
      <div className="flex flex-wrap items-center gap-4">
        <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
          <Calendar className="w-4 h-4" />
          <span>
            Du {formatDate(new Date(item.date_debut))} au{' '}
            {formatDate(new Date(item.date_fin))}
          </span>
        </div>

        {selectedSlice && selectedDescription ? (
          <div className="flex items-center gap-2 text-sm">
            <MousePointerClick className={`w-4 h-4 ${rateTextColors[selectedSlice.rate] || 'text-gray-500'}`} />
            <span className={`font-medium ${rateTextColors[selectedSlice.rate] || 'text-gray-600 dark:text-gray-300'}`}>
              {selectedDescription}
            </span>
            <button
              type="button"
              onClick={() => setSelectedYear(null)}
              className="text-xs text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 underline ml-1 transition-colors"
            >
              reset
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-2 text-sm">
            {isExpired ? (
              <>
                <CheckCircle className="w-4 h-4 text-gray-400" />
                <span className="text-gray-500">Termine</span>
              </>
            ) : currentYearDescription ? (
              <>
                <Clock className="w-4 h-4 text-teal-600 dark:text-teal-400" />
                <span className="text-teal-700 dark:text-teal-300 font-medium">
                  {currentSlice!.calendarYear} : {currentYearDescription}
                </span>
              </>
            ) : (
              <>
                <Clock className="w-4 h-4 text-teal-600 dark:text-teal-400" />
                <span className="text-teal-700 dark:text-teal-300 font-medium">
                  A venir
                </span>
              </>
            )}
          </div>
        )}

        {item.montant && (
          <div className="text-sm text-gray-600 dark:text-gray-400">
            Montant : {item.montant.toLocaleString('fr-FR')} EUR
          </div>
        )}
      </div>

      <div className="flex gap-1 pt-3 pb-1">
        {timeline.map((s) => (
          <SliceBar
            key={s.calendarYear}
            slice={s}
            isSelected={selectedYear === s.calendarYear}
            savedResult={resultsByYear.get(s.calendarYear) || null}
            onClick={() => handleSliceClick(s.calendarYear)}
          />
        ))}
      </div>

      {selectedSlice && !loadingResults && (
        <ResultPanel
          slice={selectedSlice}
          dateDebut={item.date_debut}
          existingResult={selectedResult}
          taxExemptionId={item.id}
          onSaved={handleResultsChanged}
        />
      )}

      {selectedSlice && loadingResults && (
        <div className="flex items-center justify-center py-4">
          <Loader2 className="w-5 h-5 animate-spin text-gray-400" />
        </div>
      )}

      {item.notes && (
        <div className="pt-2 border-t border-gray-200 dark:border-gray-700">
          <p className="text-xs text-gray-500 dark:text-gray-400 italic">{item.notes}</p>
        </div>
      )}

      <div className="pt-3 border-t border-gray-200 dark:border-gray-700">
        <div className="flex items-center gap-2 mb-3">
          <Paperclip className="w-4 h-4 text-teal-600 dark:text-teal-400" />
          <h4 className="text-sm font-semibold text-gray-900 dark:text-white">
            Rescrit fiscal
          </h4>
        </div>

        {item.justificatif_url ? (
          <div className="flex items-center gap-3 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 px-4 py-3">
            <FileText className="w-5 h-5 text-red-500 flex-shrink-0" />
            <span className="text-sm text-gray-700 dark:text-gray-300 truncate flex-1">
              {item.justificatif_url.split('/').pop() || 'rescrit-fiscal.pdf'}
            </span>
            <button
              type="button"
              onClick={async () => {
                setDownloading(true);
                try {
                  await downloadRescritDocument(item.justificatif_url!);
                } catch {
                  showToast('Erreur lors du telechargement', 'error');
                } finally {
                  setDownloading(false);
                }
              }}
              disabled={downloading}
              className="p-1.5 rounded-lg text-gray-400 hover:text-teal-600 hover:bg-teal-50 dark:hover:text-teal-400 dark:hover:bg-teal-900/30 transition-colors"
              title="Telecharger"
            >
              {downloading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
            </button>
            <button
              type="button"
              onClick={() => setShowDeleteDocConfirm(true)}
              className="p-1.5 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50 dark:hover:text-red-400 dark:hover:bg-red-900/30 transition-colors"
              title="Supprimer"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        ) : (
          <label className="flex items-center gap-3 cursor-pointer bg-white dark:bg-gray-800 rounded-lg border border-dashed border-gray-300 dark:border-gray-600 px-4 py-3 hover:border-teal-400 hover:bg-teal-50/30 dark:hover:border-teal-600 dark:hover:bg-teal-900/10 transition-colors">
            {uploading ? (
              <Loader2 className="w-5 h-5 text-teal-500 animate-spin flex-shrink-0" />
            ) : (
              <Paperclip className="w-5 h-5 text-gray-400 flex-shrink-0" />
            )}
            <span className="text-sm text-gray-500 dark:text-gray-400">
              {uploading ? 'Envoi en cours...' : 'Joindre le rescrit fiscal (PDF, 10 Mo max)'}
            </span>
            <input
              type="file"
              accept="application/pdf"
              className="hidden"
              disabled={uploading}
              onChange={async (e) => {
                const file = e.target.files?.[0];
                if (!file || !profile) return;
                e.target.value = '';

                if (file.type !== 'application/pdf') {
                  showToast('Seuls les fichiers PDF sont acceptes', 'error');
                  return;
                }
                if (file.size > 10 * 1024 * 1024) {
                  showToast('Le fichier ne doit pas depasser 10 Mo', 'error');
                  return;
                }

                setUploading(true);
                try {
                  await uploadRescritDocument(item.id, file);
                  showToast('Rescrit fiscal enregistre', 'success');
                  onJustificatifChanged?.();
                } catch {
                  showToast('Erreur lors de l\'envoi du fichier', 'error');
                } finally {
                  setUploading(false);
                }
              }}
            />
          </label>
        )}
      </div>

      <ConfirmDialog
        isOpen={showDeleteDocConfirm}
        onClose={() => setShowDeleteDocConfirm(false)}
        onConfirm={async () => {
          if (!item.justificatif_url) return;
          setDeletingDoc(true);
          try {
            await deleteRescritDocument(item.id, item.justificatif_url);
            showToast('Rescrit fiscal supprime', 'success');
            setShowDeleteDocConfirm(false);
            onJustificatifChanged?.();
          } catch {
            showToast('Erreur lors de la suppression', 'error');
          } finally {
            setDeletingDoc(false);
          }
        }}
        title="Supprimer le rescrit fiscal"
        message="Supprimer le document joint ? Cette action est irreversible."
        confirmText="Supprimer"
        variant="danger"
        loading={deletingDoc}
      />
    </div>
  );
}
