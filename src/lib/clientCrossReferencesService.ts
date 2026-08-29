import { supabase } from './supabase';

export interface CrossReferenceItem {
  label: string;
  sublabel?: string;
}

export interface CrossReferenceResult {
  count: number;
  items: CrossReferenceItem[];
}

function fmtDate(d: string | null | undefined): string {
  if (!d) return '';
  return new Date(d).toLocaleDateString('fr-FR');
}

/**
 * Les lignes attendues, une par requete, TAILLEES SUR LE `select` correspondant.
 *
 * Elles remplacent onze `(x: any) =>`. Ecrire le type ici plutot que d'importer
 * la ligne complete de `database.ts` dit ce que la requete demande VRAIMENT :
 * ajouter une colonne au `select` sans l'ajouter ici ne compile pas, et l'oubli
 * inverse — lire un champ qu'on n'a pas demande — ne compile pas non plus. C'est
 * precisement ce que `any` laissait passer.
 *
 * Les relations imbriquees (`bilan_columns(name)`, `software(...)`) sont des
 * liens PLUSIEURS-VERS-UN : Supabase rend un objet, pas un tableau. C'est deja
 * ce que le code supposait avec `?.name` ; le type ne fait que le dire.
 */
interface LigneActe { act_type: string | null; act_category: string | null; act_date: string | null }
interface LigneAG { type_ag: string | null; date_prevue: string | null }
interface LigneDirigeant { role: string | null; company_officers: { full_name: string | null } | null }
interface LigneTache { titre: string | null; statut: string | null }
interface LigneBilan { year: number | string | null; regime_fiscal: string | null; bilan_columns: { name: string | null } | null }
interface LigneHabilitation { service: string | null; etat: string | null }
interface LigneExoneration { type_exoneration: string | null; statut: string | null; date_fin: string | null }
interface LigneOpportunite { prospect_name: string | null; montant_estime: number | string | null; opportunity_columns: { name: string | null } | null }
interface LigneLogiciel { software: { name: string | null; category: string | null } | null }
interface LigneDepot { type_depot: string | null; date_cloture: string | null }
interface LigneCompteRendu { objet: string | null; date_rdv: string | null; type_rdv: string | null }

