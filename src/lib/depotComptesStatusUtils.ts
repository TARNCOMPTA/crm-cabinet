import { Database } from '../types/database';
import { ClientDepotComptes } from './bodaccService';

type Client = Database['public']['Tables']['clients']['Row'];

export type DepotStatus = 'en_regle' | 'ag_a_faire' | 'en_retard' | 'premiere_cloture';

export interface Period {
  dateCloture: string;
  dateLimite: string;
  status: 'deposee' | 'en_retard' | 'a_faire';
}

export interface ClientDepotStatus {
  client: Client;
  status: DepotStatus;
  statusLabel: string;
  dateClotureMois: string;
  clotureMonthIndex: number | null;
  derniereCloture: string | null;
  dernierDepot: string | null;
  dateLimite: string | null;
  note: string | null;
  nombrePeriodesEnRetard: number;
  nombrePeriodesAFaire: number;
  detailPeriodes: Period[];
}

export const STATUS_ORDER: Record<DepotStatus, number> = {
  en_retard: 0,
  ag_a_faire: 1,
  premiere_cloture: 2,
  en_regle: 3,
};

export const STATUS_CONFIG: Record<DepotStatus, { variant: 'success' | 'warning' | 'danger' | 'gray'; label: string }> = {
  en_regle: { variant: 'success', label: 'En regle' },
  ag_a_faire: { variant: 'warning', label: 'AG a faire' },
  en_retard: { variant: 'danger', label: 'En retard' },
  premiere_cloture: { variant: 'gray', label: 'Premiere cloture' },
};

export const MONTH_LABELS = [
  'Janvier', 'Fevrier', 'Mars', 'Avril', 'Mai', 'Juin',
  'Juillet', 'Aout', 'Septembre', 'Octobre', 'Novembre', 'Decembre',
];

