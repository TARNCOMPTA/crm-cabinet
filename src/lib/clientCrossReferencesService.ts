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
      items: (legalActs.data ?? []).map((a: any) => ({
        label: a.act_type || a.act_category || 'Acte',
        sublabel: fmtDate(a.act_date),
      })),
    };
  }

  if ((assemblies.count ?? 0) > 0) {
    results.assemblies = {
      count: assemblies.count ?? 0,
      items: (assemblies.data ?? []).map((a: any) => ({
        label: a.type_ag || 'AG',
        sublabel: fmtDate(a.date_prevue),
      })),
    };
  }

  if ((officers.count ?? 0) > 0) {
    results.officers = {
      count: officers.count ?? 0,
      items: (officers.data ?? []).map((o: any) => ({
        label: o.company_officers?.full_name || 'Dirigeant',
        sublabel: o.role,
      })),
    };
  }

  if ((tasks.count ?? 0) > 0) {
    results.tasks = {
      count: tasks.count ?? 0,
      items: (tasks.data ?? []).map((t: any) => ({
        label: t.titre,
        sublabel: t.statut,
      })),
    };
  }

  if ((bilans.count ?? 0) > 0) {
    results.bilans = {
      count: bilans.count ?? 0,
      items: (bilans.data ?? []).map((b: any) => ({
        label: `Exercice ${b.year}`,
        sublabel: (b.bilan_columns as any)?.name || b.regime_fiscal,
      })),
    };
  }

  if ((habilitations.count ?? 0) > 0) {
    results.habilitations = {
      count: habilitations.count ?? 0,
      items: (habilitations.data ?? []).map((h: any) => ({
        label: h.service,
        sublabel: h.etat || '',
      })),
    };
  }

  if ((exemptions.count ?? 0) > 0) {
    results.exemptions = {
      count: exemptions.count ?? 0,
      items: (exemptions.data ?? []).map((e: any) => ({
        label: e.type_exoneration,
        sublabel: `${e.statut} - ${fmtDate(e.date_fin)}`,
      })),
    };
  }

  if ((opportunities.count ?? 0) > 0) {
    results.opportunities = {
      count: opportunities.count ?? 0,
      items: (opportunities.data ?? []).map((o: any) => ({
        label: o.prospect_name || (o.opportunity_columns as any)?.name || 'Opportunite',
        sublabel: o.montant_estime ? `${Number(o.montant_estime).toLocaleString('fr-FR')} \u20ac` : '',
      })),
    };
  }

  if ((clientSoftware.count ?? 0) > 0) {
    results.software = {
      count: clientSoftware.count ?? 0,
      items: (clientSoftware.data ?? []).map((s: any) => ({
        label: (s.software as any)?.name || 'Logiciel',
        sublabel: (s.software as any)?.category || '',
      })),
    };
  }

  if ((depotComptes.count ?? 0) > 0) {
    results.depot_comptes = {
      count: depotComptes.count ?? 0,
      items: (depotComptes.data ?? []).map((d: any) => ({
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
      items: (meetingNotes.data ?? []).map((n: any) => ({
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
