import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../contexts/ToastContext';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { Select } from '../ui/Select';
import { Plus, X, Users, Loader, ArrowLeftRight } from 'lucide-react';
import { Database } from '../../types/database';
import { useCabinetRoles } from '../../hooks/useCabinetRoles';

type Profile = Database['public']['Tables']['profiles']['Row'] & {
  default_collaborator_role_key?: string | null;
};

interface ExistingCollaborator {
  user_id: string;
  // `client_collaborators.role` : DEFAULT sans NOT NULL, donc nullable.
  role: string | null;
  user?: { prenom: string | null; nom: string | null };
}

interface ClientCollaboratorAssignModalProps {
  isOpen: boolean;
  onClose: () => void;
  clientIds: string[];
  clientNames?: string[];
  existingCollaborators?: ExistingCollaborator[];
  onSaved: () => void;
}

type AssignMode = 'add' | 'replace';

interface PendingCollaborator {
  user_id: string;
  // Le role vient de `client_collaborators.role`, nullable en base.
  role: string | null;
  fullName: string;
}

export function ClientCollaboratorAssignModal({
  isOpen,
  onClose,
  clientIds,
  clientNames = [],
  existingCollaborators = [],
  onSaved,
}: ClientCollaboratorAssignModalProps) {
  const { profile } = useAuth();
  const { showToast } = useToast();
  const { roles, defaultRole } = useCabinetRoles();
  const [users, setUsers] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [selectedUserId, setSelectedUserId] = useState('');
  const [selectedRole, setSelectedRole] = useState<string>('');
  const [pendingCollaborators, setPendingCollaborators] = useState<PendingCollaborator[]>([]);
  const [mode, setMode] = useState<AssignMode>('add');

  useEffect(() => {
    if (!selectedRole && defaultRole) {
      setSelectedRole(defaultRole.key);
    }
  }, [defaultRole, selectedRole]);

  const isSingleClient = clientIds.length === 1;

  useEffect(() => {
    if (isOpen) {
      loadUsers();
      if (isSingleClient && existingCollaborators.length > 0) {
        setPendingCollaborators(
          existingCollaborators.map((c) => ({
            user_id: c.user_id,
            role: c.role,
            fullName: `${c.user?.prenom || ''} ${c.user?.nom || ''}`.trim() || 'Utilisateur',
          }))
        );
        setMode('replace');
      } else {
        setPendingCollaborators([]);
        setMode('add');
      }
    }
  }, [isOpen]);

  async function loadUsers() {
    if (!profile) return;
    setLoading(true);
    const { data, error } = await supabase
      .from('profiles')
      // Le type declare est la ligne complete de `profiles` : la liste partielle
      // ne pouvait pas y correspondre. La table est courte et sans secret.
      .select('*')
      .eq('is_active', true)
      .order('nom');

    if (!error && data) setUsers(data);
    setLoading(false);
  }

  function resolveDefaultRoleKey(user: Profile): string {
    const userKey = user.default_collaborator_role_key;
    if (userKey && roles.some((r) => r.key === userKey)) return userKey;
    return defaultRole?.key || roles[0]?.key || '';
  }

  function handleUserSelected(userId: string) {
    setSelectedUserId(userId);
    if (!userId) return;
    const user = users.find((u) => u.id === userId);
    if (user) {
      const userDefault = resolveDefaultRoleKey(user);
      if (userDefault) setSelectedRole(userDefault);
    }
  }

  function handleAddCollaborator() {
    if (!selectedUserId) return;
    if (pendingCollaborators.some((c) => c.user_id === selectedUserId)) return;

    const user = users.find((u) => u.id === selectedUserId);
    if (!user) return;

    const roleKey = selectedRole || resolveDefaultRoleKey(user);
    setPendingCollaborators((prev) => [
      ...prev,
      {
        user_id: selectedUserId,
        role: roleKey,
        fullName: `${user.prenom || ''} ${user.nom || ''}`.trim() || 'Utilisateur',
      },
    ]);
    setSelectedUserId('');
    setSelectedRole(defaultRole?.key ?? '');
  }

  function handleRemoveCollaborator(userId: string) {
    setPendingCollaborators((prev) => prev.filter((c) => c.user_id !== userId));
  }

  function handleRoleChange(userId: string, role: string) {
    setPendingCollaborators((prev) =>
      prev.map((c) => (c.user_id === userId ? { ...c, role } : c))
    );
  }

  async function handleSave() {
    if (pendingCollaborators.length === 0 && mode === 'add') {
      showToast('Ajoutez au moins un collaborateur', 'error');
      return;
    }

    setSaving(true);
    let successCount = 0;
    const errors: string[] = [];

    try {
      for (const clientId of clientIds) {
        try {
          if (mode === 'replace') {
            const payload = pendingCollaborators.map((c) => ({
              user_id: c.user_id,
              role: c.role,
            }));
            const { error: rpcError } = await supabase.rpc('replace_client_collaborators', {
              p_client_id: clientId,
              p_collaborators: payload,
            });
            if (rpcError) throw rpcError;
          } else if (pendingCollaborators.length > 0) {
            const { data: existing } = await supabase
              .from('client_collaborators')
              .select('user_id')
              .eq('client_id', clientId);

            const existingUserIds = new Set((existing || []).map((e: { user_id: string }) => e.user_id));
            const toInsert = pendingCollaborators
              .filter((c) => !existingUserIds.has(c.user_id))
              .map((c) => ({
                client_id: clientId,
                user_id: c.user_id,
                role: c.role,
              }));

            if (toInsert.length > 0) {
              const { error: insertError } = await supabase
                .from('client_collaborators')
                .insert(toInsert);
              if (insertError) throw insertError;
            }
          }

          successCount++;
        } catch (err: any) {
          errors.push(err?.message || 'Erreur inconnue');
        }
      }

      if (errors.length === 0) {
        showToast(
          isSingleClient
            ? 'Collaborateurs mis a jour'
            : `${successCount} client(s) mis a jour`,
          'success'
        );
        onSaved();
        onClose();
      } else {
        const detail = errors[0];
        showToast(
          `${successCount} succes, ${errors.length} erreur(s) : ${detail}`,
          'error'
        );
      }
    } catch (err: any) {
      showToast(`Erreur lors de la sauvegarde : ${err?.message || 'inconnue'}`, 'error');
    } finally {
      setSaving(false);
    }
  }

  const availableUsers = users.filter(
    (u) => !pendingCollaborators.some((c) => c.user_id === u.id)
  );

  const title = isSingleClient
    ? `Collaborateurs - ${clientNames[0] || 'Client'}`
    : `Affecter des collaborateurs (${clientIds.length} clients)`;

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={title} size="lg">
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader className="w-6 h-6 text-teal-600 animate-spin" />
        </div>
      ) : (
        <div className="space-y-5">
          {!isSingleClient && (
            <div className="flex items-center gap-2 p-3 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg">
              <Users className="w-4 h-4 text-gray-500 dark:text-gray-400 flex-shrink-0" />
              <p className="text-sm text-gray-600 dark:text-gray-400">
                {clientIds.length} clients selectionnes
                {clientNames.length > 0 && clientNames.length <= 5 && (
                  <span className="text-gray-500 dark:text-gray-500">
                    {' '}
                    : {clientNames.join(', ')}
                  </span>
                )}
              </p>
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Mode d'affectation
            </label>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setMode('add')}
                className={`flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg border text-sm font-medium transition-all ${
                  mode === 'add'
                    ? 'bg-teal-50 dark:bg-teal-900/30 border-teal-300 dark:border-teal-700 text-teal-700 dark:text-teal-400'
                    : 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700'
                }`}
              >
                <Plus className="w-4 h-4" />
                Ajouter
              </button>
              <button
                type="button"
                onClick={() => setMode('replace')}
                className={`flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg border text-sm font-medium transition-all ${
                  mode === 'replace'
                    ? 'bg-amber-50 dark:bg-amber-900/30 border-amber-300 dark:border-amber-700 text-amber-700 dark:text-amber-400'
                    : 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700'
                }`}
              >
                <ArrowLeftRight className="w-4 h-4" />
                Remplacer
              </button>
            </div>
            <p className="mt-1.5 text-xs text-gray-500 dark:text-gray-400">
              {mode === 'add'
                ? 'Les collaborateurs seront ajoutes sans modifier les affectations existantes'
                : 'Les affectations existantes seront supprimees et remplacees'}
            </p>
          </div>

          {pendingCollaborators.length > 0 && (
            <div className="space-y-2">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                Collaborateurs a affecter
              </label>
              {pendingCollaborators.map((collab) => (
                <div
                  key={collab.user_id}
                  className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-teal-100 dark:bg-teal-900/40 flex items-center justify-center">
                      <span className="text-sm font-medium text-teal-700 dark:text-teal-400">
                        {collab.fullName
                          .split(' ')
                          .map((n) => n[0])
                          .join('')
                          .toUpperCase()
                          .slice(0, 2)}
                      </span>
                    </div>
                    <span className="text-sm font-medium text-gray-900 dark:text-gray-100">
                      {collab.fullName}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Select
                      value={collab.role ?? ''}
                      onChange={(e) =>
                        handleRoleChange(collab.user_id, e.target.value)
                      }
                      className="text-sm"
                    >
                      {!roles.some((r) => r.key === collab.role) && collab.role && (
                        <option value={collab.role}>
                          {collab.role} (supprime)
                        </option>
                      )}
                      {roles.map((r) => (
                        <option key={r.key} value={r.key}>
                          {r.label}
                        </option>
                      ))}
                    </Select>
                    <button
                      type="button"
                      onClick={() => handleRemoveCollaborator(collab.user_id)}
                      className="p-1 text-gray-400 hover:text-red-600 dark:hover:text-red-400 transition-colors"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {availableUsers.length > 0 && (
            <div className="flex gap-2">
              <Select
                value={selectedUserId}
                onChange={(e) => handleUserSelected(e.target.value)}
                className="flex-1"
              >
                <option value="">Ajouter un collaborateur</option>
                {availableUsers.map((user) => (
                  <option key={user.id} value={user.id}>
                    {user.prenom} {user.nom}
                  </option>
                ))}
              </Select>
              <Select
                value={selectedRole}
                onChange={(e) => setSelectedRole(e.target.value)}
                className="w-36"
              >
                {roles.map((r) => (
                  <option key={r.key} value={r.key}>
                    {r.label}
                  </option>
                ))}
              </Select>
              <Button
                onClick={handleAddCollaborator}
                disabled={!selectedUserId}
                variant="outline"
                className="px-3"
              >
                <Plus className="w-4 h-4" />
              </Button>
            </div>
          )}

          <div className="flex justify-end gap-2 pt-4 border-t border-gray-200 dark:border-gray-700">
            <Button type="button" variant="secondary" onClick={onClose}>
              Annuler
            </Button>
            <Button
              onClick={handleSave}
              disabled={saving || (pendingCollaborators.length === 0 && mode === 'add')}
            >
              {saving ? (
                <>
                  <Loader className="w-4 h-4 mr-2 animate-spin" />
                  Enregistrement...
                </>
              ) : (
                `${mode === 'replace' ? 'Remplacer' : 'Affecter'} ${
                  pendingCollaborators.length
                } collaborateur${pendingCollaborators.length > 1 ? 's' : ''}`
              )}
            </Button>
          </div>
        </div>
      )}
    </Modal>
  );
}
