import { supabase } from './supabase';
import type { Database, Json } from '../types/database';

export const EXONERATION_TYPES = [
  { value: 'ZFU', label: 'ZFU - Zone Franche Urbaine' },
  { value: 'ZRR', label: 'ZRR - Zone de Revitalisation Rurale' },
  { value: 'ZFRR', label: 'ZFRR - Zone France Revitalisation Rurale' },
  { value: 'JEI', label: 'JEI - Jeune Entreprise Innovante' },
  { value: 'BER', label: 'BER - Bassin d\'Emploi a Redynamiser' },
  { value: 'ACRE', label: 'ACRE - Aide a la Creation/Reprise' },
  { value: 'ZFU-TE', label: 'ZFU-TE - Territoire Entrepreneur' },
  { value: 'QPV', label: 'QPV - Quartier Prioritaire' },
  { value: 'autre', label: 'Autre' },
];

export interface ExonerationWithClient {
  id: string;
  client_id: string;
  type_exoneration: string;
  date_debut: string;
  date_fin: string;
  montant: number | null;
  statut: string;
  justificatif_url: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
  client: {
    id: string;
    nom_entreprise: string;
    siren: string | null;
    siret: string | null;
    statut: string;
  };
}

export interface YearSlice {
  year: number;
  calendarYear: number;
  startDate: Date;
  endDate: Date;
  rate: number;
  phase: 'plein' | 'degressif' | 'expire';
  isCurrent: boolean;
  months: number;
}

function getRateAtOffset(yearsElapsed: number): { rate: number; phase: YearSlice['phase'] } {
  if (yearsElapsed < 5) return { rate: 100, phase: 'plein' };
  if (yearsElapsed < 6) return { rate: 75, phase: 'degressif' };
  if (yearsElapsed < 7) return { rate: 50, phase: 'degressif' };
  if (yearsElapsed < 8) return { rate: 25, phase: 'degressif' };
  return { rate: 0, phase: 'expire' };
}

const REFERENCE_DATE = new Date(2026, 0, 1);

export function computeDegressiveTimeline(dateDebut: string): YearSlice[] {
  const start = new Date(dateDebut);
  const today = REFERENCE_DATE;
  const slices: YearSlice[] = [];

  const endTotal = new Date(start);
  endTotal.setFullYear(endTotal.getFullYear() + 8);
  endTotal.setDate(endTotal.getDate() - 1);

  const firstYear = start.getFullYear();
  const lastYear = endTotal.getFullYear();

  for (let cy = firstYear; cy <= lastYear; cy++) {
    const calStart = cy === firstYear ? new Date(start) : new Date(cy, 0, 1);
    const calEnd = cy === lastYear ? new Date(endTotal) : new Date(cy, 11, 31);

    const diffMs = calStart.getTime() - start.getTime();
    const yearsElapsed = diffMs / (365.25 * 24 * 60 * 60 * 1000);
    const { rate, phase } = getRateAtOffset(Math.max(0, yearsElapsed));

    const isCurrent = today >= calStart && today <= calEnd;

    const msDiff = calEnd.getTime() - calStart.getTime();
    const months = Math.max(1, Math.round(msDiff / (30.44 * 24 * 60 * 60 * 1000)));

    slices.push({
      year: cy - firstYear + 1,
      calendarYear: cy,
      startDate: calStart,
      endDate: calEnd,
      rate,
      phase,
      isCurrent,
      months,
    });
  }

  return slices;
}

export function getCurrentRate(dateDebut: string): { rate: number; yearIndex: number; isExpired: boolean } {
  const start = new Date(dateDebut);
  const today = REFERENCE_DATE;
  const diffMs = today.getTime() - start.getTime();
  const diffYears = diffMs / (365.25 * 24 * 60 * 60 * 1000);

  if (diffYears < 0) return { rate: 100, yearIndex: 0, isExpired: false };
  if (diffYears < 5) return { rate: 100, yearIndex: Math.floor(diffYears), isExpired: false };
  if (diffYears < 6) return { rate: 75, yearIndex: 5, isExpired: false };
  if (diffYears < 7) return { rate: 50, yearIndex: 6, isExpired: false };
  if (diffYears < 8) return { rate: 25, yearIndex: 7, isExpired: false };
  return { rate: 0, yearIndex: 8, isExpired: true };
}