export async function fetchClientCrossReferences(
  clientId: string
): Promise<Record<string, CrossReferenceResult>> {
  const [
    legalActs,
    assemblies,
    officers,
    tasks,
    bilans,
    habilitations,
    exemptions,
    opportunities,
    clientSoftware,
    depotComptes,
    meetingNotes,
  ] = await Promise.all([
    supabase
      .from('legal_acts')
      .select('act_type, act_date, act_category', { count: 'exact' })
      .eq('client_id', clientId)
      .order('act_date', { ascending: false })
      .limit(3),
    supabase
      .from('general_assemblies')
      .select('type_ag, date_prevue, statut', { count: 'exact' })
      .eq('client_id', clientId)
      .order('date_prevue', { ascending: false })
      .limit(3),
    supabase
      .from('officer_companies')
      .select('role, start_date, company_officers(full_name)', { count: 'exact' })
      .eq('client_id', clientId)
      .order('start_date', { ascending: false })
      .limit(3),
    supabase
      .from('tasks')
      .select('titre, statut, priorite', { count: 'exact' })
      .eq('client_id', clientId)
      .eq('is_archived', false)
      .order('created_at', { ascending: false })
      .limit(3),
    supabase
      .from('bilan_cards')
      .select('year, regime_fiscal, bilan_columns(name)', { count: 'exact' })
      .eq('client_id', clientId)
      .order('year', { ascending: false })
      .limit(3),
    supabase
      .from('habilitations')
      .select('service, etat, date_creation_habilitation', { count: 'exact' })
      .eq('client_id', clientId)
      .order('created_at', { ascending: false })
      .limit(3),
    supabase
      .from('tax_exemptions')
      .select('type_exoneration, statut, date_fin', { count: 'exact' })
      .eq('client_id', clientId)
      .order('date_fin', { ascending: false })
      .limit(3),
    supabase
      .from('opportunity_cards')
      .select('prospect_name, montant_estime, opportunity_columns(name)', { count: 'exact' })
      .eq('client_id', clientId)
      .order('created_at', { ascending: false })
      .limit(3),
    supabase
      .from('client_software')
      .select('id, software(name, category)', { count: 'exact' })
      .eq('client_id', clientId)
      .limit(5),
    supabase
      .from('bodacc_depot_comptes')
      .select('date_cloture, date_parution, type_depot', { count: 'exact' })
      .eq('client_id', clientId)
      .order('date_parution', { ascending: false })
      .limit(3),
    supabase
      .from('client_meeting_notes')
      .select('objet, date_rdv, type_rdv', { count: 'exact' })
      .eq('client_id', clientId)
      .order('date_rdv', { ascending: false })
      .limit(3),
  ]);

  const results: Record<string, CrossReferenceResult> = {};

  if ((legalActs.count ?? 0) > 0) {
    results.legal_acts = {
      count: legalActs.count ?? 0,
      items: (legalActs.data ?? []).map((a: LigneActe) => ({
        label: a.act_type || a.act_category || 'Acte',
        sublabel: fmtDate(a.act_date),
      })),
    };
  }

  if ((assemblies.count ?? 0) > 0) {
    results.assemblies = {
      count: assemblies.count ?? 0,
      items: (assemblies.data ?? []).map((a: LigneAG) => ({
        label: a.type_ag || 'AG',
        sublabel: fmtDate(a.date_prevue),
      })),
    };
  }

  if ((officers.count ?? 0) > 0) {
    results.officers = {
      count: officers.count ?? 0,
      items: (officers.data ?? []).map((o: LigneDirigeant) => ({
        label: o.company_officers?.full_name || 'Dirigeant',
        sublabel: o.role ?? '',
      })),
    };
  }

  if ((tasks.count ?? 0) > 0) {
    results.tasks = {
      count: tasks.count ?? 0,
      items: (tasks.data ?? []).map((t: LigneTache) => ({
        label: t.titre || 'Tache',
        sublabel: t.statut ?? '',
      })),
    };
  }

  if ((bilans.count ?? 0) > 0) {
    results.bilans = {
      count: bilans.count ?? 0,
      items: (bilans.data ?? []).map((b: LigneBilan) => ({
        label: `Exercice ${b.year}`,
        sublabel: b.bilan_columns?.name || b.regime_fiscal || '',
      })),
    };
  }

  if ((habilitations.count ?? 0) > 0) {
    results.habilitations = {
      count: habilitations.count ?? 0,
      items: (habilitations.data ?? []).map((h: LigneHabilitation) => ({
        label: h.service || 'Habilitation',
        sublabel: h.etat || '',
      })),
    };
  }

  if ((exemptions.count ?? 0) > 0) {
    results.exemptions = {
      count: exemptions.count ?? 0,
      items: (exemptions.data ?? []).map((e: LigneExoneration) => ({
        label: e.type_exoneration || 'Exoneration',
        sublabel: `${e.statut ?? ''} - ${fmtDate(e.date_fin)}`,
      })),
    };
  }

  if ((opportunities.count ?? 0) > 0) {
    results.opportunities = {
      count: opportunities.count ?? 0,
      items: (opportunities.data ?? []).map((o: LigneOpportunite) => ({
        label: o.prospect_name || o.opportunity_columns?.name || 'Opportunite',
        sublabel: o.montant_estime ? `${Number(o.montant_estime).toLocaleString('fr-FR')} \u20ac` : '',
      })),
    };
  }

  if ((clientSoftware.count ?? 0) > 0) {
    results.software = {
      count: clientSoftware.count ?? 0,
      items: (clientSoftware.data ?? []).map((s: LigneLogiciel) => ({
        label: s.software?.name || 'Logiciel',
        sublabel: s.software?.category || '',
      })),
    };
  }

  if ((depotComptes.count ?? 0) > 0) {
    results.depot_comptes = {
      count: depotComptes.count ?? 0,
      items: (depotComptes.data ?? []).map((d: LigneDepot) => ({
        label: d.type_depot || 'Depot',
        sublabel: fmtDate(d.date_cloture),
      })),
    };
  }

  const typeLabels: Record<string, string> = {
    telephonique: 'Tel.',
    physique: 'Physique',
    visio: 'Visio',
  };
  if ((meetingNotes.count ?? 0) > 0) {
    results.meeting_notes = {
      count: meetingNotes.count ?? 0,
      items: (meetingNotes.data ?? []).map((n: LigneCompteRendu) => ({
        label: n.objet || 'RDV',
        sublabel: [
          n.type_rdv ? typeLabels[n.type_rdv] || n.type_rdv : '',
          fmtDate(n.date_rdv),
        ]
          .filter(Boolean)
          .join(' - '),
      })),
    };
  }

  return results;
}
