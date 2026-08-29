/**
 * La liste des clients, demandée page par page au serveur.
 * ---------------------------------------------------------------------------
 * L'écran chargeait tout le portefeuille puis filtrait, triait et paginait en
 * JavaScript. Mesuré sur 403 dossiers : 538 Ko de JSON à chaque ouverture pour
 * n'afficher que cinquante lignes. `/api/clients/liste` fait le travail en SQL
 * et ne rend que la page demandée.
 *
 * ⚠️ CETTE ROUTE N'EST PAS POSTGREST. Trois besoins de l'écran dépassent ce
 * qu'une projection PostgREST sait exprimer — trier par NOMBRE de
 * collaborateurs, exiger TOUS ceux demandés, filtrer sur le MOIS de clôture
 * toutes années confondues. Le détail est dans `server/src/routes/clients.ts`.
 */

import { appelerFonction } from './api/fonctions';
import type { ClientListe } from '../components/clients/colonnesListe';
import type { SortField } from '../hooks/useClientFilters';

export interface DemandeListe {
  recherche: string;
  statut: string;
  regime: string;
  cloture: string;
  collaborateurs: string[];
  archives: boolean;
  mesDossiers: boolean;
  tri: SortField;
  sens: 'asc' | 'desc';
  limite: number;
  decalage: number;
}

export interface PageClients {
  clients: ClientListe[];
  /** Le total APRÈS filtres — ce que la pagination annonce. */
  total: number;
}

export async function chargerPageClients(d: DemandeListe): Promise<PageClients> {
  const p = new URLSearchParams({
    recherche: d.recherche,
    statut: d.statut,
    regime: d.regime,
    cloture: d.cloture,
    collaborateurs: d.collaborateurs.join(','),
    archives: d.archives ? '1' : '0',
    mesDossiers: d.mesDossiers ? '1' : '0',
    tri: d.tri,
    sens: d.sens,
    limite: String(d.limite),
    decalage: String(d.decalage),
  });

  const rep = await appelerFonction<PageClients>(`clients/liste?${p}`, undefined, {
    methode: 'GET',
  });
  if (!rep.ok || !rep.data) {
    throw new Error(rep.message ?? 'Liste des clients indisponible.');
  }
  return rep.data;
}