export function getRemainingTime(dateDebut: string): string {
  const timeline = computeDegressiveTimeline(dateDebut);
  const current = timeline.find((s) => s.isCurrent);
  if (!current) {
    const { isExpired } = getCurrentRate(dateDebut);
    if (isExpired) return 'Expire';
    return 'A venir';
  }

  const today = REFERENCE_DATE;
  const endDate = current.endDate;
  const diffMs = endDate.getTime() - today.getTime();
  const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays <= 0) return 'Expire';
  if (diffDays < 30) return `${diffDays}j restants`;
  const months = Math.floor(diffDays / 30);
  return `${months} mois restants`;
}

export function computeEndDate(dateDebut: string): string {
  const start = new Date(dateDebut);
  start.setFullYear(start.getFullYear() + 8);
  start.setDate(start.getDate() - 1);
  return start.toISOString().split('T')[0];
}

export async function fetchExonerations(): Promise<ExonerationWithClient[]> {
  const { data, error } = await supabase
    .from('tax_exemptions')
    .select('*, client:clients!inner(id, nom_entreprise, siren, siret, statut)')
    .order('date_debut', { ascending: false });

  if (error) throw error;
  return (data || []) as unknown as ExonerationWithClient[];
}

export async function createExoneration(payload: {
  client_id: string;
  type_exoneration: string;
  date_debut: string;
  montant?: number | null;
  notes?: string | null;
}) {
  const date_fin = computeEndDate(payload.date_debut);

  const { data, error } = await supabase
    .from('tax_exemptions')
    .insert({
      client_id: payload.client_id,
      type_exoneration: payload.type_exoneration,
      date_debut: payload.date_debut,
      date_fin,
      montant: payload.montant || null,
      notes: payload.notes || null,
      statut: 'actif',
    })
    .select()
    .maybeSingle();

  if (error) throw error;
  return data;
}

export async function updateExoneration(
  id: string,
  payload: {
    client_id?: string;
    type_exoneration?: string;
    date_debut?: string;
    montant?: number | null;
    notes?: string | null;
    statut?: string;
  }
) {
  // `Record<string, unknown>` n'apprend rien a `.update()`, qui refuse ce qu'il
  // ne reconnait pas. Le type de la table dit exactement ce qui est ecrivable.
  const updates: Database['public']['Tables']['tax_exemptions']['Update'] = { ...payload };

  if (payload.date_debut) {
    updates.date_fin = computeEndDate(payload.date_debut);
  }

  const { data, error } = await supabase
    .from('tax_exemptions')
    .update(updates)
    .eq('id', id)
    .select()
    .maybeSingle();

  if (error) throw error;
  return data;
}

export async function deleteExoneration(id: string) {
  const { error } = await supabase
    .from('tax_exemptions')
    .delete()
    .eq('id', id);

  if (error) throw error;
}

export interface ProrataSegment {
  months: number;
  rate: number;
  amount: number;
}

export interface ProrataResult {
  segments: ProrataSegment[];
  totalExonere: number;
  totalImpose: number;
}

/**
 * La ligne de `tax_exemption_results`, avec `detail_calcul` precise.
 *
 * Cette colonne est un `jsonb` : la base la rend en `Json`, type volontairement
 * large. L'interface ecrite a la main annoncait directement un
 * `ProrataSegment[]` et divergeait par ailleurs de la ligne reelle (`created_at`
 * et `updated_at` y sont nullables), si bien qu'aucun `as ExemptionResult` ne
 * passait — TypeScript refusant une conversion entre types trop eloignes.
 *
 * On derive donc de la base, et on ne redit que ce que la base ne peut pas
 * savoir : la forme du JSON. La conversion se fait a la lecture, en un seul
 * endroit (`versResultat`), plutot qu'a chaque appel.
 */
