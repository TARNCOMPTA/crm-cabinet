/**
 * Dépôts de comptes au BODACC.
 * ---------------------------------------------------------------------------
 * Reprend l'Edge Function `bodacc-sync`, qui n'était appelée que par pg_cron :
 * le front, lui, interroge l'API BODACC directement depuis le navigateur (voir
 * `src/lib/bodaccService.ts`). Ce module sert donc au balayage périodique de
 * tous les clients, pas à la consultation d'une fiche.
 *
 * L'API BODACC est ouverte : pas de clé, pas de compte. Elle limite en revanche
 * le débit, d'où les temporisations conservées de l'original.
 */

import type { FastifyBaseLogger } from 'fastify';
import { requete } from './db.js';

const BASE = 'https://bodacc-datadila.opendatasoft.com/api/explore/v2.1';
const JEU = 'annonces-commerciales';
const TAILLE_PAGE = 100;
/** Au-delà, on a affaire à une entreprise très ancienne : les dépôts récents suffisent. */
const PAGES_MAX = 5;
const PAUSE_PAGE_MS = 500;
/** Clients traités de front. Cinq est la valeur retenue par l'original. */
const LOT = 5;
const PAUSE_LOT_MS = 2000;

interface EnregistrementBodacc {
  id: string;
  dateparution?: string;
  registre?: string;
  depot?: string;
  commercant?: string;
  tribunal?: string;
  numeroannonce?: number;
}

interface Depot {
  bodaccId: string;
  dateParution: string | null;
  dateCloture: string | null;
  typeDepot: string;
  commercant: string;
  tribunal: string;
  numeroAnnonce: number | null;
  brut: EnregistrementBodacc;
}

