import { supabase } from './supabase';
import { Database } from '../types/database';

type MeetingNoteInsert = Database['public']['Tables']['client_meeting_notes']['Insert'];
type MeetingNoteUpdate = Database['public']['Tables']['client_meeting_notes']['Update'];

export type MeetingTypeRdv = 'telephonique' | 'physique' | 'visio';

export const MEETING_TYPE_OPTIONS: { value: MeetingTypeRdv; label: string }[] = [
  { value: 'telephonique', label: 'Telephonique' },
  { value: 'physique', label: 'Physique' },
  { value: 'visio', label: 'Visio' },
];

export interface MeetingNoteWithAuthor {
  id: string;
  client_id: string;
  created_by: string | null;
  date_rdv: string;
  type_rdv: MeetingTypeRdv | null;
  objet: string;
  participants: string | null;
  contenu: string;
  actions_a_suivre: string | null;
  created_at: string;
  updated_at: string;
  author: {
    prenom: string | null;
    nom: string | null;
  } | null;
}

export async function fetchMeetingNotes(clientId: string): Promise<MeetingNoteWithAuthor[]> {
  const { data: notes, error } = await supabase
    .from('client_meeting_notes')
    .select('*')
    .eq('client_id', clientId)
    .order('date_rdv', { ascending: false });

  if (error) throw error;
  if (!notes || notes.length === 0) return [];

  const authorIds = [...new Set(notes.map(n => n.created_by).filter(Boolean))] as string[];

  let authorsMap: Record<string, { prenom: string | null; nom: string | null }> = {};
  if (authorIds.length > 0) {
    const { data: authors } = await supabase
      .from('profiles')
      .select('id, prenom, nom')
      .in('id', authorIds);
    if (authors) {
      for (const a of authors) {
        authorsMap[a.id] = { prenom: a.prenom, nom: a.nom };
      }
    }
  }

  return notes.map(note => ({
    ...note,
    type_rdv: note.type_rdv as MeetingTypeRdv | null,
    author: note.created_by ? authorsMap[note.created_by] ?? null : null,
  }));
}

export async function createMeetingNote(note: MeetingNoteInsert) {
  const { data, error } = await supabase
    .from('client_meeting_notes')
    .insert(note)
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function updateMeetingNote(id: string, updates: MeetingNoteUpdate) {
  const { data, error } = await supabase
    .from('client_meeting_notes')
    .update(updates)
    .eq('id', id)
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function deleteMeetingNote(id: string) {
  const { error } = await supabase
    .from('client_meeting_notes')
    .delete()
    .eq('id', id);

  if (error) throw error;
}
