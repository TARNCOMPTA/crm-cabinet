import { supabase } from './supabase';
import { parLots } from './lots';
import type { Database, Json } from '../types/database';

const BODACC_API_BASE = 'https://bodacc-datadila.opendatasoft.com/api/explore/v2.1';
const DATASET_ID = 'annonces-commerciales';
const PAGE_SIZE = 100;

export interface BodaccDepotRecord {
  id: string;
  dateparution: string;
  registre: string;
  depot: string;
  commercant: string;
  tribunal: string;
  numeroannonce: number;
  familleavis_lib: string;
}

export interface DepotComptesParsed {
  bodacc_id: string;
  date_parution: string | null;
  date_cloture: string | null;
  type_depot: string;
  commercant: string;
  tribunal: string;
  numero_annonce: number | null;
  raw_data: Record<string, unknown>;
}

function parseDepotField(depot: string): { dateCloture: string | null; typeDepot: string } {
  try {
    const parsed = JSON.parse(depot);
    return {
      dateCloture: parsed.dateCloture || null,
      typeDepot: parsed.typeDepot || '',
    };
  } catch {
    return { dateCloture: null, typeDepot: '' };
  }
}

function parseBodaccRecord(record: BodaccDepotRecord): DepotComptesParsed {
  const { dateCloture, typeDepot } = parseDepotField(record.depot || '{}');
  return {
    bodacc_id: record.id,
    date_parution: record.dateparution || null,
    date_cloture: dateCloture,
    type_depot: typeDepot,
    commercant: record.commercant || '',
    tribunal: record.tribunal || '',
    numero_annonce: record.numeroannonce || null,
    raw_data: record as unknown as Record<string, unknown>,
  };
}

async function fetchBodaccPage(siren: string, offset: number): Promise<{ results: BodaccDepotRecord[]; total_count: number }> {
  const where = encodeURIComponent(
    `familleavis_lib="Dépôts des comptes" AND registre like "${siren}"`
  );
  const url = `${BODACC_API_BASE}/catalog/datasets/${DATASET_ID}/records?where=${where}&limit=${PAGE_SIZE}&offset=${offset}&order_by=dateparution%20DESC`;

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`BODACC API error: ${response.status}`);
  }
  return response.json();
}

export async function fetchDepotDesComptes(siren: string): Promise<DepotComptesParsed[]> {
  const cleanSiren = siren.replace(/\s/g, '');
  if (cleanSiren.length !== 9) {
    throw new Error(`SIREN invalide: ${siren}`);
  }

  const allRecords: DepotComptesParsed[] = [];
  let offset = 0;
  let totalCount = 0;

  do {
    const data = await fetchBodaccPage(cleanSiren, offset);
    totalCount = data.total_count;
    const parsed = (data.results || []).map(parseBodaccRecord);
    allRecords.push(...parsed);
    offset += PAGE_SIZE;
  } while (offset < totalCount && offset < 500);

  return allRecords;
}

export async function syncBodaccForClient(
  clientId: string,
  siren: string
): Promise<{ inserted: number; total: number }> {
  const records = await fetchDepotDesComptes(siren);

  if (records.length === 0) {
    await supabase
      .from('clients')
      .update({ last_bodacc_sync: new Date().toISOString() })
      .eq('id', clientId);
    return { inserted: 0, total: 0 };
  }


  const sirenPropre = siren.replace(/\s/g, '');

  /**
   * Dédoublonnage AVANT le regroupement, et non par précaution de style.
   *
   * PostgreSQL refuse qu'un même `INSERT ... ON CONFLICT DO UPDATE` touche deux
   * fois la même ligne : « ON CONFLICT DO UPDATE command cannot affect row a
   * second time ». Écrites une par une, deux annonces de même `bodacc_id` se
   * succédaient sans dommage ; groupées, elles feraient échouer tout le lot.
   *
   * Le cas n'est pas théorique : la pagination de l'API BODACC trie par date de
   * parution, et deux annonces partageant une date peuvent se retrouver à cheval
   * sur deux pages, donc rendues deux fois.
   */
  const parIdentifiant = new Map<string, DepotComptesParsed>();
  for (const record of records) {
    if (record.bodacc_id) parIdentifiant.set(record.bodacc_id, record);
  }

  const lignes = [...parIdentifiant.values()].map((record) => ({
    client_id: clientId,
    siren: sirenPropre,
    date_cloture: record.date_cloture,
    date_parution: record.date_parution,
    type_depot: record.type_depot,
    tribunal: record.tribunal,
    numero_annonce: record.numero_annonce,
    bodacc_id: record.bodacc_id,
    commercant: record.commercant,
    // Colonne `jsonb` : la base la type en `Json`, volontairement large. La
    // conversion dit ce que le compilateur ne peut pas deduire d'une structure
    // applicative — elle ne change rien a ce qui est ecrit.
    raw_data: record.raw_data as unknown as Json,
  }));

  /**
   * Un seul aller-retour par lot, au lieu d'un par annonce.
   *
   * La boucle précédente attendait chaque écriture avant de lancer la suivante :
   * une entreprise avec vingt exercices déposés coûtait vingt allers-retours, et
   * la synchronisation de tout le portefeuille les multipliait par le nombre de
   * clients. Elle avalait en outre chaque erreur — `if (!error) inserted++` —
   * si bien qu'un refus systématique se lisait « 0 enregistrement », sans rien
   * pour distinguer « aucune nouveauté » de « rien n'est passé ».
   *
   * Le lot de 200 borne la taille de la requête : `raw_data` porte l'annonce
   * BODACC entière, et 500 d'un coup feraient un corps inutilement gros.
   */
  const TAILLE_LOT = 200;
  for (let i = 0; i < lignes.length; i += TAILLE_LOT) {
    const { error } = await supabase
      .from('bodacc_depot_comptes')
      .upsert(lignes.slice(i, i + TAILLE_LOT), { onConflict: 'bodacc_id' });
    if (error) throw error;
  }

  await supabase
    .from('clients')
    .update({ last_bodacc_sync: new Date().toISOString() })
    .eq('id', clientId);

  return { inserted: lignes.length, total: records.length };
}

/**
 * Exactement les colonnes que `loadCachedDepotComptes` selectionne. La forme
 * ecrite a la main les declarait toutes non nulles, ce que la table ne garantit
 * pas : la deriver evite de promettre plus que ce qui arrive.
 */
export type ClientDepotComptes = Pick<
  Database['public']['Tables']['bodacc_depot_comptes']['Row'],
  | 'id' | 'client_id' | 'siren' | 'date_cloture' | 'type_depot' | 'date_parution'
  | 'tribunal' | 'numero_annonce' | 'bodacc_id' | 'commercant' | 'created_at'
>;

export async function loadCachedDepotComptes(
  clientIds: string[]
): Promise<ClientDepotComptes[]> {
  if (clientIds.length === 0) return [];

  const lignes = await parLots<ClientDepotComptes>(clientIds, (lot) =>
    supabase
      .from('bodacc_depot_comptes')
      .select('id, client_id, siren, date_cloture, type_depot, date_parution, tribunal, numero_annonce, bodacc_id, commercant, created_at')
      .in('client_id', lot)
      .order('date_cloture', { ascending: false })
  );

  // Chaque lot revient trie, leur concatenation ne l'est pas : on retrie ici,
  // l'appelant attendant une liste globalement ordonnee.
  return lignes.sort((a, b) => (b.date_cloture ?? '').localeCompare(a.date_cloture ?? ''));
}
