export interface ReferenceService {
  name: string;
  category: string;
}

export const SERVICE_CATEGORIES = [
  'TVA',
  'Impot sur les societes',
  'CVAE',
  'RCM',
  'Taxes diverses',
  'Declarations',
  'Consultation & Gestion',
  'Pilier 2',
  'Autres',
] as const;

export const REFERENCE_SERVICES: ReferenceService[] = [
  { name: 'Messagerie', category: 'Consultation & Gestion' },
  { name: 'Consulter le Compte fiscal', category: 'Consultation & Gestion' },
  { name: 'G\u00e9rer mes biens immobiliers', category: 'Consultation & Gestion' },

  { name: 'D\u00e9clarer TVA', category: 'TVA' },
  { name: 'Payer TVA', category: 'TVA' },
  { name: 'Remboursement de TVA UE', category: 'TVA' },
  { name: 'Guichet de TVA UE', category: 'TVA' },
  { name: 'Franchise en base TVA UE', category: 'TVA' },

  { name: "D\u00e9clarer l'Imp\u00f4t sur les soci\u00e9t\u00e9s", category: 'Impot sur les societes' },
  { name: "Payer l'Imp\u00f4t sur les soci\u00e9t\u00e9s", category: 'Impot sur les societes' },

  { name: 'D\u00e9clarer la CVAE', category: 'CVAE' },
  { name: 'Payer la CVAE', category: 'CVAE' },

  { name: 'D\u00e9clarer les RCM', category: 'RCM' },
  { name: 'Payer les RCM', category: 'RCM' },

  { name: 'D\u00e9clarer Taxe activit\u00e9s polluantes', category: 'Taxes diverses' },
  { name: 'Payer Taxe activit\u00e9s polluantes', category: 'Taxes diverses' },
  { name: 'D\u00e9clarer Taxe int. consommation', category: 'Taxes diverses' },
  { name: 'Payer Taxe int. consommation', category: 'Taxes diverses' },
  { name: 'D\u00e9clarer Taxe v. v\u00e9nale immeubles', category: 'Taxes diverses' },
  { name: 'Payer Taxe v. v\u00e9nale immeubles', category: 'Taxes diverses' },
  { name: 'D\u00e9clarer la Taxe sur les salaires', category: 'Taxes diverses' },
  { name: 'Payer la Taxe sur les salaires', category: 'Taxes diverses' },
  { name: 'D\u00e9clarer la TSCA', category: 'Taxes diverses' },
  { name: 'Payer la TSCA', category: 'Taxes diverses' },
  { name: 'D\u00e9clarer la Taxe de s\u00e9jour', category: 'Taxes diverses' },
  { name: 'Payer autres imp\u00f4ts et taxes', category: 'Taxes diverses' },

  { name: 'D\u00e9clarer le R\u00e9sultat', category: 'Declarations' },
  { name: 'D\u00e9clarer Dispositif DAC6', category: 'Declarations' },
  { name: 'Tiers d\u00e9clarants', category: 'Declarations' },
  { name: 'D\u00e9clarer les paiements transfrontaliers - CESOP', category: 'Declarations' },

  { name: "D\u00e9clarer l'imp\u00f4t compl\u00e9mentaire Pilier 2", category: 'Pilier 2' },
  { name: "Payer l'imp\u00f4t compl\u00e9mentaire Pilier 2", category: 'Pilier 2' },
  { name: 'D\u00e9clarer les informations (GIR) Pilier 2', category: 'Pilier 2' },

  { name: 'Amendes pour inexactitudes PAS', category: 'Autres' },
  { name: 'Cession de droits sociaux', category: 'Autres' },
  { name: 'Successions vacantes', category: 'Autres' },
];

export const REFERENCE_SERVICE_NAMES = REFERENCE_SERVICES.map((s) => s.name);

const EXCLUDED_SERVICES = new Set([
  'SUPPRIM\u00c9 : \u00e9co. coll.',
]);

function normalizeQuotes(str: string): string {
  return str.replace(/[\u2018\u2019\u201B`\u2032\u2019]/g, "'").replace(/[\u201C\u201D]/g, '"');
}

export function getCompleteness(clientServices: string[]) {
  const clientSet = new Set(clientServices.map(normalizeQuotes));
  const referenceNormalized = REFERENCE_SERVICES.map((s) => ({
    ...s,
    normalized: normalizeQuotes(s.name),
  }));

  const present: ReferenceService[] = [];
  const missing: ReferenceService[] = [];

  for (const ref of referenceNormalized) {
    if (clientSet.has(ref.normalized)) {
      present.push(ref);
    } else {
      missing.push(ref);
    }
  }

  const total = REFERENCE_SERVICES.length;
  const count = present.length;
  const percentage = total > 0 ? Math.round((count / total) * 100) : 0;

  return { present, missing, count, total, percentage };
}

export function getMissingByCategory(missing: ReferenceService[]) {
  const grouped: Record<string, string[]> = {};
  for (const s of missing) {
    if (!grouped[s.category]) grouped[s.category] = [];
    grouped[s.category].push(s.name);
  }
  return grouped;
}

export function isExcludedService(name: string): boolean {
  return EXCLUDED_SERVICES.has(normalizeQuotes(name));
}
