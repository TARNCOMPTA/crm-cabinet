import { useEffect, useMemo, useState } from 'react';
import { Plus, CreditCard as Edit2, Trash2, Star, Users as Users2, Shield, UsersRound } from 'lucide-react';
import { Card, CardContent } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { Modal } from '../../components/ui/Modal';
import { Select } from '../../components/ui/Select';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../contexts/ToastContext';
import { supabase } from '../../lib/supabase';
import { CollaboratorAvatar } from '../../components/ui/CollaboratorAvatar';
import { codeErreur } from '../../lib/erreurs';
import {
  type CabinetCollaboratorRole,
  type RoleColor,
  ROLE_COLORS,
  countRoleUsage,
  createCabinetRole,
  deleteCabinetRole,
  getRoleColorClasses,
  getRoleDotClass,
  listCabinetRoles,
  reassignRoleUsage,
  setDefaultCabinetRole,
  slugifyRoleKey,
  updateCabinetRole,
} from '../../lib/cabinetRolesService';

export function SettingsCollaboratorRoles() {
  const { profile, isAdmin } = useAuth();
  const { showToast } = useToast();
  const canEdit = isAdmin;

  const [roles, setRoles] = useState<CabinetCollaboratorRole[]>([]);
  const [usage, setUsage] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);

  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<CabinetCollaboratorRole | null>(null);
  const [form, setForm] = useState<{ label: string; color: RoleColor; description: string }>({
    label: '',
    color: 'teal',
    description: '',
  });

  const [deleteTarget, setDeleteTarget] = useState<CabinetCollaboratorRole | null>(null);
  const [reassignTo, setReassignTo] = useState<string>('');

  // La requete demande bien `avatar_color` et `is_active` ; seul ce type les
  // ignorait, alors que l'ecran lit la couleur pour la pastille.
  type UserRow = {
    id: string;
    prenom: string | null;
    nom: string | null;
    email: string;
    avatar_color: string | null;
    is_active: boolean;
    default_collaborator_role_key: string | null;
  };
  const [showUsersModal, setShowUsersModal] = useState(false);
  const [usersByRole, setUsersByRole] = useState<UserRow[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(false);

  useEffect(() => {
    void load();
  }, [profile]);

  async function load() {
    if (!profile) {
      setLoading(false);
      return;
    }
    setLoading(true);
    const list = await listCabinetRoles();
    setRoles(list);
    const usageMap: Record<string, number> = {};
    for (const r of list) {
      usageMap[r.key] = await countRoleUsage(r.key);
    }
    setUsage(usageMap);
    setLoading(false);
  }

  async function openUsersModal() {
    if (!profile) return;
    setShowUsersModal(true);
    setLoadingUsers(true);
    const { data, error } = await supabase
      .from('profiles')
      .select('id, prenom, nom, email, avatar_color, default_collaborator_role_key, is_active')
      .eq('is_active', true)
      .order('nom');
    if (error) {
      showToast(`Erreur : ${error.message}`, 'error');
      setUsersByRole([]);
    } else {
      setUsersByRole((data || []) as UserRow[]);
    }
    setLoadingUsers(false);
  }

  async function setUserDefaultRole(userId: string, key: string) {
    const previous = usersByRole;
    setUsersByRole((prev) =>
      prev.map((u) => (u.id === userId ? { ...u, default_collaborator_role_key: key || null } : u))
    );
    const { error } = await supabase
      .from('profiles')
      .update({ default_collaborator_role_key: key || null })
      .eq('id', userId);
    if (error) {
      setUsersByRole(previous);
      showToast(`Erreur : ${error.message}`, 'error');
      return;
    }
    showToast('Rôle par défaut mis à jour', 'success');
  }

  const groupedUsers = useMemo(() => {
    const map = new Map<string, UserRow[]>();
    for (const r of roles) map.set(r.key, []);
    const orphans: UserRow[] = [];
    const noDefault: UserRow[] = [];
    for (const u of usersByRole) {
      const k = u.default_collaborator_role_key;
      if (!k) {
        noDefault.push(u);
      } else if (map.has(k)) {
        map.get(k)!.push(u);
      } else {
        orphans.push(u);
      }
    }
    return { map, orphans, noDefault };
  }, [roles, usersByRole]);

  function openCreate() {
    setEditing(null);
    setForm({ label: '', color: 'teal', description: '' });
    setShowModal(true);
  }

  function openEdit(role: CabinetCollaboratorRole) {
    setEditing(role);
    setForm({
      label: role.label,
      color: role.color as RoleColor,
      description: role.description ?? '',
    });
    setShowModal(true);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!profile) return;

    const label = form.label.trim();
    if (!label) {
      showToast('Le libelle est obligatoire', 'error');
      return;
    }

    try {
      if (editing) {
        await updateCabinetRole(editing.id, {
          label,
          color: form.color,
          description: form.description.trim() || null,
        });
        showToast('Role mis a jour', 'success');
      } else {
        const baseKey = slugifyRoleKey(label) || `role_${Date.now()}`;
        let key = baseKey;
        let i = 2;
        const existingKeys = new Set(roles.map((r) => r.key));
        while (existingKeys.has(key)) {
          key = `${baseKey}_${i++}`;
        }
        await createCabinetRole({
          key,
          label,
          color: form.color,
          description: form.description.trim() || null,
          position: roles.length,
          is_default: roles.length === 0,
        });
        showToast('Role cree', 'success');
      }
      setShowModal(false);
      await load();
    } catch (err) {
      const message = codeErreur(err) === '23505'
        ? 'Un role avec ce libelle existe deja'
        : 'Erreur lors de l\'enregistrement';
      showToast(message, 'error');
    }
  }

  async function handleSetDefault(role: CabinetCollaboratorRole) {
    if (!profile) return;
    try {
      await setDefaultCabinetRole(role.id);
      showToast(`"${role.label}" est maintenant le role par defaut`, 'success');
      await load();
    } catch {
      showToast('Erreur lors de la mise a jour', 'error');
    }
  }

  function openDelete(role: CabinetCollaboratorRole) {
    setDeleteTarget(role);
    const fallback = roles.find((r) => r.id !== role.id);
    setReassignTo(fallback?.key ?? '');
  }

  async function handleConfirmDelete() {
    if (!deleteTarget || !profile) return;
    if (deleteTarget.is_default) {
      showToast('Impossible de supprimer le role par defaut', 'error');
      return;
    }
    const count = usage[deleteTarget.key] ?? 0;
    try {
      if (count > 0) {
        if (!reassignTo) {
          showToast('Selectionnez un role de remplacement', 'error');
          return;
        }
        await reassignRoleUsage(deleteTarget.key, reassignTo);
      }
      await deleteCabinetRole(deleteTarget.id);
      showToast('Role supprime', 'success');
      setDeleteTarget(null);
      await load();
    } catch {
      showToast('Erreur lors de la suppression', 'error');
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-teal-600"></div>
      </div>
    );
  }

  if (!profile) {
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <Users2 className="w-12 h-12 text-gray-400 mx-auto mb-4" />
          <p className="text-gray-900 font-medium">Aucun cabinet assigne</p>
        </CardContent>
      </Card>
    );
  }

  if (!canEdit) {
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <Shield className="w-12 h-12 text-gray-400 mx-auto mb-4" />
          <p className="text-gray-900 font-medium mb-2">Acces restreint</p>
          <p className="text-gray-500">
            Seuls les administrateurs du cabinet peuvent gerer les roles des collaborateurs.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Roles des collaborateurs</h2>
          <p className="text-gray-600 dark:text-gray-400 mt-1">
            Personnalisez les roles assignables aux collaborateurs sur les dossiers (Responsable, Assistant, Chef de mission, etc.)
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={openUsersModal}>
            <UsersRound className="w-4 h-4 mr-2" />
            Vue par utilisateur
          </Button>
          <Button onClick={openCreate}>
            <Plus className="w-4 h-4 mr-2" />
            Nouveau role
          </Button>
        </div>
      </div>

      {roles.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <Users2 className="w-12 h-12 text-gray-400 mx-auto mb-4" />
            <p className="text-gray-900 font-medium mb-2">Aucun role configure</p>
            <Button onClick={openCreate}>
              <Plus className="w-4 h-4 mr-2" />
              Creer un role
            </Button>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-gray-200 dark:border-gray-700">
                    <th className="text-left py-3 px-4 font-medium text-gray-700 dark:text-gray-300">Role</th>
                    <th className="text-left py-3 px-4 font-medium text-gray-700 dark:text-gray-300">Description</th>
                    <th className="text-left py-3 px-4 font-medium text-gray-700 dark:text-gray-300">Utilisations</th>
                    <th className="text-left py-3 px-4 font-medium text-gray-700 dark:text-gray-300">Par defaut</th>
                    <th className="text-right py-3 px-4 font-medium text-gray-700 dark:text-gray-300">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {roles.map((role) => (
                    <tr key={role.id} className="border-b border-gray-100 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-800/50">
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-2">
                          <span className={`w-2.5 h-2.5 rounded-full ${getRoleDotClass(role.color)}`} />
                          <span
                            className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getRoleColorClasses(role.color)}`}
                          >
                            {role.label}
                          </span>
                        </div>
                      </td>
                      <td className="py-3 px-4">
                        <span className="text-sm text-gray-600 dark:text-gray-400">
                          {role.description || '-'}
                        </span>
                      </td>
                      <td className="py-3 px-4">
                        <span className="text-sm text-gray-700 dark:text-gray-300">
                          {usage[role.key] ?? 0}
                        </span>
                      </td>
                      <td className="py-3 px-4">
                        {role.is_default ? (
                          <span className="inline-flex items-center gap-1 text-xs font-medium text-amber-700 dark:text-amber-400">
                            <Star className="w-3.5 h-3.5 fill-current" />
                            Par defaut
                          </span>
                        ) : (
                          <button
                            type="button"
                            onClick={() => handleSetDefault(role)}
                            className="text-xs text-gray-500 hover:text-teal-600 dark:hover:text-teal-400 transition-colors"
                          >
                            Definir
                          </button>
                        )}
                      </td>
                      <td className="py-3 px-4">
                        <div className="flex items-center justify-end gap-1">
                          <Button size="sm" variant="ghost" onClick={() => openEdit(role)}>
                            <Edit2 className="w-4 h-4" />
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => openDelete(role)}
                            disabled={role.is_default}
                            title={role.is_default ? 'Impossible de supprimer le role par defaut' : 'Supprimer'}
                          >
                            <Trash2 className={`w-4 h-4 ${role.is_default ? 'text-gray-300' : 'text-red-600'}`} />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      <Modal
        isOpen={showModal}
        onClose={() => setShowModal(false)}
        title={editing ? 'Modifier le role' : 'Nouveau role'}
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          <Input
            label="Libelle"
            value={form.label}
            onChange={(e) => setForm({ ...form, label: e.target.value })}
            required
            placeholder="Ex: Chef de mission"
          />

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Couleur
            </label>
            <div className="grid grid-cols-4 gap-2">
              {ROLE_COLORS.map((c) => (
                <button
                  key={c.value}
                  type="button"
                  onClick={() => setForm({ ...form, color: c.value })}
                  className={`flex items-center justify-center gap-2 px-3 py-2 rounded-lg border text-sm transition-all ${
                    form.color === c.value
                      ? 'border-teal-500 ring-2 ring-teal-200 dark:ring-teal-900/50'
                      : 'border-gray-200 dark:border-gray-700 hover:border-gray-300'
                  }`}
                >
                  <span className={`w-3 h-3 rounded-full ${c.dotClass}`} />
                  <span className="text-gray-700 dark:text-gray-300">{c.label}</span>
                </button>
              ))}
            </div>
            <div className="mt-3">
              <span
                className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getRoleColorClasses(form.color)}`}
              >
                {form.label || 'Apercu'}
              </span>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Description
            </label>
            <textarea
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              placeholder="Description optionnelle du role"
              rows={2}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-teal-500 focus:border-transparent"
            />
          </div>

          <div className="flex justify-end gap-2 mt-6">
            <Button type="button" variant="secondary" onClick={() => setShowModal(false)}>
              Annuler
            </Button>
            <Button type="submit">{editing ? 'Mettre a jour' : 'Creer'}</Button>
          </div>
        </form>
      </Modal>

      <Modal
        isOpen={showUsersModal}
        onClose={() => setShowUsersModal(false)}
        title="Rôles par défaut des utilisateurs"
        size="lg"
      >
        {loadingUsers ? (
          <div className="flex items-center justify-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-teal-600" />
          </div>
        ) : (
          <div className="space-y-5">
            <p className="text-sm text-gray-600 dark:text-gray-400">
              Pour chaque rôle, retrouvez les utilisateurs qui l'ont défini comme rôle par défaut. Vous pouvez aussi le modifier directement ici.
            </p>

            {roles.map((role) => {
              const list = groupedUsers.map.get(role.key) || [];
              return (
                <div key={role.id} className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
                  <div className="flex items-center justify-between bg-gray-50 dark:bg-gray-800/50 px-4 py-2.5 border-b border-gray-200 dark:border-gray-700">
                    <div className="flex items-center gap-2">
                      <span className={`w-2.5 h-2.5 rounded-full ${getRoleDotClass(role.color)}`} />
                      <span
                        className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getRoleColorClasses(role.color)}`}
                      >
                        {role.label}
                      </span>
                      {role.is_default && (
                        <span className="inline-flex items-center gap-1 text-xs text-amber-700 dark:text-amber-400">
                          <Star className="w-3 h-3 fill-current" />
                          Par défaut cabinet
                        </span>
                      )}
                    </div>
                    <span className="text-xs text-gray-500 dark:text-gray-400">
                      {list.length} utilisateur{list.length > 1 ? 's' : ''}
                    </span>
                  </div>
                  {list.length === 0 ? (
                    <p className="text-sm text-gray-500 dark:text-gray-400 italic px-4 py-3">
                      Aucun utilisateur n'a ce rôle comme défaut
                    </p>
                  ) : (
                    <ul className="divide-y divide-gray-100 dark:divide-gray-800">
                      {list.map((u) => (
                        <li key={u.id} className="flex items-center justify-between gap-3 px-4 py-2.5">
                          <div className="flex items-center gap-3 min-w-0">
                            <CollaboratorAvatar
                              userId={u.id}
                              fullName={`${u.prenom || ''} ${u.nom || ''}`}
                              avatarColor={u.avatar_color}
                              size="small"
                              showTooltip={false}
                            />
                            <div className="min-w-0">
                              <p className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">
                                {u.prenom} {u.nom}
                              </p>
                              <p className="text-xs text-gray-500 dark:text-gray-400 truncate">{u.email}</p>
                            </div>
                          </div>
                          <Select
                            value={u.default_collaborator_role_key || ''}
                            onChange={(e) => setUserDefaultRole(u.id, e.target.value)}
                            className="text-sm w-44 flex-shrink-0"
                          >
                            <option value="">Cabinet (par défaut)</option>
                            {roles.map((r) => (
                              <option key={r.key} value={r.key}>
                                {r.label}
                              </option>
                            ))}
                          </Select>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              );
            })}

            {groupedUsers.noDefault.length > 0 && (
              <div className="border border-dashed border-gray-300 dark:border-gray-700 rounded-lg overflow-hidden">
                <div className="flex items-center justify-between bg-gray-50 dark:bg-gray-800/50 px-4 py-2.5 border-b border-gray-200 dark:border-gray-700">
                  <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                    Aucun rôle défini (utilisera le rôle par défaut du cabinet)
                  </span>
                  <span className="text-xs text-gray-500 dark:text-gray-400">
                    {groupedUsers.noDefault.length}
                  </span>
                </div>
                <ul className="divide-y divide-gray-100 dark:divide-gray-800">
                  {groupedUsers.noDefault.map((u) => (
                    <li key={u.id} className="flex items-center justify-between gap-3 px-4 py-2.5">
                      <div className="flex items-center gap-3 min-w-0">
                        <CollaboratorAvatar
                          userId={u.id}
                          fullName={`${u.prenom || ''} ${u.nom || ''}`}
                          avatarColor={u.avatar_color}
                          size="small"
                          showTooltip={false}
                        />
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">
                            {u.prenom} {u.nom}
                          </p>
                          <p className="text-xs text-gray-500 dark:text-gray-400 truncate">{u.email}</p>
                        </div>
                      </div>
                      <Select
                        value=""
                        onChange={(e) => setUserDefaultRole(u.id, e.target.value)}
                        className="text-sm w-44 flex-shrink-0"
                      >
                        <option value="">Cabinet (par défaut)</option>
                        {roles.map((r) => (
                          <option key={r.key} value={r.key}>
                            {r.label}
                          </option>
                        ))}
                      </Select>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {groupedUsers.orphans.length > 0 && (
              <div className="border border-amber-300 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/20 rounded-lg p-4">
                <p className="text-sm font-medium text-amber-800 dark:text-amber-300 mb-2">
                  Rôles obsolètes ({groupedUsers.orphans.length})
                </p>
                <p className="text-xs text-amber-700 dark:text-amber-400 mb-3">
                  Ces utilisateurs référencent un rôle qui n'existe plus. Réaffectez-les à un rôle valide.
                </p>
                <ul className="space-y-2">
                  {groupedUsers.orphans.map((u) => (
                    <li key={u.id} className="flex items-center justify-between gap-3">
                      <span className="text-sm text-gray-900 dark:text-gray-100">
                        {u.prenom} {u.nom}{' '}
                        <span className="text-xs text-gray-500">
                          (clé : {u.default_collaborator_role_key})
                        </span>
                      </span>
                      <Select
                        value=""
                        onChange={(e) => setUserDefaultRole(u.id, e.target.value)}
                        className="text-sm w-44 flex-shrink-0"
                      >
                        <option value="">Cabinet (par défaut)</option>
                        {roles.map((r) => (
                          <option key={r.key} value={r.key}>
                            {r.label}
                          </option>
                        ))}
                      </Select>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <div className="flex justify-end pt-2 border-t border-gray-200 dark:border-gray-700">
              <Button variant="secondary" onClick={() => setShowUsersModal(false)}>
                Fermer
              </Button>
            </div>
          </div>
        )}
      </Modal>

      {deleteTarget && (() => {
        const count = usage[deleteTarget.key] ?? 0;
        const otherRoles = roles.filter((r) => r.id !== deleteTarget.id);
        return (
          <Modal
            isOpen={true}
            onClose={() => setDeleteTarget(null)}
            title="Supprimer le role"
          >
            <div className="space-y-4">
              <p className="text-sm text-gray-700 dark:text-gray-300">
                Vous etes sur le point de supprimer le role <strong>{deleteTarget.label}</strong>.
              </p>
              {count > 0 ? (
                <>
                  <p className="text-sm text-gray-600 dark:text-gray-400">
                    Ce role est actuellement utilise par <strong>{count}</strong> affectation(s).
                    Choisissez un role de remplacement :
                  </p>
                  <Select
                    value={reassignTo}
                    onChange={(e) => setReassignTo(e.target.value)}
                    className="w-full"
                  >
                    <option value="">-- Selectionner --</option>
                    {otherRoles.map((r) => (
                      <option key={r.key} value={r.key}>
                        {r.label}
                      </option>
                    ))}
                  </Select>
                </>
              ) : (
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  Aucune affectation n'utilise ce role. La suppression est sans risque.
                </p>
              )}
              <div className="flex justify-end gap-2 pt-2">
                <Button variant="secondary" onClick={() => setDeleteTarget(null)}>
                  Annuler
                </Button>
                <Button
                  onClick={handleConfirmDelete}
                  disabled={count > 0 && !reassignTo}
                  className="bg-red-600 hover:bg-red-700 text-white"
                >
                  Supprimer
                </Button>
              </div>
            </div>
          </Modal>
        );
      })()}
    </div>
  );
}