export type ExemptionResult = Omit<
  Database['public']['Tables']['tax_exemption_results']['Row'],
  'detail_calcul'
> & {
  detail_calcul: ProrataSegment[];
};

type LigneResultat = Database['public']['Tables']['tax_exemption_results']['Row'];

/** Seul point ou le `jsonb` est interprete comme une suite de segments. */
function versResultat(ligne: LigneResultat): ExemptionResult {
  return {
    ...ligne,
    detail_calcul: (ligne.detail_calcul ?? []) as unknown as ProrataSegment[],
  };
}

function getFullYearsElapsedCalc(start: Date, target: Date): number {
  let years = target.getFullYear() - start.getFullYear();
  const monthDiff = target.getMonth() - start.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && target.getDate() < start.getDate())) {
    years--;
  }
  return Math.max(0, years);
}

function getRateForYearsCalc(years: number): number {
  if (years < 5) return 100;
  if (years < 6) return 75;
  if (years < 7) return 50;
  if (years < 8) return 25;
  return 0;
}

export function computeResultProrata(
  dateDebut: string,
  calendarYear: number,
  resultat: number
): ProrataResult {
  const start = new Date(dateDebut);
  const timeline = computeDegressiveTimeline(dateDebut);
  const slice = timeline.find((s) => s.calendarYear === calendarYear);

  if (!slice) {
    return { segments: [{ months: 12, rate: 0, amount: 0 }], totalExonere: 0, totalImpose: resultat };
  }

  if (slice.rate === 0) {
    return { segments: [{ months: slice.months, rate: 0, amount: 0 }], totalExonere: 0, totalImpose: resultat };
  }

  const anniversaryMonth = start.getMonth();
  const anniversaryDay = start.getDate();
  const anniversary = new Date(calendarYear, anniversaryMonth, anniversaryDay);

  const yearStart = slice.startDate;
  const yearEnd = slice.endDate;
  const totalMonths = slice.months;

  if (anniversary <= yearStart || anniversary > yearEnd) {
    const fullYears = getFullYearsElapsedCalc(start, yearStart);
    const rate = getRateForYearsCalc(fullYears);
    const exonere = Math.round((resultat * rate) / 100 * 100) / 100;
    return {
      segments: [{ months: totalMonths, rate, amount: exonere }],
      totalExonere: exonere,
      totalImpose: Math.round((resultat - exonere) * 100) / 100,
    };
  }

  const msBeforeAnniv = anniversary.getTime() - yearStart.getTime();
  const msAfterAnniv = yearEnd.getTime() - anniversary.getTime();
  const monthsBefore = Math.max(1, Math.round(msBeforeAnniv / (30.44 * 24 * 60 * 60 * 1000)));
  const monthsAfter = Math.max(1, Math.round(msAfterAnniv / (30.44 * 24 * 60 * 60 * 1000)));
  const totalSegmentMonths = monthsBefore + monthsAfter;

  const fullYearsBefore = getFullYearsElapsedCalc(start, yearStart);
  const fullYearsAfter = getFullYearsElapsedCalc(start, anniversary);
  const rateBefore = getRateForYearsCalc(fullYearsBefore);
  const rateAfter = getRateForYearsCalc(fullYearsAfter);

  if (rateBefore === rateAfter) {
    const exonere = Math.round((resultat * rateBefore) / 100 * 100) / 100;
    return {
      segments: [{ months: totalMonths, rate: rateBefore, amount: exonere }],
      totalExonere: exonere,
      totalImpose: Math.round((resultat - exonere) * 100) / 100,
    };
  }

  const amountBefore = Math.round((resultat * (monthsBefore / totalSegmentMonths) * (rateBefore / 100)) * 100) / 100;
  const amountAfter = Math.round((resultat * (monthsAfter / totalSegmentMonths) * (rateAfter / 100)) * 100) / 100;
  const totalExonere = Math.round((amountBefore + amountAfter) * 100) / 100;

  return {
    segments: [
      { months: monthsBefore, rate: rateBefore, amount: amountBefore },
      { months: monthsAfter, rate: rateAfter, amount: amountAfter },
    ],
    totalExonere,
    totalImpose: Math.round((resultat - totalExonere) * 100) / 100,
  };
}

