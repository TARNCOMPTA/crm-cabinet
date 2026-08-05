import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { useToast } from '../contexts/ToastContext';

interface CollaboratorAssignment {
  client_id: string;
  user_id: string;
  // `client_collaborators.role` : DEFAULT sans NOT NULL, donc nullable.
  role: string | null;
}

export function useCollaboratorAssignments(userId?: string) {
  const [assignments, setAssignments] = useState<CollaboratorAssignment[]>([]);
  const [loading, setLoading] = useState(true);
  const { showToast } = useToast();

  useEffect(() => {
    loadAssignments();
  }, [userId]);

  async function loadAssignments() {
    try {
      setLoading(true);
      let query = supabase
        .from('client_collaborators')
        .select('client_id, user_id, role')
        .limit(5000);

      if (userId) {
        query = query.eq('user_id', userId);
      }

      const { data, error } = await query;

      if (error) throw error;

      setAssignments(data || []);
    } catch (error) {
      showToast('Erreur lors du chargement des affectations', 'error');
    } finally {
      setLoading(false);
    }
  }

  async function assignClient(clientId: string, targetUserId: string, role: string = 'assistant') {
    try {
      const { error } = await supabase
        .from('client_collaborators')
        .insert({
          client_id: clientId,
          user_id: targetUserId,
          role
        });

      if (error) throw error;

      await loadAssignments();
      showToast('Client assigné avec succès', 'success');
      return { success: true };
    } catch (error: any) {
      if (error.code === '23505') {
        showToast('Ce collaborateur est déjà assigné à ce client', 'error');
      } else {
        showToast('Erreur lors de l\'assignation', 'error');
      }
      return { success: false, error };
    }
  }

  async function unassignClient(clientId: string, targetUserId: string) {
    try {
      const { error } = await supabase
        .from('client_collaborators')
        .delete()
        .eq('client_id', clientId)
        .eq('user_id', targetUserId);

      if (error) throw error;

      await loadAssignments();
      showToast('Désassignation réussie', 'success');
      return { success: true };
    } catch (error) {
      showToast('Erreur lors de la désassignation', 'error');
      return { success: false, error };
    }
  }

  async function toggleAssignment(clientId: string, targetUserId: string, isAssigned: boolean) {
    if (isAssigned) {
      return await unassignClient(clientId, targetUserId);
    } else {
      return await assignClient(clientId, targetUserId);
    }
  }

  function isClientAssigned(clientId: string): boolean {
    return assignments.some(a => a.client_id === clientId);
  }

  return {
    assignments,
    loading,
    assignClient,
    unassignClient,
    toggleAssignment,
    isClientAssigned,
    refresh: loadAssignments
  };
}
