import { useState, useEffect, useRef } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../contexts/ToastContext';
import { supabase } from '../../lib/supabase';
import { Card, CardContent } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { Building2, Mail, Phone, MapPin, Hash, Upload, Trash2, Image as ImageIcon, Loader2, ShieldAlert } from 'lucide-react';

interface CabinetFormData {
  nom: string;
  adresse: string;
  siret: string;
  email: string;
  telephone: string;
  logo_url: string;
}

export function SettingsMonCabinet() {
  const { profile, isAdmin } = useAuth();
  const { showToast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [deletingLogo, setDeletingLogo] = useState(false);
  const [formData, setFormData] = useState<CabinetFormData>({
    nom: '',
    adresse: '',
    siret: '',
    email: '',
    telephone: '',
    logo_url: '',
  });
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  /**
   * Identifiant de la ligne du cabinet.
   *
   * La table n'en contient qu'une, mais les ecritures ont besoin d'une cible :
   * PostgREST ne sait pas faire « modifier la premiere ligne ». On retient donc
   * l'identifiant lu au chargement.
   */
  // `null` tant que la fiche du cabinet n'est pas chargee. Les trois ecritures
  // ci-dessous s'en gardent : sans identifiant, le filtre `.eq('id', null)` ne
  // designerait aucune ligne et l'enregistrement echouerait sans le dire.
  const [cabinetId, setCabinetId] = useState<string | null>(null);

  useEffect(() => {
    loadCabinetData();
  }, [profile]);

  async function loadCabinetData() {
    if (!profile) {
      setLoading(false);
      return;
    }

    try {
      const { data, error } = await supabase
        .from('cabinets')
        .select('id, nom, adresse, siret, email, telephone, logo_url')
        .order('created_at')
        .limit(1)
        .maybeSingle();

      if (error) throw error;

      if (data) {
        setCabinetId(data.id);
        setFormData({
          nom: data.nom || '',
          adresse: data.adresse || '',
          siret: data.siret || '',
          email: data.email || '',
          telephone: data.telephone || '',
          logo_url: data.logo_url || '',
        });
      }
    } catch (error) {
      showToast('Erreur lors du chargement des informations du cabinet', 'error');
    } finally {
      setLoading(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!profile || !cabinetId) return;
    setSaving(true);

    try {
      const { error } = await supabase
        .from('cabinets')
        .update({
          // `cabinets.nom` est NOT NULL : y ecrire null ferait echouer la
          // requete cote base. Le champ est obligatoire dans le formulaire.
          nom: formData.nom,
          adresse: formData.adresse || null,
          siret: formData.siret || null,
          email: formData.email || null,
          telephone: formData.telephone || null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', cabinetId);

      if (error) throw error;

      showToast('Informations du cabinet mises a jour', 'success');
    } catch (error: any) {
      showToast('Erreur lors de la mise a jour', 'error');
    } finally {
      setSaving(false);
    }
  }

  async function handleLogoUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !profile) return;

    const allowedTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/svg+xml'];
    if (!allowedTypes.includes(file.type)) {
      showToast('Format non supporte. Utilisez JPG, PNG, WebP ou SVG.', 'error');
      return;
    }

    if (file.size > 2 * 1024 * 1024) {
      showToast('Le fichier ne doit pas depasser 2 Mo', 'error');
      return;
    }

    if (!cabinetId) return;

    setUploadingLogo(true);
    try {
      if (formData.logo_url) {
        const oldPath = extractStoragePath(formData.logo_url);
        if (oldPath) {
          await supabase.storage.from('cabinet-logos').remove([oldPath]);
        }
      }

      const ext = file.name.split('.').pop()?.toLowerCase() || 'png';
      const filePath = `logo-${Date.now()}.${ext}`;

      const { error: uploadError } = await supabase.storage
        .from('cabinet-logos')
        .upload(filePath, file, { upsert: true });

      if (uploadError) throw uploadError;

      const { data: urlData } = supabase.storage
        .from('cabinet-logos')
        .getPublicUrl(filePath);

      const publicUrl = urlData.publicUrl;

      const { error: updateError } = await supabase
        .from('cabinets')
        .update({ logo_url: publicUrl, updated_at: new Date().toISOString() })
        .eq('id', cabinetId);

      if (updateError) throw updateError;

      setFormData((prev) => ({ ...prev, logo_url: publicUrl }));
      setPreviewUrl(null);
      showToast('Logo mis a jour', 'success');
    } catch (error) {
      showToast('Erreur lors de l\'upload du logo', 'error');
    } finally {
      setUploadingLogo(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }

  async function handleDeleteLogo() {
    if (!profile || !formData.logo_url || !cabinetId) return;
    setDeletingLogo(true);

    try {
      const path = extractStoragePath(formData.logo_url);
      if (path) {
        await supabase.storage.from('cabinet-logos').remove([path]);
      }

      const { error } = await supabase
        .from('cabinets')
        .update({ logo_url: null, updated_at: new Date().toISOString() })
        .eq('id', cabinetId);

      if (error) throw error;

      setFormData((prev) => ({ ...prev, logo_url: '' }));
      setPreviewUrl(null);
      showToast('Logo supprime', 'success');
    } catch (error) {
      showToast('Erreur lors de la suppression du logo', 'error');
    } finally {
      setDeletingLogo(false);
    }
  }

  function extractStoragePath(url: string): string | null {
    const match = url.match(/cabinet-logos\/(.+)$/);
    return match ? match[1] : null;
  }

  function handleFilePreview(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => setPreviewUrl(reader.result as string);
    reader.readAsDataURL(file);

    handleLogoUpload(e);
  }

  if (!isAdmin) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-3 p-6 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-xl">
          <ShieldAlert className="w-6 h-6 text-amber-600 dark:text-amber-400 flex-shrink-0" />
          <div>
            <h3 className="font-semibold text-amber-900 dark:text-amber-200">Acces restreint</h3>
            <p className="text-sm text-amber-700 dark:text-amber-400 mt-0.5">
              Seuls les administrateurs peuvent modifier les informations du cabinet.
            </p>
          </div>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-8 h-8 animate-spin text-teal-600" />
      </div>
    );
  }

  const displayedLogo = previewUrl || formData.logo_url;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Mon Cabinet</h2>
        <p className="text-gray-600 dark:text-gray-400 mt-1">
          Informations generales et identite visuelle de votre cabinet
        </p>
      </div>

      <Card>
        <CardContent className="p-6">
          <div className="flex flex-col sm:flex-row items-start gap-6">
            <div className="flex flex-col items-center gap-3">
              <div className="w-28 h-28 rounded-2xl border-2 border-dashed border-gray-300 dark:border-gray-600 flex items-center justify-center overflow-hidden bg-gray-50 dark:bg-gray-800 transition-colors">
                {displayedLogo ? (
                  <img
                    src={displayedLogo}
                    alt="Logo du cabinet"
                    className="w-full h-full object-contain p-2"
                  />
                ) : (
                  <ImageIcon className="w-10 h-10 text-gray-300 dark:text-gray-600" />
                )}
              </div>
              <div className="flex items-center gap-2">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp,image/svg+xml"
                  className="hidden"
                  onChange={handleFilePreview}
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploadingLogo}
                >
                  {uploadingLogo ? (
                    <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                  ) : (
                    <Upload className="w-3.5 h-3.5 mr-1.5" />
                  )}
                  {uploadingLogo ? 'Upload...' : 'Changer'}
                </Button>
                {formData.logo_url && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={handleDeleteLogo}
                    disabled={deletingLogo}
                    className="text-red-600 hover:text-red-700 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950/30"
                  >
                    {deletingLogo ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Trash2 className="w-3.5 h-3.5" />
                    )}
                  </Button>
                )}
              </div>
              <p className="text-xs text-gray-400 dark:text-gray-500 text-center max-w-[140px]">
                JPG, PNG, WebP ou SVG. 2 Mo max.
              </p>
            </div>

            <div className="flex-1 w-full">
              <div className="flex items-center gap-2 mb-4">
                <div className="w-8 h-8 rounded-lg bg-teal-50 dark:bg-teal-900/30 flex items-center justify-center">
                  <Building2 className="w-4 h-4 text-teal-600 dark:text-teal-400" />
                </div>
                <h3 className="font-semibold text-gray-900 dark:text-gray-100">Logo du cabinet</h3>
              </div>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                Ce logo sera utilise dans la generation de documents et l'identite visuelle de votre espace.
                Privilegiez un format carre ou horizontal pour un rendu optimal.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      <form onSubmit={handleSubmit}>
        <Card>
          <CardContent className="p-6 space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <Input
                label="Nom du cabinet"
                value={formData.nom}
                onChange={(e) => setFormData({ ...formData, nom: e.target.value })}
                placeholder="Cabinet Dupont & Associes"
                icon={<Building2 className="w-5 h-5" />}
              />

              <Input
                label="SIRET"
                value={formData.siret}
                onChange={(e) => setFormData({ ...formData, siret: e.target.value })}
                placeholder="123 456 789 00012"
                icon={<Hash className="w-5 h-5" />}
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <Input
                label="Email"
                type="email"
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                placeholder="contact@cabinet.fr"
                icon={<Mail className="w-5 h-5" />}
              />

              <Input
                label="Telephone"
                value={formData.telephone}
                onChange={(e) => setFormData({ ...formData, telephone: e.target.value })}
                placeholder="+33 1 23 45 67 89"
                icon={<Phone className="w-5 h-5" />}
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Adresse
              </label>
              <div className="relative">
                <MapPin className="absolute left-3 top-3 text-gray-400 w-5 h-5" />
                <textarea
                  value={formData.adresse}
                  onChange={(e) => setFormData({ ...formData, adresse: e.target.value })}
                  placeholder="Adresse complete du cabinet"
                  className="w-full pl-10 pr-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 focus:ring-2 focus:ring-teal-500 focus:border-transparent"
                  rows={3}
                />
              </div>
            </div>

            <div className="flex justify-end pt-4 border-t border-gray-200 dark:border-gray-700">
              <Button type="submit" disabled={saving}>
                {saving ? 'Enregistrement...' : 'Enregistrer les modifications'}
              </Button>
            </div>
          </CardContent>
        </Card>
      </form>
    </div>
  );
}
