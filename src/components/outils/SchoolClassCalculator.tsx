import { useMemo, useState } from 'react';
import { Card, CardContent } from '../ui/Card';
import { Input } from '../ui/Input';
import { Button } from '../ui/Button';
import {
  GraduationCap,
  Calendar,
  Baby,
  BookOpen,
  RotateCcw,
  Info,
  AlertTriangle,
} from 'lucide-react';

type Cycle = 'maternelle' | 'elementaire' | 'college' | 'lycee' | 'hors';

interface SchoolClassResult {
  className: string;
  cycle: Cycle;
  cycleLabel: string;
  ageAuRef: number;
  anneeScolaire: string;
  refDate: string;
  message?: string;
  warning?: boolean;
}

const AGE_TO_CLASS: Record<number, { name: string; cycle: Cycle; cycleLabel: string }> = {
  3: { name: 'Petite Section (PS)', cycle: 'maternelle', cycleLabel: 'Maternelle' },
  4: { name: 'Moyenne Section (MS)', cycle: 'maternelle', cycleLabel: 'Maternelle' },
  5: { name: 'Grande Section (GS)', cycle: 'maternelle', cycleLabel: 'Maternelle' },
  6: { name: 'CP', cycle: 'elementaire', cycleLabel: 'Elementaire' },
  7: { name: 'CE1', cycle: 'elementaire', cycleLabel: 'Elementaire' },
  8: { name: 'CE2', cycle: 'elementaire', cycleLabel: 'Elementaire' },
  9: { name: 'CM1', cycle: 'elementaire', cycleLabel: 'Elementaire' },
  10: { name: 'CM2', cycle: 'elementaire', cycleLabel: 'Elementaire' },
  11: { name: '6eme', cycle: 'college', cycleLabel: 'College' },
  12: { name: '5eme', cycle: 'college', cycleLabel: 'College' },
  13: { name: '4eme', cycle: 'college', cycleLabel: 'College' },
  14: { name: '3eme', cycle: 'college', cycleLabel: 'College' },
  15: { name: 'Seconde', cycle: 'lycee', cycleLabel: 'Lycee' },
  16: { name: 'Premiere', cycle: 'lycee', cycleLabel: 'Lycee' },
  17: { name: 'Terminale', cycle: 'lycee', cycleLabel: 'Lycee' },
};

const CYCLE_COLORS: Record<Cycle, { bg: string; text: string; border: string; ring: string }> = {
  maternelle: {
    bg: 'bg-pink-50 dark:bg-pink-950',
    text: 'text-pink-700 dark:text-pink-300',
    border: 'border-pink-200 dark:border-pink-800',
    ring: 'ring-pink-500',
  },
  elementaire: {
    bg: 'bg-amber-50 dark:bg-amber-950',
    text: 'text-amber-700 dark:text-amber-300',
    border: 'border-amber-200 dark:border-amber-800',
    ring: 'ring-amber-500',
  },
  college: {
    bg: 'bg-sky-50 dark:bg-sky-950',
    text: 'text-sky-700 dark:text-sky-300',
    border: 'border-sky-200 dark:border-sky-800',
    ring: 'ring-sky-500',
  },
  lycee: {
    bg: 'bg-emerald-50 dark:bg-emerald-950',
    text: 'text-emerald-700 dark:text-emerald-300',
    border: 'border-emerald-200 dark:border-emerald-800',
    ring: 'ring-emerald-500',
  },
  hors: {
    bg: 'bg-gray-50 dark:bg-gray-900',
    text: 'text-gray-700 dark:text-gray-300',
    border: 'border-gray-200 dark:border-gray-800',
    ring: 'ring-gray-500',
  },
};

function getAnneeScolaire(today: Date): { startYear: number; endYear: number; label: string } {
  const month = today.getMonth();
  const year = today.getFullYear();
  const startYear = month >= 7 ? year : year - 1;
  const endYear = startYear + 1;
  return { startYear, endYear, label: `${startYear}-${endYear}` };
}

function computeResult(birthDateStr: string): SchoolClassResult | null {
  if (!birthDateStr) return null;
  const birth = new Date(birthDateStr);
  if (isNaN(birth.getTime())) return null;

  const today = new Date();
  if (birth > today) {
    return {
      className: 'Non scolarisable',
      cycle: 'hors',
      cycleLabel: 'Hors scolarisation',
      ageAuRef: 0,
      anneeScolaire: '',
      refDate: '',
      message: 'La date de naissance est posterieure a la date du jour.',
      warning: true,
    };
  }

  const { startYear, label } = getAnneeScolaire(today);
  const refDate = new Date(startYear, 11, 31);

  let age = refDate.getFullYear() - birth.getFullYear();
  const m = refDate.getMonth() - birth.getMonth();
  if (m < 0 || (m === 0 && refDate.getDate() < birth.getDate())) age--;

  const refDateLabel = refDate.toLocaleDateString('fr-FR');

  if (age < 3) {
    return {
      className: age < 2 ? 'Non scolarise' : 'Toute Petite Section (TPS)',
      cycle: age < 2 ? 'hors' : 'maternelle',
      cycleLabel: age < 2 ? 'Hors scolarisation' : 'Maternelle (TPS)',
      ageAuRef: age,
      anneeScolaire: label,
      refDate: refDateLabel,
      message:
        age < 2
          ? 'Enfant trop jeune pour la scolarisation obligatoire.'
          : 'Accueil possible en TPS selon les places disponibles dans la commune.',
    };
  }

  if (age > 17) {
    return {
      className: 'Post-bac',
      cycle: 'hors',
      cycleLabel: 'Apres le lycee',
      ageAuRef: age,
      anneeScolaire: label,
      refDate: refDateLabel,
      message: 'Age superieur a 17 ans : etudes superieures, apprentissage ou vie active.',
    };
  }

  const mapped = AGE_TO_CLASS[age];
  return {
    className: mapped.name,
    cycle: mapped.cycle,
    cycleLabel: mapped.cycleLabel,
    ageAuRef: age,
    anneeScolaire: label,
    refDate: refDateLabel,
  };
}

