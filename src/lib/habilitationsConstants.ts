import type { CompletenessFilter } from '../types/habilitations';

export const SERVICE_COLORS: Record<string, string> = {
  'Declarer TVA': 'bg-teal-100 text-teal-800 dark:bg-teal-900/40 dark:text-teal-300',
  'Payer TVA': 'bg-teal-50 text-teal-700 dark:bg-teal-900/30 dark:text-teal-400',
  'Consulter le Compte fiscal': 'bg-teal-100 text-teal-800 dark:bg-teal-900/40 dark:text-teal-300',
  'Messagerie': 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300',
  "Declarer le Resultat": 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300',
  "Declarer l'Impot sur les societes": 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300',
  "Payer l'Impot sur les societes": 'bg-green-50 text-green-700 dark:bg-green-900/30 dark:text-green-400',
  'Declarer la CVAE': 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300',
  'Payer la CVAE': 'bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
  'Remboursement de TVA UE': 'bg-sky-100 text-sky-800 dark:bg-sky-900/40 dark:text-sky-300',
  'Guichet de TVA UE': 'bg-sky-50 text-sky-700 dark:bg-sky-900/30 dark:text-sky-400',
  'Tiers declarants': 'bg-slate-100 text-slate-700 dark:bg-slate-700 dark:text-slate-300',
  'Cession de droits sociaux': 'bg-rose-100 text-rose-800 dark:bg-rose-900/40 dark:text-rose-300',
};

export function getServiceColor(service: string): string {
  if (SERVICE_COLORS[service]) return SERVICE_COLORS[service];
  if (service.startsWith('D\u00e9clarer') || service.startsWith('Declarer'))
    return 'bg-cyan-100 text-cyan-800 dark:bg-cyan-900/40 dark:text-cyan-300';
  if (service.startsWith('Payer'))
    return 'bg-orange-100 text-orange-800 dark:bg-orange-900/40 dark:text-orange-300';
  return 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300';
}

export function getProgressColor(percentage: number) {
  if (percentage === 100) return { bar: 'bg-green-500', text: 'text-green-700 dark:text-green-400', bg: 'bg-green-50 dark:bg-green-900/20' };
  if (percentage >= 70) return { bar: 'bg-teal-500', text: 'text-teal-700 dark:text-teal-400', bg: 'bg-teal-50 dark:bg-teal-900/20' };
  if (percentage >= 40) return { bar: 'bg-amber-500', text: 'text-amber-700 dark:text-amber-400', bg: 'bg-amber-50 dark:bg-amber-900/20' };
  return { bar: 'bg-red-500', text: 'text-red-700 dark:text-red-400', bg: 'bg-red-50 dark:bg-red-900/20' };
}

export const AVANCEMENT_OPTIONS = [
  { value: 'a_faire', label: 'A faire' },
  { value: 'demande', label: 'Demande' },
  { value: 'complet', label: 'Complet' },
] as const;

export const AVANCEMENT_STYLES: Record<string, string> = {
  a_faire: 'bg-gray-100 text-gray-700 border-gray-200 dark:bg-gray-700 dark:text-gray-300 dark:border-gray-600',
  demande: 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-900/30 dark:text-amber-300 dark:border-amber-700',
  complet: 'bg-green-50 text-green-700 border-green-200 dark:bg-green-900/30 dark:text-green-300 dark:border-green-700',
};

export const FILTER_PILLS: { key: CompletenessFilter; label: string; activeClass: string; inactiveClass: string }[] = [
  { key: 'all', label: 'Tous', activeClass: 'bg-gray-800 text-white dark:bg-gray-200 dark:text-gray-900', inactiveClass: 'bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600' },
  { key: 'none', label: 'Sans habilitation', activeClass: 'bg-red-600 text-white', inactiveClass: 'bg-red-50 text-red-700 hover:bg-red-100 dark:bg-red-900/30 dark:text-red-300 dark:hover:bg-red-900/50' },
  { key: 'incomplete', label: 'Incomplet', activeClass: 'bg-amber-500 text-white', inactiveClass: 'bg-amber-50 text-amber-700 hover:bg-amber-100 dark:bg-amber-900/30 dark:text-amber-300 dark:hover:bg-amber-900/50' },
  { key: 'complete', label: 'Complet', activeClass: 'bg-green-600 text-white', inactiveClass: 'bg-green-50 text-green-700 hover:bg-green-100 dark:bg-green-900/30 dark:text-green-300 dark:hover:bg-green-900/50' },
  { key: 'non_client', label: 'Non client', activeClass: 'bg-orange-600 text-white', inactiveClass: 'bg-orange-50 text-orange-700 hover:bg-orange-100 dark:bg-orange-900/30 dark:text-orange-300 dark:hover:bg-orange-900/50' },
  { key: 'non_concerne', label: 'Non concerne', activeClass: 'bg-slate-600 text-white', inactiveClass: 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-700 dark:text-slate-300 dark:hover:bg-slate-600' },
];

export const TABLE_ROW_HEIGHT = 56;