export function formatDateFR(dateStr: string | null): string {
  if (!dateStr) return '-';
  return new Date(dateStr).toLocaleDateString('fr-FR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}

export function formatMonthLabel(dateStr: string | null): string {
  if (!dateStr) return 'Non renseignee';
  const d = new Date(dateStr);
  const day = d.getUTCDate();
  const month = d.toLocaleDateString('fr-FR', { month: 'long', timeZone: 'UTC' });
  return `${day} ${month}`;
}

export function addMonths(date: Date, months: number): Date {
  const result = new Date(date);
  result.setUTCMonth(result.getUTCMonth() + months);
  return result;
}

export function toISODate(d: Date): string {
  return d.toISOString().split('T')[0];
}

function getAllClosurePeriods(
  client: Client,
  today: Date
): { dateCloture: string; dateLimite: string }[] {
  if (!client.date_cloture) return [];

  const clotureDate = new Date(client.date_cloture);
  const clotureMonth = clotureDate.getUTCMonth();
  const clotureDay = clotureDate.getUTCDate();
  const currentYear = today.getFullYear();

  const periods: { dateCloture: string; dateLimite: string }[] = [];

  const dateCreation = client.date_creation_entreprise
    ? new Date(client.date_creation_entreprise)
    : null;

  const premiereCloture = client.date_premiere_cloture
    ? new Date(client.date_premiere_cloture)
    : null;

  for (let i = 0; i < 3; i++) {
    const year = currentYear - i;
    const closureDate = new Date(Date.UTC(year, clotureMonth, clotureDay));

    if (premiereCloture && closureDate < premiereCloture) continue;
    if (!premiereCloture && dateCreation && closureDate < dateCreation) continue;
    if (closureDate > today) continue;

    const limitDate = addMonths(closureDate, 6);
    periods.push({
      dateCloture: toISODate(closureDate),
      dateLimite: toISODate(limitDate),
    });
  }

  return periods.reverse();
}

function matchDepotsToClosures(
  periods: { dateCloture: string; dateLimite: string }[],
  clientDepots: ClientDepotComptes[],
  today: Date
): Period[] {
  const todayStr = toISODate(today);

  return periods.map((period) => {
    const periodDate = new Date(period.dateCloture);
    const periodYear = periodDate.getUTCFullYear();
    const periodMonth = periodDate.getUTCMonth();

    const hasDepot = clientDepots.some((d) => {
      if (!d.date_cloture) return false;
      const depotDate = new Date(d.date_cloture);
      return (
        depotDate.getUTCFullYear() === periodYear &&
        depotDate.getUTCMonth() === periodMonth
      );
    });

    if (hasDepot) {
      return { dateCloture: period.dateCloture, dateLimite: period.dateLimite, status: 'deposee' as const };
    }

    if (todayStr > period.dateLimite) {
      return { dateCloture: period.dateCloture, dateLimite: period.dateLimite, status: 'en_retard' as const };
    }

    return { dateCloture: period.dateCloture, dateLimite: period.dateLimite, status: 'a_faire' as const };
  });
}

export function computeStatus(
  client: Client,
  clientDepots: ClientDepotComptes[]
): ClientDepotStatus {
  const today = new Date();

  if (!client.date_cloture) {
    const premiereCloture = client.date_premiere_cloture || null;
    return {
      client,
      status: 'premiere_cloture',
      statusLabel: 'Premiere cloture',
      dateClotureMois: 'Non renseignee',
      clotureMonthIndex: null,
      derniereCloture: premiereCloture,
      dernierDepot: clientDepots[0]?.date_cloture || null,
      dateLimite: premiereCloture ? toISODate(addMonths(new Date(premiereCloture), 6)) : null,
      note: 'Date de cloture manquante',
      nombrePeriodesEnRetard: 0,
      nombrePeriodesAFaire: 0,
      detailPeriodes: [],
    };
  }

  const clotureDate = new Date(client.date_cloture);
  const clotureMonth = clotureDate.getUTCMonth();
  const clotureDay = clotureDate.getUTCDate();

  let lastClotureYear = today.getFullYear();
  const candidateDate = new Date(Date.UTC(lastClotureYear, clotureMonth, clotureDay));
  if (candidateDate > today) lastClotureYear -= 1;

  const premiereCloture = client.date_premiere_cloture
    ? new Date(client.date_premiere_cloture)
    : null;

  if (premiereCloture && premiereCloture > today) {
    return {
      client,
      status: 'premiere_cloture',
      statusLabel: 'Premiere cloture',
      dateClotureMois: formatMonthLabel(client.date_cloture),
      clotureMonthIndex: clotureMonth,
      derniereCloture: client.date_premiere_cloture,
      dernierDepot: clientDepots[0]?.date_cloture || null,
      dateLimite: toISODate(addMonths(premiereCloture, 6)),
      note: 'Premiere cloture prevue',
      nombrePeriodesEnRetard: 0,
      nombrePeriodesAFaire: 0,
      detailPeriodes: [],
    };
  }

  const dateCreation = client.date_creation_entreprise
    ? new Date(client.date_creation_entreprise)
    : null;

  if (dateCreation) {
    const firstPossibleCloture = new Date(Date.UTC(lastClotureYear, clotureMonth, clotureDay));
    if (dateCreation > firstPossibleCloture) {
      const nextCloture = new Date(Date.UTC(lastClotureYear + 1, clotureMonth, clotureDay));
      return {
        client,
        status: 'premiere_cloture',
        statusLabel: 'Premiere cloture',
        dateClotureMois: formatMonthLabel(client.date_cloture),
        clotureMonthIndex: clotureMonth,
        derniereCloture: toISODate(nextCloture),
        dernierDepot: clientDepots[0]?.date_cloture || null,
        dateLimite: toISODate(addMonths(nextCloture, 6)),
        note: 'Premiere cloture prevue',
        nombrePeriodesEnRetard: 0,
        nombrePeriodesAFaire: 0,
        detailPeriodes: [],
      };
    }
  }

  const allPeriods = getAllClosurePeriods(client, today);

  if (allPeriods.length === 0) {
    const nextCloture = premiereCloture || new Date(Date.UTC(lastClotureYear + 1, clotureMonth, clotureDay));
    return {
      client,
      status: 'premiere_cloture',
      statusLabel: 'Premiere cloture',
      dateClotureMois: formatMonthLabel(client.date_cloture),
      clotureMonthIndex: clotureMonth,
      derniereCloture: toISODate(nextCloture),
      dernierDepot: clientDepots[0]?.date_cloture || null,
      dateLimite: toISODate(addMonths(nextCloture, 6)),
      note: 'Premiere cloture prevue',
      nombrePeriodesEnRetard: 0,
      nombrePeriodesAFaire: 0,
      detailPeriodes: [],
    };
  }

  const detailPeriodes = matchDepotsToClosures(allPeriods, clientDepots, today);
  const nombrePeriodesEnRetard = detailPeriodes.filter((p) => p.status === 'en_retard').length;
  const nombrePeriodesAFaire = detailPeriodes.filter((p) => p.status === 'a_faire').length;

  const lastClotureDate = new Date(Date.UTC(lastClotureYear, clotureMonth, clotureDay));
  const lastClotureStr = toISODate(lastClotureDate);
  const limiteStr = toISODate(addMonths(lastClotureDate, 6));
  const latestDepotDate = clientDepots[0]?.date_cloture || null;

  let status: DepotStatus;
  let statusLabel: string;

  if (nombrePeriodesEnRetard > 0) {
    status = 'en_retard';
    statusLabel = 'En retard';
  } else if (nombrePeriodesAFaire > 0) {
    status = 'ag_a_faire';
    statusLabel = 'AG a faire';
  } else {
    status = 'en_regle';
    statusLabel = 'En regle';
  }

  return {
    client,
    status,
    statusLabel,
    dateClotureMois: formatMonthLabel(client.date_cloture),
    clotureMonthIndex: clotureMonth,
    derniereCloture: lastClotureStr,
    dernierDepot: latestDepotDate,
    dateLimite: limiteStr,
    note: null,
    nombrePeriodesEnRetard,
    nombrePeriodesAFaire,
    detailPeriodes,
  };
}