export function SchoolClassCalculator() {
  const [birthDate, setBirthDate] = useState('');

  const result = useMemo(() => computeResult(birthDate), [birthDate]);

  const reset = () => setBirthDate('');

  const colors = result ? CYCLE_COLORS[result.cycle] : null;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
      <Card className="lg:col-span-2">
        <CardContent className="p-6 space-y-5">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-lg bg-blue-50 dark:bg-blue-950 flex items-center justify-center shrink-0">
              <GraduationCap className="w-5 h-5 text-blue-600 dark:text-blue-400" />
            </div>
            <div>
              <h3 className="text-base font-semibold text-gray-900 dark:text-white">
                Classe scolaire
              </h3>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                Saisissez une date de naissance
              </p>
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium text-gray-700 dark:text-gray-300 flex items-center gap-1.5">
              <Calendar className="w-4 h-4" />
              Date de naissance
            </label>
            <Input
              type="date"
              value={birthDate}
              onChange={(e) => setBirthDate(e.target.value)}
              max={new Date().toISOString().split('T')[0]}
            />
          </div>

          <div className="flex items-start gap-2 p-3 rounded-md bg-blue-50 dark:bg-blue-950/40 border border-blue-100 dark:border-blue-900">
            <Info className="w-4 h-4 text-blue-600 dark:text-blue-400 shrink-0 mt-0.5" />
            <p className="text-xs text-blue-800 dark:text-blue-200 leading-relaxed">
              La classe est determinee selon la regle de l'Education Nationale :
              age atteint au 31 decembre de l'annee scolaire en cours.
            </p>
          </div>

          {birthDate && (
            <Button variant="ghost" size="sm" onClick={reset} className="w-full">
              <RotateCcw className="w-4 h-4 mr-2" />
              Reinitialiser
            </Button>
          )}
        </CardContent>
      </Card>

      <Card className="lg:col-span-3">
        <CardContent className="p-6">
          {!result ? (
            <div className="flex flex-col items-center justify-center text-center py-16 px-6">
              <div className="w-14 h-14 rounded-full bg-gray-100 dark:bg-gray-800 flex items-center justify-center mb-4">
                <Baby className="w-7 h-7 text-gray-400" />
              </div>
              <p className="text-sm font-medium text-gray-700 dark:text-gray-300">
                Aucune date saisie
              </p>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 max-w-xs">
                Entrez une date de naissance pour decouvrir la classe correspondante
                selon le calendrier scolaire francais.
              </p>
            </div>
          ) : (
            <div className="space-y-5">
              <div
                className={`rounded-lg border ${colors!.border} ${colors!.bg} p-6 text-center`}
              >
                <p
                  className={`text-xs font-semibold uppercase tracking-wider ${colors!.text}`}
                >
                  {result.cycleLabel}
                </p>
                <p className="mt-2 text-3xl font-bold text-gray-900 dark:text-white">
                  {result.className}
                </p>
                {result.anneeScolaire && (
                  <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
                    Annee scolaire {result.anneeScolaire}
                  </p>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="rounded-lg border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4">
                  <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wider font-medium">
                    <Baby className="w-3.5 h-3.5" />
                    Age au 31/12
                  </div>
                  <p className="mt-1.5 text-xl font-semibold text-gray-900 dark:text-white">
                    {result.ageAuRef} {result.ageAuRef > 1 ? 'ans' : 'an'}
                  </p>
                </div>
                <div className="rounded-lg border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4">
                  <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wider font-medium">
                    <BookOpen className="w-3.5 h-3.5" />
                    Cycle
                  </div>
                  <p className="mt-1.5 text-xl font-semibold text-gray-900 dark:text-white capitalize">
                    {result.cycleLabel}
                  </p>
                </div>
              </div>

              {result.refDate && (
                <div className="text-xs text-gray-500 dark:text-gray-400 text-center">
                  Reference : age atteint au {result.refDate}
                </div>
              )}

              {result.message && (
                <div
                  className={`flex items-start gap-2 p-3 rounded-md border ${
                    result.warning
                      ? 'bg-amber-50 dark:bg-amber-950/40 border-amber-200 dark:border-amber-900'
                      : 'bg-gray-50 dark:bg-gray-900 border-gray-200 dark:border-gray-800'
                  }`}
                >
                  {result.warning ? (
                    <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                  ) : (
                    <Info className="w-4 h-4 text-gray-500 dark:text-gray-400 shrink-0 mt-0.5" />
                  )}
                  <p
                    className={`text-xs leading-relaxed ${
                      result.warning
                        ? 'text-amber-800 dark:text-amber-200'
                        : 'text-gray-600 dark:text-gray-400'
                    }`}
                  >
                    {result.message}
                  </p>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
