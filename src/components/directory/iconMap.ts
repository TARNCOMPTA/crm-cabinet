import {
  Landmark,
  Users,
  Scale,
  Building2,
  Calculator,
  Globe,
  BookOpen,
  Briefcase,
  FileText,
  Heart,
  Shield,
  Truck,
  Wallet,
  BarChart3,
  Gavel,
  type LucideIcon,
} from 'lucide-react';

export const ICON_OPTIONS: { name: string; label: string; icon: LucideIcon }[] = [
  { name: 'Landmark', label: 'Institution', icon: Landmark },
  { name: 'Users', label: 'Personnes', icon: Users },
  { name: 'Scale', label: 'Justice', icon: Scale },
  { name: 'Building2', label: 'Bâtiment', icon: Building2 },
  { name: 'Calculator', label: 'Calculatrice', icon: Calculator },
  { name: 'Globe', label: 'Globe', icon: Globe },
  { name: 'BookOpen', label: 'Livre', icon: BookOpen },
  { name: 'Briefcase', label: 'Mallette', icon: Briefcase },
  { name: 'FileText', label: 'Document', icon: FileText },
  { name: 'Heart', label: 'Santé', icon: Heart },
  { name: 'Shield', label: 'Sécurité', icon: Shield },
  { name: 'Truck', label: 'Transport', icon: Truck },
  { name: 'Wallet', label: 'Portefeuille', icon: Wallet },
  { name: 'BarChart3', label: 'Statistiques', icon: BarChart3 },
  { name: 'Gavel', label: 'Marteau', icon: Gavel },
];

export const ICON_MAP: Record<string, LucideIcon> = Object.fromEntries(
  ICON_OPTIONS.map((opt) => [opt.name, opt.icon])
);

export const COLOR_OPTIONS = [
  { name: 'blue', label: 'Bleu', bg: 'bg-blue-100', text: 'text-blue-600', border: 'border-blue-300', dot: 'bg-blue-500' },
  { name: 'emerald', label: 'Vert', bg: 'bg-emerald-100', text: 'text-emerald-600', border: 'border-emerald-300', dot: 'bg-emerald-500' },
  { name: 'amber', label: 'Ambre', bg: 'bg-amber-100', text: 'text-amber-600', border: 'border-amber-300', dot: 'bg-amber-500' },
  { name: 'slate', label: 'Ardoise', bg: 'bg-slate-100', text: 'text-slate-600', border: 'border-slate-300', dot: 'bg-slate-500' },
  { name: 'teal', label: 'Sarcelle', bg: 'bg-teal-100', text: 'text-teal-600', border: 'border-teal-300', dot: 'bg-teal-500' },
  { name: 'rose', label: 'Rose', bg: 'bg-rose-100', text: 'text-rose-600', border: 'border-rose-300', dot: 'bg-rose-500' },
  { name: 'sky', label: 'Ciel', bg: 'bg-sky-100', text: 'text-sky-600', border: 'border-sky-300', dot: 'bg-sky-500' },
  { name: 'orange', label: 'Orange', bg: 'bg-orange-100', text: 'text-orange-600', border: 'border-orange-300', dot: 'bg-orange-500' },
];

export function getColorClasses(colorName: string | null) {
  const found = COLOR_OPTIONS.find((c) => c.name === colorName);
  return found || COLOR_OPTIONS[0];
}