export async function fetchExemptionResults(taxExemptionId: string): Promise<ExemptionResult[]> {
  const { data, error } = await supabase
    .from('tax_exemption_results')
    .select('*')
    .eq('tax_exemption_id', taxExemptionId)
    .order('calendar_year');

  if (error) throw error;
  return (data || []).map(versResultat);
}

export async function fetchAllExemptionResults(taxExemptionIds: string[]): Promise<ExemptionResult[]> {
  if (taxExemptionIds.length === 0) return [];

  const { data, error } = await supabase
    .from('tax_exemption_results')
    .select('*')
    .in('tax_exemption_id', taxExemptionIds)
    .order('calendar_year');

  if (error) throw error;
  return (data || []).map(versResultat);
}

export async function saveExemptionResult(payload: {
  tax_exemption_id: string;
  calendar_year: number;
  resultat_exercice: number;
  resultat_exonere: number;
  resultat_impose: number;
  detail_calcul: ProrataSegment[];
}): Promise<ExemptionResult> {
  const { data: existing } = await supabase
    .from('tax_exemption_results')
    .select('id')
    .eq('tax_exemption_id', payload.tax_exemption_id)
    .eq('calendar_year', payload.calendar_year)
    .maybeSingle();

  if (existing) {
    const { data, error } = await supabase
      .from('tax_exemption_results')
      .update({
        resultat_exercice: payload.resultat_exercice,
        resultat_exonere: payload.resultat_exonere,
        resultat_impose: payload.resultat_impose,
        detail_calcul: payload.detail_calcul as unknown as Json,
      })
      .eq('id', existing.id)
      .select()
      .maybeSingle();

    if (error) throw error;
    return versResultat(data as LigneResultat);
  }

  const { data, error } = await supabase
    .from('tax_exemption_results')
    .insert({ ...payload, detail_calcul: payload.detail_calcul as unknown as Json })
    .select()
    .maybeSingle();

  if (error) throw error;
  return versResultat(data as LigneResultat);
}

export async function deleteExemptionResult(id: string) {
  const { error } = await supabase
    .from('tax_exemption_results')
    .delete()
    .eq('id', id);

  if (error) throw error;
}

const RESCRIT_BUCKET = 'tax-exemption-docs';
const MAX_RESCRIT_SIZE = 10 * 1024 * 1024;

export async function uploadRescritDocument(
  taxExemptionId: string,
  file: File
): Promise<string> {
  if (file.type !== 'application/pdf') {
    throw new Error('Seuls les fichiers PDF sont acceptes');
  }
  if (file.size > MAX_RESCRIT_SIZE) {
    throw new Error('Le fichier ne doit pas depasser 10 Mo');
  }

  const filePath = `${taxExemptionId}/${crypto.randomUUID()}.pdf`;

  const { error: uploadError } = await supabase.storage
    .from(RESCRIT_BUCKET)
    .upload(filePath, file);

  if (uploadError) throw uploadError;

  const { error: updateError } = await supabase
    .from('tax_exemptions')
    .update({ justificatif_url: filePath })
    .eq('id', taxExemptionId);

  if (updateError) throw updateError;

  return filePath;
}

export async function deleteRescritDocument(taxExemptionId: string, storagePath: string) {
  const { error: storageError } = await supabase.storage
    .from(RESCRIT_BUCKET)
    .remove([storagePath]);

  if (storageError) throw storageError;

  const { error: updateError } = await supabase
    .from('tax_exemptions')
    .update({ justificatif_url: null })
    .eq('id', taxExemptionId);

  if (updateError) throw updateError;
}

export async function downloadRescritDocument(storagePath: string, fileName?: string) {
  const { data, error } = await supabase.storage
    .from(RESCRIT_BUCKET)
    .download(storagePath);

  if (error) throw error;

  const url = URL.createObjectURL(data);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName || 'rescrit-fiscal.pdf';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
