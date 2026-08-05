import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { Database } from '../../types/database';
import { Select } from '../ui/Select';
import { Button } from '../ui/Button';
import { X, Plus } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { useCabinetRoles } from '../../hooks/useCabinetRoles';

type Profile = Database['public']['Tables']['profiles']['Row'] & {
  default_collaborator_role_key?: string | null;
};
type ClientCollaborator = {
  id?: string;
  user_id: string;
  // `client_collaborators.role` : DEFAULT sans NOT NULL, donc nullable.
  role: string | null;
  user?: Profile;
};

interface CollaboratorSelectProps {
  clientId?: string;
  collaborators: ClientCollaborator[];
  onChange: (collaborators: ClientCollaborator[]) => void;
  label?: string;
}

export function CollaboratorSelect({ collaborators, onChange, label = 'Collaborateurs' }: CollaboratorSelectProps) {
  const { profile } = useAuth();
  const { roles, defaultRole } = useCabinetRoles();
  const [users, setUsers] = useState<Profile[]>([]);
  const [selectedUserId, setSelectedUserId] = useState('');
  const [selectedRole, setSelectedRole] = useState<string>('');

  useEffect(() => {
    loadUsers();
  }, [profile]);

  useEffect(() => {
    if (!selectedRole && defaultRole) {
      setSelectedRole(defaultRole.key);
    }
  }, [defaultRole, selectedRole]);

  async function loadUsers() {
    if (!profile) return;

    const { data, error } = await supabase
      .from('profiles')
      // Le type declare est la ligne complete de `profiles` : la liste partielle
      // ne pouvait pas y correspondre. La table est courte et sans secret.
      .select('*')
      .eq('is_active', true)
      .order('nom');

    if (!error && data) {
      setUsers(data);
    }
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

  function handleAdd() {
    if (!selectedUserId) return;

    const alreadyAdded = collaborators.some(c => c.user_id === selectedUserId);
    if (alreadyAdded) return;

    const user = users.find(u => u.id === selectedUserId);
    if (!user) return;

    const roleKey = selectedRole || resolveDefaultRoleKey(user);

    onChange([
      ...collaborators,
      {
        user_id: selectedUserId,
        role: roleKey,
        user
      }
    ]);

    setSelectedUserId('');
    setSelectedRole(defaultRole?.key ?? '');
  }

  function handleRemove(userId: string) {
    onChange(collaborators.filter(c => c.user_id !== userId));
  }

  function handleRoleChange(userId: string, role: string) {
    onChange(
      collaborators.map(c =>
        c.user_id === userId ? { ...c, role } : c
      )
    );
  }

  const availableUsers = users.filter(
    u => !collaborators.some(c => c.user_id === u.id)
  );

  return (
    <div>
      {label && (
        <label className="block text-sm font-medium text-gray-700 mb-2">
          {label}
        </label>
      )}

      <div className="space-y-3">
        {collaborators.length > 0 && (
          <div className="space-y-2">
            {collaborators.map((collab) => {
              const user = collab.user || users.find(u => u.id === collab.user_id);
              const roleExists = roles.some((r) => r.key === collab.role);

              return (
                <div
                  key={collab.user_id}
                  className="flex items-center justify-between p-3 bg-gray-50 rounded-lg border border-gray-200"
                >
                  <div className="flex items-center space-x-3">
                    <div className="w-8 h-8 rounded-full bg-teal-100 flex items-center justify-center">
                      <span className="text-sm font-medium text-teal-700">
                        {user?.prenom?.[0]}{user?.nom?.[0]}
                      </span>
                    </div>
                    <div>
                      <p className="text-sm font-medium text-gray-900">
                        {user?.prenom} {user?.nom}
                      </p>
                      <p className="text-xs text-gray-500">{user?.email}</p>
                    </div>
                  </div>
                  <div className="flex items-center space-x-2">
                    <Select
                      value={collab.role ?? ''}
                      onChange={(e) => handleRoleChange(collab.user_id, e.target.value)}
                      className="text-sm"
                    >
                      {!roleExists && collab.role && (
                        <option value={collab.role}>
                          {collab.role} (supprime)
                        </option>
                      )}
                      {roles.map((role) => (
                        <option key={role.key} value={role.key}>
                          {role.label}
                        </option>
                      ))}
                    </Select>
                    <button
                      onClick={() => handleRemove(collab.user_id)}
                      className="p-1 text-gray-400 hover:text-red-600 transition-colors"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {availableUsers.length > 0 && (
          <div className="flex space-x-2">
            <Select
              value={selectedUserId}
              onChange={(e) => handleUserSelected(e.target.value)}
              className="flex-1"
            >
              <option value="">Ajouter un collaborateur</option>
              {availableUsers.map(user => (
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
              {roles.map((role) => (
                <option key={role.key} value={role.key}>
                  {role.label}
                </option>
              ))}
            </Select>
            <Button
              onClick={handleAdd}
              disabled={!selectedUserId}
              variant="outline"
              className="px-3"
            >
              <Plus className="w-4 h-4" />
            </Button>
          </div>
        )}

        {collaborators.length === 0 && availableUsers.length === 0 && (
          <p className="text-sm text-gray-500 text-center py-4">
            Aucun collaborateur disponible
          </p>
        )}
      </div>
    </div>
  );
}
