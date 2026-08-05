import type { Database } from '../types/database';

type Client = Database['public']['Tables']['clients']['Row'];

/**
 * Les champs dont l'absence est suivie.
 *
 * ⚠️ `adresse` EST SORTIE, remplacee par ses composants. Elle est desormais
 * recomposee par le declencheur `clients_composer_adresse` : la laisser ici
 * aurait produit, dans « Fiches incomplètes », un champ de saisie ecrivant une
 * colonne qui ne lui appartient plus — la valeur saisie aurait ete ecrasee au
 * premier enregistrement de la fiche. C'etait le seul vrai risque de perte de
 * saisie de toute la livraison.
 *
 * `adresse_complement`, `pays` et `code_insee` N'ENTRENT PAS : les deux premiers
 * sont legitimement vides chez la plupart des clients, le troisieme est derive.
 * Un champ suivi legitimement vide fabrique de la fausse incompletude.
 *
 * `type_personne` entre : le remplissage le laisse volontairement NULL pour les
 * clients sans forme juridique, et cet ecran est le seul endroit qui les
 * revelera.
 *
 * `tva_intracom` n'entre pas : calcule par la base des que le SIREN existe, donc
 * rempli a ~100 %. Un champ toujours rempli ajoute la meme unite au numerateur
 * et au denominateur — il DILUE le score de ceux qui manquent vraiment.
 * `tva_verif_statut` non plus : « non verifie » n'est pas une donnee manquante,
 * c'est une action non faite.
 */
export type TrackedFieldKey =
  | 'numero_dossier' | 'siren' | 'siret' | 'forme_juridique' | 'regime_fiscal'
  | 'date_cloture' | 'adresse_ligne1' | 'code_postal' | 'ville' | 'type_personne'
  | 'email' | 'telephone' | 'contact_principal'
  | 'code_ape' | 'capital_social' | 'dirigeant' | 'date_creation_entreprise' | 'software';

export type EditableFieldKey = Exclude<TrackedFieldKey, 'software'>;

export interface TrackedField {
  key: TrackedFieldKey;
  label: string;
  shortLabel: string;
  editType: 'text' | 'select' | 'date' | 'number' | 'software';
}

export const TRACKED_FIELDS: TrackedField[] = [
  { key: 'numero_dossier', label: 'N\u00b0 Dossier', shortLabel: 'N\u00b0 Dossier', editType: 'text' },
  { key: 'siren', label: 'SIREN', shortLabel: 'SIREN', editType: 'text' },
  { key: 'siret', label: 'SIRET', shortLabel: 'SIRET', editType: 'text' },
  { key: 'forme_juridique', label: 'Forme juridique', shortLabel: 'F. juridique', editType: 'select' },
  { key: 'regime_fiscal', label: 'Regime fiscal', shortLabel: 'Regime', editType: 'select' },
  { key: 'date_cloture', label: 'Date de cloture', shortLabel: 'Cloture', editType: 'date' },
  { key: 'code_ape', label: 'Code APE', shortLabel: 'APE', editType: 'text' },
  { key: 'adresse_ligne1', label: 'Adresse', shortLabel: 'Adresse', editType: 'text' },
  { key: 'code_postal', label: 'Code postal', shortLabel: 'CP', editType: 'text' },
  { key: 'ville', label: 'Ville', shortLabel: 'Ville', editType: 'text' },
  { key: 'type_personne', label: 'Type de personne', shortLabel: 'Type', editType: 'select' },
  { key: 'email', label: 'Email', shortLabel: 'Email', editType: 'text' },
  { key: 'telephone', label: 'Telephone', shortLabel: 'Tel.', editType: 'text' },
  { key: 'contact_principal', label: 'Contact principal', shortLabel: 'Contact', editType: 'text' },
  { key: 'capital_social', label: 'Capital social', shortLabel: 'Capital', editType: 'number' },
  { key: 'dirigeant', label: 'Dirigeant', shortLabel: 'Dirigeant', editType: 'text' },
  { key: 'date_creation_entreprise', label: 'Date de creation', shortLabel: 'Creation', editType: 'date' },
  { key: 'software', label: 'Logiciels', shortLabel: 'Logiciels', editType: 'software' },
];

export const TOTAL_TRACKED_FIELDS = TRACKED_FIELDS.length;

export const PRIMARY_STAT_FIELDS: TrackedFieldKey[] = [
  'numero_dossier', 'siren', 'forme_juridique', 'regime_fiscal', 'date_cloture', 'software',
];

export const SECONDARY_STAT_FIELDS: TrackedFieldKey[] = [
  'siret', 'adresse_ligne1', 'code_postal', 'ville', 'type_personne',
  'email', 'telephone', 'contact_principal', 'code_ape',
  'capital_social', 'dirigeant', 'date_creation_entreprise',
];

export function isFieldMissing(
  client: Client,
  field: TrackedFieldKey,
  clientSoftwareIds: string[],
): boolean {
  if (field === 'software') return clientSoftwareIds.length === 0;
  if (field === 'capital_social') return client.capital_social === null || client.capital_social === undefined;
  const val = client[field as keyof Client];
  return val === null || val === undefined || (typeof val === 'string' && val.trim() === '');
}

export function getMissingFields(
  client: Client,
  clientSoftwareIds: string[],
): TrackedFieldKey[] {
  return TRACKED_FIELDS
    .map(f => f.key)
    .filter(key => isFieldMissing(client, key, clientSoftwareIds));
}

export function getCompleteness(
  client: Client,
  clientSoftwareIds: string[],
): { filled: number; total: number; percent: number } {
  const missing = getMissingFields(client, clientSoftwareIds).length;
  const filled = TOTAL_TRACKED_FIELDS - missing;
  return {
    filled,
    total: TOTAL_TRACKED_FIELDS,
    percent: Math.round((filled / TOTAL_TRACKED_FIELDS) * 100),
  };
}