function attendre(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * Le champ `depot` est un JSON encodé dans une chaîne.
 *
 * C'est ainsi que le BODACC le publie. Un JSON mal formé n'est pas une raison
 * d'abandonner l'enregistrement : on garde l'annonce sans sa date de clôture.
 */
function lireDepot(depot: string): { dateCloture: string | null; typeDepot: string } {
  try {
    const p = JSON.parse(depot) as { dateCloture?: string; typeDepot?: string };
    return { dateCloture: p.dateCloture ?? null, typeDepot: p.typeDepot ?? '' };
  } catch {
    return { dateCloture: null, typeDepot: '' };
  }
}

function convertir(e: EnregistrementBodacc): Depot {
  const { dateCloture, typeDepot } = lireDepot(e.depot ?? '{}');
  return {
    bodaccId: e.id,
    dateParution: e.dateparution ?? null,
    dateCloture,
    typeDepot,
    commercant: e.commercant ?? '',
    tribunal: e.tribunal ?? '',
    numeroAnnonce: e.numeroannonce ?? null,
    brut: e,
  };
}

async function lirePage(
  siren: string,
  decalage: number
): Promise<{ results: EnregistrementBodacc[]; total_count: number }> {
  const filtre = encodeURIComponent(
    `familleavis_lib="Dépôts des comptes" AND registre like "${siren}"`
  );
  const url =
    `${BASE}/catalog/datasets/${JEU}/records?where=${filtre}` +
    `&limit=${TAILLE_PAGE}&offset=${decalage}&order_by=dateparution%20DESC`;

  const rep = await fetch(url);
  if (rep.status === 429) {
    // Débit dépassé : une seule seconde chance, puis on abandonne ce client. Le
    // balayage suivant le reprendra.
    await attendre(5000);
    const seconde = await fetch(url);
    if (!seconde.ok) throw new Error(`BODACC limite le debit (${seconde.status}).`);
    return seconde.json() as Promise<{ results: EnregistrementBodacc[]; total_count: number }>;
  }
  if (!rep.ok) throw new Error(`BODACC a repondu ${rep.status}.`);
  return rep.json() as Promise<{ results: EnregistrementBodacc[]; total_count: number }>;
}

async function lireTousLesDepots(siren: string): Promise<Depot[]> {
  const propre = siren.replace(/\s/g, '');
  if (propre.length !== 9) return [];

  const tous: Depot[] = [];
  let decalage = 0;
  let total = 0;
  let page = 0;

  do {
    const data = await lirePage(propre, decalage);
    total = data.total_count;
    tous.push(...(data.results ?? []).map(convertir));
    decalage += TAILLE_PAGE;
    page++;
    if (decalage < total && page < PAGES_MAX) await attendre(PAUSE_PAGE_MS);
  } while (decalage < total && page < PAGES_MAX);

  return tous;
}

/**
 * Enregistre les dépôts d'un client et rend le nombre de nouveautés.
 *
 * `ON CONFLICT (bodacc_id)` est l'équivalent de l'`upsert` de l'original ;
 * `RETURNING` avec `xmax = 0` distingue les insertions des mises à jour, ce qui
 * évite la requête préalable que faisait l'Edge Function pour connaître les
 * identifiants déjà présents.
 */
export async function synchroniserClient(clientId: string, siren: string): Promise<number> {
  const depots = await lireTousLesDepots(siren);
  const propre = siren.replace(/\s/g, '');

  if (depots.length === 0) {
    await requete('UPDATE clients SET last_bodacc_sync = now() WHERE id = $1', [clientId]);
    return 0;
  }

  let nouveaux = 0;
  for (const d of depots) {
    const r = await requete<{ nouveau: boolean }>(
      `INSERT INTO bodacc_depot_comptes
         (client_id, siren, date_cloture, date_parution, type_depot, tribunal,
          numero_annonce, bodacc_id, commercant, raw_data)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       ON CONFLICT (bodacc_id) DO UPDATE
         SET date_cloture = EXCLUDED.date_cloture,
             date_parution = EXCLUDED.date_parution,
             type_depot = EXCLUDED.type_depot,
             tribunal = EXCLUDED.tribunal,
             numero_annonce = EXCLUDED.numero_annonce,
             commercant = EXCLUDED.commercant,
             raw_data = EXCLUDED.raw_data
       RETURNING xmax = 0 AS nouveau`,
      [
        clientId,
        propre,
        d.dateCloture,
        d.dateParution,
        d.typeDepot,
        d.tribunal,
        d.numeroAnnonce,
        d.bodaccId,
        d.commercant,
        JSON.stringify(d.brut),
      ]
    );
    if (r[0]?.nouveau) nouveaux++;
  }

  await requete('UPDATE clients SET last_bodacc_sync = now() WHERE id = $1', [clientId]);
  return nouveaux;
}

export interface BilanBodacc {
  traites: number;
  nouveaux: number;
  erreurs: number;
  total: number;
}

/**
 * Balaie tous les clients actifs pourvus d'un SIREN.
 *
 * Par lots de cinq, avec deux secondes entre les lots : le BODACC coupe au-delà
 * d'un certain rythme, et un cabinet de 200 clients lancé de front n'obtiendrait
 * que des 429.
 */
export async function synchroniserTous(journal: FastifyBaseLogger): Promise<BilanBodacc> {
  const clients = await requete<{ id: string; siren: string; nom_entreprise: string }>(
    `SELECT id, siren, nom_entreprise
       FROM clients
      WHERE statut = 'actif' AND siren IS NOT NULL AND length(replace(siren, ' ', '')) = 9
      ORDER BY nom_entreprise`
  );

  let traites = 0;
  let nouveaux = 0;
  let erreurs = 0;

  for (let i = 0; i < clients.length; i += LOT) {
    const lot = clients.slice(i, i + LOT);

    const resultats = await Promise.allSettled(
      lot.map((c) => synchroniserClient(c.id, c.siren))
    );

    for (const [j, r] of resultats.entries()) {
      if (r.status === 'fulfilled') {
        traites++;
        nouveaux += r.value;
      } else {
        erreurs++;
        // `allSettled` rend un résultat par entrée, dans l'ordre : `lot[j]`
        // existe forcément. L'accès reste prudent parce que le compilateur ne
        // peut pas le savoir, et un journal ne doit jamais faire tomber un
        // balayage de 200 clients.
        journal.warn(
          `[bodacc] ${lot[j]?.nom_entreprise ?? '(client inconnu)'} : ${
            r.reason instanceof Error ? r.reason.message : String(r.reason)
          }`
        );
      }
    }

    if (i + LOT < clients.length) await attendre(PAUSE_LOT_MS);
  }

  return { traites, nouveaux, erreurs, total: clients.length };
}
