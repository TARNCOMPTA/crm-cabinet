import { supabase } from './supabase';

export interface LegalFormEntry {
  code: string;
  label: string;
  level?: number;
}

let legalFormsCache: Map<string, string> | null = null;
let legalFormsCachePromise: Promise<Map<string, string>> | null = null;

export async function loadLegalFormsCache(): Promise<Map<string, string>> {
  if (legalFormsCache) return legalFormsCache;
  if (legalFormsCachePromise) return legalFormsCachePromise;

  // Un constructeur de requete postgrest-js est « thenable », pas une Promise :
  // il lui manque catch, finally et Symbol.toStringTag. L'affecter a une
  // variable declaree Promise ne compilait donc pas. Passer par une fonction
  // async rend une vraie Promise, et se lit mieux que la chaine de .then().
  legalFormsCachePromise = (async () => {
    const { data, error } = await supabase.from('legal_forms').select('code, label');
    if (error || !data) {
      legalFormsCachePromise = null;
      return new Map<string, string>();
    }
    legalFormsCache = new Map(data.map((form) => [form.code, form.label]));
    return legalFormsCache;
  })();

  return legalFormsCachePromise;
}

let legalFormsFullCache: LegalFormEntry[] | null = null;
let legalFormsFullPromise: Promise<LegalFormEntry[]> | null = null;

export async function loadLegalFormsFull(): Promise<LegalFormEntry[]> {
  if (legalFormsFullCache) return legalFormsFullCache;
  if (legalFormsFullPromise) return legalFormsFullPromise;

  legalFormsFullPromise = (async () => {
    const { data, error } = await supabase
      .from('legal_forms')
      .select('code, label, level')
      .order('code');
    if (error || !data) {
      legalFormsFullPromise = null;
      return [];
    }
    // `level` est nullable en base ; l'entree l'declare optionnel.
    legalFormsFullCache = data.map((f) => ({
      code: f.code,
      label: f.label,
      level: f.level ?? undefined,
    }));
    return legalFormsFullCache;
  })();

  return legalFormsFullPromise;
}

export async function getLegalFormLabel(codeOrLabel: string | null | undefined): Promise<string> {
  if (!codeOrLabel) return '';

  const cache = await loadLegalFormsCache();

  // Si c'est un code numérique, retourner le libellé
  if (cache.has(codeOrLabel)) {
    return cache.get(codeOrLabel)!;
  }

  // Sinon, retourner tel quel (c'est déjà un libellé)
  return codeOrLabel;
}

export function getLegalFormLabelSync(codeOrLabel: string | null | undefined, cache: Map<string, string>): string {
  if (!codeOrLabel) return '';

  if (cache.has(codeOrLabel)) {
    return cache.get(codeOrLabel)!;
  }

  return codeOrLabel;
}

const EI_CODES = new Set(['0', '1', '10', '1000', 'EI', 'ei']);
const EI_LABEL = 'Entrepreneur individuel';

export function isEntrepreneurIndividuel(value: string | null | undefined): boolean {
  if (!value) return false;
  const v = value.trim();
  return EI_CODES.has(v) || v.toLowerCase() === EI_LABEL.toLowerCase();
}

export { EI_LABEL };

let commercialLabelsCache: Set<string> | null = null;
let commercialLabelsCachePromise: Promise<Set<string>> | null = null;

export async function getCommercialCompanyLabels(): Promise<Set<string>> {
  if (commercialLabelsCache) return commercialLabelsCache;
  if (commercialLabelsCachePromise) return commercialLabelsCachePromise;

  commercialLabelsCachePromise = (async () => {
    const { data, error } = await supabase
      .from('legal_forms')
      .select('label')
      .like('code', '5%');
    if (error || !data) {
      commercialLabelsCachePromise = null;
      return new Set<string>();
    }
    commercialLabelsCache = new Set(data.map((f) => f.label));
    return commercialLabelsCache;
  })();

  return commercialLabelsCachePromise;
}

export function isCommercialCompany(formeJuridique: string | null | undefined, labels: Set<string>): boolean {
  if (!formeJuridique || !formeJuridique.trim()) return false;
  if (labels.has(formeJuridique)) return true;
  for (const label of labels) {
    if (formeJuridique.startsWith(label + ',') || formeJuridique.startsWith(label + ' ')) {
      return true;
    }
  }
  return false;
}
