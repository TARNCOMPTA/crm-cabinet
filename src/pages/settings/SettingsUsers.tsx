import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { Card, CardContent, CardHeader } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Badge } from '../../components/ui/Badge';
import { Modal } from '../../components/ui/Modal';
import { Input } from '../../components/ui/Input';
import { Select } from '../../components/ui/Select';
import { Plus, Mail, CircleUser as UserCircle, Settings2, Briefcase, Loader, UserX, UserCheck, Palette, KeyRound, Copy } from 'lucide-react';
import { CollaboratorAvatar } from '../../components/ui/CollaboratorAvatar';
import { AssignmentsManagementModal } from '../../components/settings/AssignmentsManagementModal';
import DeactivateUserModal from '../../components/settings/DeactivateUserModal';
import { reactivateUser } from '../../lib/userDeactivationService';
import { useToast } from '../../contexts/ToastContext';
import { useCabinetRoles } from '../../hooks/useCabinetRoles';
import { AVATAR_COLORS } from '../../lib/collaboratorUtils';
import type { Database } from '../../types/database';

/**
 * La ligne complete, et non un sous-ensemble ecrit a la main.
 *
 * L'interface locale declarait neuf champs quand la requete en ramenait quatorze
 * et que `DeactivateUserModal` en attend la ligne entiere : les deux bouts ne
 * pouvaient pas se rejoindre. C'est le raisonnement deja pose dans
 * AuthContext.tsx — `profiles` n'a ni colonne volumineuse ni secret, et une
 * liste partielle produit un objet qui ne correspond a aucun type.
 */
type Profile = Database['public']['Tables']['profiles']['Row'];

/**
 * Une PROJECTION, pas la ligne entiere : le tableau des affectations ne lit que
 * ces colonnes-la. L'annoncer comme un `Profile` complet obligeait a fabriquer
 * dix champs qu'aucune requete ne rapportait.
 */
interface UserWithAssignments {
  id: string;
  prenom: string | null;
  nom: string | null;
  email: string;
  role: string;
  created_at: string | null;
  avatar_color: string | null;
  is_active: boolean;
  default_collaborator_role_key: string | null;
  assignmentsCount: number;
  clientNames: string[];
}