export const FIELD_WEIGHT: Record<TrackedFieldKey, number> = {
  numero_dossier: 3,
  siren: 3,
  forme_juridique: 3,
  regime_fiscal: 3,
  date_cloture: 3,
  software: 2,
  siret: 2,
  email: 2,
  telephone: 1,
  contact_principal: 1,
  // L'adresse pese desormais 3 au lieu de 1 : elle est comptee en trois champs.
  // Une adresse totalement absente vaut donc 4,5 apres le x1,5 des clients
  // actifs — en dessous du seuil de criticite (8), et 7,5 avec l'email : aucun
  // client ne devient critique par l'adresse seule. Verifie apres coup.
  adresse_ligne1: 1,
  code_postal: 1,
  ville: 1,
  type_personne: 2,
  code_ape: 1,
  capital_social: 1,
  dirigeant: 1,
  date_creation_entreprise: 1,
};

export const MAX_SCORE = TRACKED_FIELDS.reduce((acc, f) => acc + FIELD_WEIGHT[f.key], 0);
export const CRITICAL_SCORE_THRESHOLD = 8;

export function getCriticalityScore(
  client: Client,
  clientSoftwareIds: string[],
): number {
  const missing = getMissingFields(client, clientSoftwareIds);
  const base = missing.reduce((acc, key) => acc + FIELD_WEIGHT[key], 0);
  return client.statut === 'actif' ? base * 1.5 : base;
}

export function isCritical(
  client: Client,
  clientSoftwareIds: string[],
): boolean {
  return getCriticalityScore(client, clientSoftwareIds) >= CRITICAL_SCORE_THRESHOLD;
}

export type ValidationLevel = 'valid' | 'warning' | 'invalid';

export interface ValidationResult {
  level: ValidationLevel;
  message?: string;
}

const DIGITS_ONLY_RE = /^\d+$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_RE = /^(?:\+?\d[\d\s.\-()]{7,})$/;
const APE_RE = /^\d{4}[A-Z]$/;

/**
 * Les deux cles de controle vivent desormais dans `src/lib/cles.ts`.
 *
 * Elles etaient ici en DEUX corps identiques au controle de longueur pres, et
 * sans aucun test. Le module separe existe pour deux raisons : reunir ces corps,
 * et casser le cycle qu'un import depuis ce fichier creerait pour `src/lib/tva.ts`
 * — celui-ci importe deja les types de la fiche client.
 *
 * Les deux noms sont REEXPORTES pour ne toucher aucun appelant. Le piege de La
 * Poste, qui explique pourquoi un SIRET produit un `warning` et non un `invalid`,
 * est documente dans `cles.ts` : le lire avant d'y toucher.
 *
 * L'import est distinct de la reexportation : `export … from` ne met pas les noms
 * dans la portee locale, et `validateField` juste en dessous les appelle.
 */
import { luhnLikeSirenChecksum, luhnLikeSiretChecksum } from './cles';

export { luhnLikeSirenChecksum, luhnLikeSiretChecksum };

export function validateField(
  field: EditableFieldKey,
  rawValue: string,
): ValidationResult {
  const value = (rawValue || '').trim();
  if (!value) return { level: 'valid' };
  switch (field) {
    case 'siren': {
      const digits = value.replace(/\s+/g, '');
      if (!DIGITS_ONLY_RE.test(digits)) return { level: 'invalid', message: 'Le SIREN ne doit contenir que des chiffres' };
      if (digits.length !== 9) return { level: 'invalid', message: 'Le SIREN doit faire exactement 9 chiffres' };
      if (!luhnLikeSirenChecksum(digits)) return { level: 'warning', message: 'Cle SIREN incoherente' };
      return { level: 'valid' };
    }
    case 'siret': {
      const digits = value.replace(/\s+/g, '');
      if (!DIGITS_ONLY_RE.test(digits)) return { level: 'invalid', message: 'Le SIRET ne doit contenir que des chiffres' };
      if (digits.length !== 14) return { level: 'invalid', message: 'Le SIRET doit faire exactement 14 chiffres' };
      if (!luhnLikeSiretChecksum(digits)) return { level: 'warning', message: 'Cle SIRET incoherente' };
      return { level: 'valid' };
    }
    case 'email':
      return EMAIL_RE.test(value)
        ? { level: 'valid' }
        : { level: 'invalid', message: 'Format email invalide' };
    case 'telephone':
      return PHONE_RE.test(value)
        ? { level: 'valid' }
        : { level: 'warning', message: 'Format telephone suspect' };
    case 'code_ape':
      return APE_RE.test(value.toUpperCase())
        ? { level: 'valid' }
        : { level: 'warning', message: 'Le code APE attendu est de la forme 6201Z' };
    case 'numero_dossier':
      if (value.length > 50) return { level: 'invalid', message: 'N\u00b0 dossier trop long' };
      return { level: 'valid' };
    case 'capital_social': {
      const n = Number(value);
      if (Number.isNaN(n)) return { level: 'invalid', message: 'Capital social doit etre un nombre' };
      if (n < 0) return { level: 'invalid', message: 'Capital social ne peut pas etre negatif' };
      return { level: 'valid' };
    }
    default:
      return { level: 'valid' };
  }
}

export function extractSirenFromSiret(siret: string | null | undefined): string | null {
  if (!siret) return null;
  const digits = siret.replace(/\s+/g, '');
  if (!DIGITS_ONLY_RE.test(digits) || digits.length !== 14) return null;
  return digits.slice(0, 9);
}
