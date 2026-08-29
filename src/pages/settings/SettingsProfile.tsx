import { useState, useEffect } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../contexts/ToastContext';
import { supabase } from '../../lib/supabase';
import { Card, CardContent } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { Select } from '../../components/ui/Select';
import { User, Mail, Phone, MapPin, Tag, Briefcase, RotateCcw } from 'lucide-react';
import { useCabinetRoles } from '../../hooks/useCabinetRoles';
import { AVATAR_COLORS, getCollaboratorColor, getCollaboratorInitials, getContrastColor } from '../../lib/collaboratorUtils';

export function SettingsProfile() {
  const { profile } = useAuth();
  const { showToast } = useToast();
  const { roles } = useCabinetRoles();
  const [loading, setLoading] = useState(false);
  const [avatarColor, setAvatarColor] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    prenom: '',
    nom: '',
    display_name: '',
    email: '',
    telephone: '',
    adresse: '',
    job_role: '',
    default_collaborator_role_key: '',
  });

  useEffect(() => {
    loadProfileData();
  }, [profile]);

  async function loadProfileData() {
    if (!profile) return;

    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, prenom, nom, email, display_name, telephone, adresse, job_role, avatar_url, avatar_color, default_collaborator_role_key')
        .eq('id', profile.id)
        .maybeSingle();

      if (error) throw error;

      if (data) {
        setAvatarColor(data.avatar_color || null);
        setFormData({
          prenom: data.prenom || '',
          nom: data.nom || '',
          display_name: data.display_name || '',
          email: data.email || '',
          telephone: data.telephone || '',
          adresse: data.adresse || '',
          job_role: data.job_role || '',
          default_collaborator_role_key: data.default_collaborator_role_key || '',
        });
      }
    } catch {
      showToast('Erreur lors du chargement du profil', 'error');
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);

    try {
      const { error } = await supabase
        .from('profiles')
        .update({
          prenom: formData.prenom || null,
          nom: formData.nom || null,
          display_name: formData.display_name || null,
          telephone: formData.telephone || null,
          adresse: formData.adresse || null,
          job_role: formData.job_role || null,
          avatar_color: avatarColor,
          default_collaborator_role_key: formData.default_collaborator_role_key || null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', profile!.id);

      if (error) throw error;

      showToast('Profil mis à jour avec succès', 'success');
    } catch {
      showToast('Erreur lors de la mise à jour du profil', 'error');
    } finally {
      setLoading(false);
    }
  }

  const getRoleLabel = (role: string) => {
    const roles: Record<string, string> = {
      admin: 'Administrateur',
      user: 'Utilisateur',
    };
    return roles[role] || role;
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Profil Utilisateur</h2>
        <p className="text-gray-600 dark:text-gray-400 mt-1">
          Gérez vos informations personnelles et de contact
        </p>
      </div>

      <form onSubmit={handleSubmit}>
        <Card>
          <CardContent className="p-6 space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <Input
                label="Prénom"
                value={formData.prenom}
                onChange={(e) =>
                  setFormData({ ...formData, prenom: e.target.value })
                }
                placeholder="Votre prénom"
                icon={<User className="w-5 h-5" />}
              />

              <Input
                label="Nom"
                value={formData.nom}
                onChange={(e) =>
                  setFormData({ ...formData, nom: e.target.value })
                }
                placeholder="Votre nom"
                icon={<User className="w-5 h-5" />}
              />
            </div>

            <Input
              label="Nom d'affichage"
              value={formData.display_name}
              onChange={(e) =>
                setFormData({ ...formData, display_name: e.target.value })
              }
              placeholder="Comment voulez-vous être appelé ?"
              icon={<Tag className="w-5 h-5" />}
              helperText="Ce nom sera affiché dans l'application"
            />

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">
                Couleur de l'avatar
              </label>
              <div className="flex items-start gap-5">
                <div className="flex-shrink-0">
                  <div
                    className="w-16 h-16 rounded-full flex items-center justify-center text-xl font-bold transition-colors duration-200"
                    style={{
                      backgroundColor: getCollaboratorColor(profile?.id, avatarColor),
                      color: getContrastColor(getCollaboratorColor(profile?.id, avatarColor)),
                    }}
                  >
                    {getCollaboratorInitials(
                      formData.display_name || `${formData.prenom} ${formData.nom}`.trim() || formData.email
                    )}
                  </div>
                </div>
                <div className="flex-1">
                  <div className="flex flex-wrap gap-2">
                    {AVATAR_COLORS.map((color) => (
                      <button
                        key={color}
                        type="button"
                        onClick={() => setAvatarColor(color)}
                        className={`w-7 h-7 rounded-full border-2 transition-all duration-150 hover:scale-125 ${
                          avatarColor === color
                            ? 'border-gray-900 dark:border-white scale-110 ring-2 ring-offset-1 ring-gray-400'
                            : 'border-transparent'
                        }`}
                        style={{ backgroundColor: color }}
                        title={color}
                      />
                    ))}
                  </div>
                  {avatarColor && (
                    <button
                      type="button"
                      onClick={() => setAvatarColor(null)}
                      className="mt-2 inline-flex items-center gap-1 text-xs text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 transition-colors"
                    >
                      <RotateCcw className="w-3 h-3" />
                      Réinitialiser la couleur automatique
                    </button>
                  )}
                </div>
              </div>
            </div>

            <Input
              label="Email"
              value={formData.email}
              disabled
              icon={<Mail className="w-5 h-5" />}
              helperText="L'email ne peut pas être modifié"
            />

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <Input
                label="Téléphone"
                value={formData.telephone}
                onChange={(e) =>
                  setFormData({ ...formData, telephone: e.target.value })
                }
                placeholder="+33 6 12 34 56 78"
                icon={<Phone className="w-5 h-5" />}
              />

              <Input
                label="Fonction"
                value={formData.job_role}
                onChange={(e) =>
                  setFormData({ ...formData, job_role: e.target.value })
                }
                placeholder="Ex: Expert-comptable, Assistant..."
                icon={<Briefcase className="w-5 h-5" />}
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Rôle par défaut sur les dossiers
              </label>
              <Select
                value={formData.default_collaborator_role_key}
                onChange={(e) =>
                  setFormData({ ...formData, default_collaborator_role_key: e.target.value })
                }
              >
                <option value="">Aucun — utiliser le rôle par défaut du cabinet</option>
                {roles.map((r) => (
                  <option key={r.key} value={r.key}>
                    {r.label}
                  </option>
                ))}
              </Select>
              <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                Ce rôle sera proposé automatiquement lors de votre ajout sur une fiche client. Il reste modifiable au cas par cas.
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Adresse
              </label>
              <div className="relative">
                <MapPin className="absolute left-3 top-3 text-gray-400 w-5 h-5" />
                <textarea
                  value={formData.adresse}
                  onChange={(e) =>
                    setFormData({ ...formData, adresse: e.target.value })
                  }
                  placeholder="Adresse complète"
                  className="w-full pl-10 pr-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 focus:ring-2 focus:ring-teal-500 focus:border-transparent"
                  rows={3}
                />
              </div>
            </div>

            <div className="pt-4 border-t border-gray-200 dark:border-gray-700">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-700 dark:text-gray-300">Rôle</p>
                  <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                    {getRoleLabel(profile?.role || '')}
                  </p>
                </div>
              </div>
            </div>

            <div className="flex justify-end pt-4">
              <Button type="submit" disabled={loading}>
                {loading ? 'Enregistrement...' : 'Enregistrer les modifications'}
              </Button>
            </div>
          </CardContent>
        </Card>
      </form>
    </div>
  );
}