export function SettingsUsers() {
  const { profile, isAdmin } = useAuth();
  const { showToast } = useToast();
  const { roles: cabinetRoles } = useCabinetRoles();
  const [users, setUsers] = useState<Profile[]>([]);
  const [usersWithAssignments, setUsersWithAssignments] = useState<UserWithAssignments[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingAssignments, setLoadingAssignments] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [showAssignmentsModal, setShowAssignmentsModal] = useState(false);
  const [showDeactivateModal, setShowDeactivateModal] = useState(false);
  const [selectedUser, setSelectedUser] = useState<{ id: string; name: string } | null>(null);
  const [userToDeactivate, setUserToDeactivate] = useState<Profile | null>(null);
  const [formData, setFormData] = useState({
    email: '',
    prenom: '',
    nom: '',
    role: 'user',
  });
  const [colorPickerUserId, setColorPickerUserId] = useState<string | null>(null);

  /**
   * Code d'enrôlement à montrer à l'administrateur.
   *
   * Une modale et non un message éphémère : le code vaut une identité, il est
   * valable une heure, et il faut le lire à voix haute ou le recopier. Un toast
   * qui s'efface au bout de trois secondes le perdrait — c'est exactement ce
   * que faisait l'invitation, qui jetait le code renvoyé par le serveur et
   * annonçait « Invitation envoyée avec succès » alors que le compte était
   * injoignable.
   */
  const [codeEnrolement, setCodeEnrolement] = useState<{
    email: string;
    code: string;
    expireLe: string | null;
  } | null>(null);
  const [codeEnCours, setCodeEnCours] = useState<string | null>(null);

  async function handleGenererCode(user: Profile) {
    setCodeEnCours(user.id);
    try {
      const rep = await fetch('/api/utilisateurs/code-enrolement', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: user.id }),
      });
      const data = await rep.json().catch(() => ({}));

      if (!rep.ok || !data.success) {
        showToast(data.error || `Erreur ${rep.status}`, 'error');
        return;
      }

      // Le serveur ne renvoie le code que si le courriel n'est pas parti : tant
      // qu'il part, c'est lui le canal, et il n'y a pas de raison d'exposer le
      // code à l'écran.
      if (data.codeEnvoye) {
        showToast(`Code envoyé à ${user.email}.`, 'success');
      } else {
        setCodeEnrolement({ email: user.email, code: data.code, expireLe: data.expireLe ?? null });
      }
    } catch (e: any) {
      showToast(e?.message || 'Erreur réseau', 'error');
    } finally {
      setCodeEnCours(null);
    }
  }

  useEffect(() => {
    loadUsers();
    if (isAdmin) {
      loadUsersWithAssignments();
    }
  }, [profile, isAdmin]);

  async function loadUsers() {
    if (!profile) {
      setLoading(false);
      return;
    }

    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setUsers(data || []);
    } catch (error) {
      setUsers([]);
    } finally {
      setLoading(false);
    }
  }

  async function loadUsersWithAssignments() {
    if (!profile) {
      setLoadingAssignments(false);
      return;
    }

    try {
      setLoadingAssignments(true);

      const { data: usersData, error: usersError } = await supabase
        .from('profiles')
        // `avatar_color`, `is_active` et `default_collaborator_role_key` sont
        // lues par le tableau des affectations : elles manquaient a la requete
        // comme a l'objet construit plus bas.
        .select(`
          id, prenom, nom, email, role, created_at, avatar_color, is_active,
          default_collaborator_role_key,
          client_collaborators(
            client:clients(nom_entreprise)
          )
        `)
        .eq('is_active', true)
        .order('nom');

      if (usersError) throw usersError;

      const usersWithCounts: UserWithAssignments[] = (usersData || []).map((user: any) => {
        const clientNames = (user.client_collaborators || [])
          .map((cc: any) => cc.client?.nom_entreprise)
          .filter(Boolean) as string[];
        return {
          id: user.id,
          prenom: user.prenom,
          nom: user.nom,
          email: user.email,
          role: user.role,
          created_at: user.created_at,
          avatar_color: user.avatar_color,
          is_active: user.is_active,
          default_collaborator_role_key: user.default_collaborator_role_key,
          assignmentsCount: clientNames.length,
          clientNames,
        };
      });

      setUsersWithAssignments(usersWithCounts);
    } catch (error) {
      setUsersWithAssignments([]);
    } finally {
      setLoadingAssignments(false);
    }
  }

  const handleOpenAssignmentsModal = (userId: string, prenom: string | null, nom: string | null) => {
    setSelectedUser({
      id: userId,
      name: `${prenom || ''} ${nom || ''}`.trim() || 'Utilisateur'
    });
    setShowAssignmentsModal(true);
  };

  const handleCloseAssignmentsModal = () => {
    setShowAssignmentsModal(false);
    setSelectedUser(null);
  };

  const handleOpenDeactivateModal = (user: Profile) => {
    setUserToDeactivate(user);
    setShowDeactivateModal(true);
  };

  const handleCloseDeactivateModal = () => {
    setShowDeactivateModal(false);
    setUserToDeactivate(null);
  };

  const handleDeactivateSuccess = () => {
    loadUsers();
    if (isAdmin) {
      loadUsersWithAssignments();
    }
  };

  const handleDefaultRoleChange = async (userId: string, key: string) => {
    const previous = users;
    setUsers((prev) =>
      prev.map((u) => (u.id === userId ? { ...u, default_collaborator_role_key: key || null } : u))
    );
    const { error } = await supabase
      .from('profiles')
      .update({ default_collaborator_role_key: key || null })
      .eq('id', userId);
    if (error) {
      setUsers(previous);
      showToast(`Erreur : ${error.message}`, 'error');
      return;
    }
    showToast('Rôle par défaut mis à jour', 'success');
  };

  const handleReactivateUser = async (userId: string) => {
    const result = await reactivateUser(userId);
    if (result.success) {
      showToast('Utilisateur réactivé avec succès', 'success');
      loadUsers();
      if (isAdmin) {
        loadUsersWithAssignments();
      }
    } else {
      showToast(result.error || 'Erreur lors de la réactivation', 'error');
    }
  };

  const handleAvatarColorChange = async (userId: string, color: string | null) => {
    const previous = users;
    setUsers((prev) => prev.map((u) => (u.id === userId ? { ...u, avatar_color: color } : u)));
    const { error } = await supabase
      .from('profiles')
      .update({ avatar_color: color, updated_at: new Date().toISOString() })
      .eq('id', userId);
    if (error) {
      setUsers(previous);
      showToast(`Erreur : ${error.message}`, 'error');
      return;
    }
    showToast('Couleur mise à jour', 'success');
    setColorPickerUserId(null);
  };

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    try {
      // Les deux en-têtes qui figuraient ici — `Bearer ${session.access_token}`
      // et `apikey` — envoyaient littéralement la chaîne « undefined » depuis
      // que la session est un cookie httpOnly. L'appel fonctionnait quand même,
      // par le cookie ; ils ne faisaient que semer le doute.
      const response = await fetch(
        `/api/create-user`,
        {
          method: 'POST',
          credentials: 'same-origin',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            email: formData.email,
            prenom: formData.prenom,
            nom: formData.nom,
            role: formData.role,
          }),
        }
      );

      const data = await response.json();

      if (!response.ok) {
        showToast(data.error || 'Erreur lors de l\'envoi de l\'invitation', 'error');
        return;
      }

      if (data.error) {
        showToast(data.error, 'error');
        return;
      }

      // Le serveur renvoie le code quand le courriel n'est pas parti. L'ancien
      // code l'ignorait et annonçait « Invitation envoyée avec succès » : le
      // compte était créé, personne ne pouvait s'y connecter, et rien ne le
      // disait. On le montre.
      if (data.codeEnvoye === false && data.code) {
        setCodeEnrolement({
          email: data.user?.email ?? formData.email,
          code: data.code,
          expireLe: data.expireLe ?? null,
        });
      } else {
        showToast(data.message || 'Invitation envoyée avec succès', 'success');
      }
      setShowModal(false);
      setFormData({ email: '', prenom: '', nom: '', role: 'user' });
      loadUsers();
      if (isAdmin) {
        loadUsersWithAssignments();
      }
    } catch (error: any) {
      showToast(error.message || 'Erreur lors de l\'envoi de l\'invitation', 'error');
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
          <UserCircle className="w-12 h-12 text-gray-400 mx-auto mb-4" />
          <p className="text-gray-900 font-medium mb-2">Aucun cabinet assigne</p>
          <p className="text-gray-500">
            Contactez un administrateur pour obtenir l'acces a un cabinet.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-gray-600">
          Gerez les membres de votre cabinet
        </p>
        {isAdmin && (
          <Button onClick={() => setShowModal(true)}>
            <Plus className="w-4 h-4 mr-2" />
            Inviter un utilisateur
          </Button>
        )}
      </div>

      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">
                    Utilisateur
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">
                    Email
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">
                    Role
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">
                    Rôle par défaut
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">
                    Statut
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">
                    Date d'ajout
                  </th>
                  {isAdmin && (
                    <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">
                      Actions
                    </th>
                  )}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                {users.map((user) => (
                  <tr key={user.id} className={`hover:bg-gray-50 dark:hover:bg-gray-800/50 ${!user.is_active ? 'opacity-60' : ''}`}>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center">
                        <CollaboratorAvatar
                          userId={user.id}
                          fullName={`${user.prenom || ''} ${user.nom || ''}`}
                          avatarColor={user.avatar_color}
                          size="medium"
                          showTooltip={false}
                        />
                        <div className="ml-4">
                          <div className="text-sm font-medium text-gray-900 dark:text-gray-100">
                            {user.prenom} {user.nom}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center text-sm text-gray-500 dark:text-gray-400">
                        <Mail className="w-4 h-4 mr-2" />
                        {user.email}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <Badge variant={user.role === 'admin' ? 'info' : 'default'}>
                        {user.role === 'admin' ? 'Administrateur' : 'Utilisateur'}
                      </Badge>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      {isAdmin ? (
                        <Select
                          value={user.default_collaborator_role_key || ''}
                          onChange={(e) => handleDefaultRoleChange(user.id, e.target.value)}
                          className="text-sm"
                          disabled={!user.is_active}
                        >
                          <option value="">Cabinet (par défaut)</option>
                          {cabinetRoles.map((r) => (
                            <option key={r.key} value={r.key}>
                              {r.label}
                            </option>
                          ))}
                        </Select>
                      ) : (
                        <span className="text-sm text-gray-600 dark:text-gray-400">
                          {cabinetRoles.find((r) => r.key === user.default_collaborator_role_key)?.label || '—'}
                        </span>
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <Badge variant={user.is_active ? 'success' : 'danger'}>
                        {user.is_active ? 'Actif' : 'Inactif'}
                      </Badge>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                      {user.created_at && new Date(user.created_at).toLocaleDateString('fr-FR')}
                    </td>
                    {isAdmin && (
                      <td className="px-6 py-4 whitespace-nowrap text-right">
                        <div className="flex items-center justify-end gap-2">
                          <div className="relative">
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => setColorPickerUserId(colorPickerUserId === user.id ? null : user.id)}
                              title="Changer la couleur"
                            >
                              <Palette className="w-4 h-4" />
                            </Button>
                            {colorPickerUserId === user.id && (
                              <div className="absolute right-0 top-full mt-2 z-50 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl shadow-xl p-3 w-64">
                                <div className="flex flex-wrap gap-1.5">
                                  {AVATAR_COLORS.map((color) => (
                                    <button
                                      key={color}
                                      type="button"
                                      onClick={() => handleAvatarColorChange(user.id, color)}
                                      className={`w-6 h-6 rounded-full border-2 transition-all hover:scale-125 ${
                                        user.avatar_color === color
                                          ? 'border-gray-900 dark:border-white scale-110'
                                          : 'border-transparent'
                                      }`}
                                      style={{ backgroundColor: color }}
                                    />
                                  ))}
                                </div>
                                {user.avatar_color && (
                                  <button
                                    type="button"
                                    onClick={() => handleAvatarColorChange(user.id, null)}
                                    className="mt-2 text-xs text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
                                  >
                                    Réinitialiser
                                  </button>
                                )}
                              </div>
                            )}
                          </div>
                          {user.is_active && (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => handleGenererCode(user)}
                              disabled={codeEnCours === user.id}
                              title="Générer un code d'enrôlement — pour un premier appareil, ou pour remplacer un appareil perdu"
                            >
                              {codeEnCours === user.id ? (
                                <Loader className="w-4 h-4 animate-spin" />
                              ) : (
                                <KeyRound className="w-4 h-4" />
                              )}
                            </Button>
                          )}
                          {user.id !== profile?.id && (
                            <>
                              {user.is_active ? (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => handleOpenDeactivateModal(user)}
                                >
                                  <UserX className="w-4 h-4 mr-2" />
                                  Désactiver
                                </Button>
                              ) : (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => handleReactivateUser(user.id)}
                                >
                                  <UserCheck className="w-4 h-4 mr-2" />
                                  Réactiver
                                </Button>
                              )}
                            </>
                          )}
                        </div>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {isAdmin && (
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Briefcase className="w-5 h-5 text-gray-700" />
              <h3 className="text-lg font-semibold text-gray-900">Affectations clients</h3>
            </div>
            <p className="text-sm text-gray-600 mt-1">
              Gérez les affectations de clients pour chaque collaborateur
            </p>
          </CardHeader>
          <CardContent>
            {loadingAssignments ? (
              <div className="flex items-center justify-center py-8">
                <Loader className="w-8 h-8 animate-spin text-blue-600" />
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-gray-50 border-b border-gray-200">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                        Collaborateur
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                        Nombre de clients
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                        Clients assignés
                      </th>
                      <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">
                        Actions
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {usersWithAssignments.map((user) => (
                      <tr key={user.id} className="hover:bg-gray-50">
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="flex items-center gap-3">
                            <CollaboratorAvatar
                              userId={user.id}
                              fullName={`${user.prenom || ''} ${user.nom || ''}`}
                              size="medium"
                              showTooltip={false}
                            />
                            <div>
                              <div className="text-sm font-medium text-gray-900">
                                {user.prenom} {user.nom}
                              </div>
                              <div className="text-xs text-gray-500">{user.email}</div>
                            </div>
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <Badge variant="info">
                            {user.assignmentsCount} client{user.assignmentsCount !== 1 ? 's' : ''}
                          </Badge>
                        </td>
                        <td className="px-6 py-4">
                          <div className="flex flex-wrap gap-1 max-w-md">
                            {user.clientNames.length > 0 ? (
                              user.clientNames.slice(0, 3).map((name, idx) => (
                                <Badge key={idx} variant="default" className="text-xs">
                                  {name}
                                </Badge>
                              ))
                            ) : (
                              <span className="text-sm text-gray-500 italic">Aucun client</span>
                            )}
                            {user.clientNames.length > 3 && (
                              <Badge variant="default" className="text-xs">
                                +{user.clientNames.length - 3}
                              </Badge>
                            )}
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-right">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleOpenAssignmentsModal(user.id, user.prenom, user.nom)}
                          >
                            <Settings2 className="w-4 h-4 mr-2" />
                            Gérer
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {usersWithAssignments.length === 0 && (
                  <div className="text-center py-8 text-gray-500">
                    Aucun collaborateur trouvé
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {selectedUser && (
        <AssignmentsManagementModal
          isOpen={showAssignmentsModal}
          onClose={handleCloseAssignmentsModal}
          userId={selectedUser.id}
          userName={selectedUser.name}
          onUpdate={loadUsersWithAssignments}
        />
      )}

      {userToDeactivate && (
        <DeactivateUserModal
          isOpen={showDeactivateModal}
          onClose={handleCloseDeactivateModal}
          user={userToDeactivate}
          availableUsers={users}
          onSuccess={handleDeactivateSuccess}
        />
      )}

      <Modal
        isOpen={showModal}
        onClose={() => setShowModal(false)}
        title="Inviter un utilisateur"
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Input
              label="Prenom"
              value={formData.prenom}
              onChange={(e) => setFormData({ ...formData, prenom: e.target.value })}
              required
            />
            <Input
              label="Nom"
              value={formData.nom}
              onChange={(e) => setFormData({ ...formData, nom: e.target.value })}
              required
            />
          </div>
          <Input
            label="Email"
            type="email"
            value={formData.email}
            onChange={(e) => setFormData({ ...formData, email: e.target.value })}
            required
          />
          <Select
            label="Role"
            value={formData.role}
            onChange={(e) => setFormData({ ...formData, role: e.target.value })}
            options={[
              { value: 'user', label: 'Utilisateur' },
              { value: 'admin', label: 'Administrateur' },
            ]}
          />
          <div className="flex justify-end gap-2 mt-6">
            <Button type="button" variant="secondary" onClick={() => setShowModal(false)}>
              Annuler
            </Button>
            <Button type="submit">
              Envoyer l'invitation
            </Button>
          </div>
        </form>
      </Modal>

      <Modal
        isOpen={codeEnrolement !== null}
        onClose={() => setCodeEnrolement(null)}
        title="Code d'enrôlement"
      >
        {codeEnrolement && (
          <div className="space-y-4">
            <p className="text-sm text-gray-600 dark:text-gray-400">
              Pour <span className="font-medium text-gray-900 dark:text-white">{codeEnrolement.email}</span>.
              Le courriel n&apos;est pas parti — transmettez ce code de vive voix ou par un
              canal privé&nbsp;: il vaut une identité.
            </p>

            <div className="flex items-center gap-3">
              <code className="flex-1 text-center text-2xl font-mono font-semibold tracking-widest text-gray-900 dark:text-white bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl py-4 select-all">
                {codeEnrolement.code}
              </code>
              <Button
                variant="secondary"
                onClick={() => {
                  navigator.clipboard
                    .writeText(codeEnrolement.code)
                    .then(() => showToast('Code copié.', 'success'))
                    .catch(() => showToast('Copie impossible — sélectionnez-le à la main.', 'error'));
                }}
                title="Copier"
              >
                <Copy className="w-4 h-4" />
              </Button>
            </div>

            {codeEnrolement.expireLe && (
              <p className="text-sm text-gray-500 dark:text-gray-400">
                Valable jusqu&apos;à{' '}
                <span className="font-medium">
                  {new Date(codeEnrolement.expireLe).toLocaleTimeString('fr-FR', {
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </span>
                . Au-delà, générez-en un nouveau.
              </p>
            )}

            <div className="rounded-xl bg-gray-50 dark:bg-gray-800/60 border border-gray-200 dark:border-gray-700 p-4 text-sm text-gray-600 dark:text-gray-400 space-y-1.5">
              <p className="font-medium text-gray-900 dark:text-white">Ce que la personne doit faire</p>
              <p>
                Ouvrir le CRM <span className="font-medium">sur l&apos;appareil qu&apos;elle utilisera</span>,
                cliquer sur «&nbsp;Premier appareil ou nouvel appareil ?&nbsp;» sous le bouton de
                connexion, saisir le code, puis valider avec son empreinte, son visage ou le code
                de son appareil.
              </p>
              <p>
                La passkey est générée par son appareil&nbsp;: sa clé privée n&apos;en sort jamais.
                Ce code ne fait qu&apos;autoriser le rattachement.
              </p>
            </div>

            <div className="flex justify-end">
              <Button onClick={() => setCodeEnrolement(null)}>Fermer</Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
