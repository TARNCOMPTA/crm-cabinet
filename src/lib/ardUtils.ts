export function parseNumber(value: string | number | null | undefined): number {
  if (value === null || value === undefined) return 0;
  if (typeof value === 'number') return value;
  const cleaned = value.replace(/\s/g, '').replace(',', '.');
  const num = parseFloat(cleaned);
  return isNaN(num) ? 0 : num;
}

export function formatCurrency(value: number): string {
  return new Intl.NumberFormat('fr-FR', {
    style: 'currency',
    currency: 'EUR',
  }).format(value);
}

export interface ARDInputs {
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
}

export interface ARDResults {
  a1: number;
  aa1: number;
  aa2: number;
  a2: number;
  a3Raw: number;
  a3: number;
  a4: number;
  a5: number;
  amortDeductibles: number;
  hasA6: boolean;
  a6: number;
  regularisation: number;
  regularisationStatus: 'ok' | 'insuffisant' | 'excessif';
  resultatFiscal: number;
  deficitAnneePrecedente: number;
  beneficeImpute: number;
  deficitAnnee: number;
  totalAReporter: number;
}

export function computeARD(inputs: ARDInputs): ARDResults {
  const a1 = inputs.ca;
  const aa1 = inputs.charges_totales;
  const aa2 = inputs.frais_compta + inputs.adhesion_cga + inputs.cfe + inputs.autres_charges;
  const a4 = inputs.amort_immeuble + inputs.amort_mobilier + inputs.amort_derogatoires;

  const a2 = aa1 - aa2;
  const a3Raw = a1 - a2;
  const a3 = Math.max(0, a3Raw);
  const a5Raw = a4 - a3;
  const a5 = Math.min(a4, Math.max(0, a5Raw));
  const amortDeductibles = a4 - a5;

  const hasA6 = inputs.amort_reintegres !== null && inputs.amort_reintegres !== undefined;
  const a6 = hasA6 ? inputs.amort_reintegres! : 0;
  let regularisation = 0;
  let regularisationStatus: 'ok' | 'insuffisant' | 'excessif' = 'ok';
  if (hasA6) {
    regularisation = a5 - a6;
    if (regularisation === 0) regularisationStatus = 'ok';
    else if (regularisation > 0) regularisationStatus = 'insuffisant';
    else regularisationStatus = 'excessif';
  }

  const resultatFiscal = a1 - a2 - amortDeductibles;

  return { a1, aa1, aa2, a2, a3Raw, a3, a4, a5, amortDeductibles, hasA6, a6, regularisation, regularisationStatus, resultatFiscal, deficitAnneePrecedente: 0, beneficeImpute: 0, deficitAnnee: 0, totalAReporter: 0 };
}

export function computeARDWithDeficits(
  inputs: ARDInputs,
  deficitAnneePrecedente: number
): ARDResults {
  const base = computeARD(inputs);
  const rf = base.resultatFiscal;
  const beneficeImpute = Math.min(deficitAnneePrecedente, Math.max(0, rf));
  const deficitAnnee = Math.max(0, -rf);
  const totalAReporter = deficitAnneePrecedente - beneficeImpute + base.a5;

  return {
    ...base,
    deficitAnneePrecedente,
    beneficeImpute,
    deficitAnnee,
    totalAReporter,
  };
}
