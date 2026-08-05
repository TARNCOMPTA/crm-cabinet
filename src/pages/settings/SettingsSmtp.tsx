import { useState, useEffect } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../contexts/ToastContext';
import { supabase } from '../../lib/supabase';
import { Card, CardContent } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { Mail, Server, Shield, Send, CheckCircle2, XCircle, Loader2, Eye, EyeOff, Info } from 'lucide-react';

interface SmtpFormData {
  smtp_host: string;
  smtp_port: number;
  smtp_user: string;
  smtp_password: string;
  smtp_from_email: string;
  smtp_from_name: string;
  use_tls: boolean;
  is_enabled: boolean;
}

const PRESET_CONFIGS: Record<string, Partial<SmtpFormData>> = {
  gmail: { smtp_host: 'smtp.gmail.com', smtp_port: 587, use_tls: true },
  outlook: { smtp_host: 'smtp.office365.com', smtp_port: 587, use_tls: true },
  ovh: { smtp_host: 'ssl0.ovh.net', smtp_port: 465, use_tls: true },
  ionos: { smtp_host: 'smtp.ionos.fr', smtp_port: 465, use_tls: true },
  custom: {},
};

export function SettingsSmtp() {
  const { profile, isAdmin } = useAuth();
  const { showToast } = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [configExists, setConfigExists] = useState(false);
  const [lastTestStatus, setLastTestStatus] = useState<{ at: string | null; status: string | null }>({ at: null, status: null });

  const [formData, setFormData] = useState<SmtpFormData>({
    smtp_host: '',
    smtp_port: 587,
    smtp_user: '',
    smtp_password: '',
    smtp_from_email: '',
    smtp_from_name: '',
    use_tls: true,
    is_enabled: false,
  });

  useEffect(() => {
    loadConfig();
  }, [profile]);

  async function loadConfig() {
    if (!profile) {
      setLoading(false);
      return;
    }

    try {
      const { data, error } = await supabase
        .from('cabinet_smtp_config')
        .select('*')
        .maybeSingle();

      if (error) throw error;

      if (data) {
        setConfigExists(true);
        setFormData({
          smtp_host: data.smtp_host || '',
          smtp_port: data.smtp_port || 587,
          smtp_user: data.smtp_user || '',
          smtp_password: data.smtp_password || '',
          smtp_from_email: data.smtp_from_email || '',
          smtp_from_name: data.smtp_from_name || '',
          use_tls: data.use_tls ?? true,
          is_enabled: data.is_enabled ?? false,
        });
        setLastTestStatus({ at: data.last_test_at, status: data.last_test_status });
      }
    } catch (err) {
      showToast('Erreur lors du chargement de la configuration SMTP', 'error');
    } finally {
      setLoading(false);
    }
  }

  async function handleSave() {
    if (!profile) return;

    if (formData.is_enabled && (!formData.smtp_host || !formData.smtp_user || !formData.smtp_password || !formData.smtp_from_email)) {
      showToast('Veuillez remplir tous les champs obligatoires avant d\'activer le SMTP', 'error');
      return;
    }

    setSaving(true);
    try {
      const payload = {
        smtp_host: formData.smtp_host.trim(),
        smtp_port: formData.smtp_port,
        smtp_user: formData.smtp_user.trim(),
        smtp_password: formData.smtp_password,
        smtp_from_email: formData.smtp_from_email.trim(),
        smtp_from_name: formData.smtp_from_name.trim() || null,
        use_tls: formData.use_tls,
        is_enabled: formData.is_enabled,
        updated_at: new Date().toISOString(),
      };

      let error;
      if (configExists) {
        ({ error } = await supabase
          .from('cabinet_smtp_config')
          .update(payload)
          );
      } else {
        ({ error } = await supabase
          .from('cabinet_smtp_config')
          .insert(payload));
        if (!error) setConfigExists(true);
      }

      if (error) throw error;
      showToast('Configuration SMTP enregistree', 'success');
    } catch (err) {
      showToast('Erreur lors de la sauvegarde', 'error');
    } finally {
      setSaving(false);
    }
  }

  async function handleTestEmail() {
    if (!profile) return;

    setTesting(true);
    try {
      // Deux étapes, parce qu'elles n'échouent pas pour les mêmes raisons.
      //
      // `/api/emails/tester` n'ouvre que la connexion et s'authentifie. Un
      // relais peut très bien l'accepter, puis refuser le message parce que
      // l'expéditeur configuré ne lui appartient pas — c'est le cas le plus
      // fréquent chez Office 365. Seul l'envoi réel le montre, d'où le second
      // appel.
      //
      // Le serveur envoie ce message à l'adresse du compte connecté, et non à
      // une adresse saisie : il refuse délibérément de servir de relais vers un
      // destinataire arbitraire.
      const connexion = await fetch('/api/emails/tester', {
        method: 'POST',
        credentials: 'same-origin',
      });
      const rc = await connexion.json().catch(() => ({}));
      if (!connexion.ok || rc.ok === false) {
        const raison = rc.message || `Erreur ${connexion.status}`;
        showToast(`Connexion au serveur refusee : ${raison}`, 'error');
        setLastTestStatus({ at: new Date().toISOString(), status: raison });
        return;
      }

      const envoi = await fetch('/api/emails/essai', {
        method: 'POST',
        credentials: 'same-origin',
      });
      const re = await envoi.json().catch(() => ({}));
      if (!envoi.ok || re.ok === false) {
        const raison = re.message || `Erreur ${envoi.status}`;
        showToast(`Connexion etablie, mais l'envoi a echoue : ${raison}`, 'error');
        setLastTestStatus({ at: new Date().toISOString(), status: raison });
        return;
      }

      showToast(re.message || 'Message d\'essai envoye.', 'success');
      setLastTestStatus({ at: new Date().toISOString(), status: 'success' });
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Erreur lors du test', 'error');
      setLastTestStatus({ at: new Date().toISOString(), status: 'erreur reseau' });
    } finally {
      setTesting(false);
    }
  }

  function applyPreset(key: string) {
    const preset = PRESET_CONFIGS[key];
    if (preset) {
      setFormData((prev) => ({ ...prev, ...preset }));
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-6 h-6 animate-spin text-blue-500" />
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="text-center py-12 text-gray-500 dark:text-gray-400">
        Seuls les administrateurs peuvent configurer le serveur email.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Info banner */}
      <div className="flex items-start gap-3 p-4 bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 rounded-lg">
        <Info className="w-5 h-5 text-blue-600 dark:text-blue-400 mt-0.5 shrink-0" />
        <div className="text-sm text-blue-800 dark:text-blue-200">
          <p className="font-medium mb-1">Serveur d'envoi d'emails (SMTP)</p>
          <p className="text-blue-700 dark:text-blue-300">
            Configurez votre propre serveur email pour que les notifications (taches, relances, tickets...)
            soient envoyees depuis votre adresse professionnelle. Sans configuration, le systeme par defaut est utilise.
          </p>
        </div>
      </div>

      {/* Enable toggle */}
      <Card>
        <CardContent className="p-5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${formData.is_enabled ? 'bg-green-100 dark:bg-green-900/30' : 'bg-gray-100 dark:bg-gray-800'}`}>
                <Mail className={`w-5 h-5 ${formData.is_enabled ? 'text-green-600 dark:text-green-400' : 'text-gray-400'}`} />
              </div>
              <div>
                <p className="font-medium text-gray-900 dark:text-white">SMTP personnalise</p>
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  {formData.is_enabled ? 'Actif — les emails partent de votre serveur' : 'Inactif — le systeme par defaut est utilise'}
                </p>
              </div>
            </div>
            <button
              onClick={() => setFormData((prev) => ({ ...prev, is_enabled: !prev.is_enabled }))}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${formData.is_enabled ? 'bg-green-500' : 'bg-gray-300 dark:bg-gray-600'}`}
            >
              <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${formData.is_enabled ? 'translate-x-6' : 'translate-x-1'}`} />
            </button>
          </div>
        </CardContent>
      </Card>

      {/* Presets */}
      <Card>
        <CardContent className="p-5">
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">
            Configuration rapide
          </label>
          <div className="flex flex-wrap gap-2">
            {[
              { key: 'gmail', label: 'Gmail' },
              { key: 'outlook', label: 'Outlook / Office 365' },
              { key: 'ovh', label: 'OVH' },
              { key: 'ionos', label: 'IONOS' },
              { key: 'custom', label: 'Personnalise' },
            ].map((p) => (
              <button
                key={p.key}
                onClick={() => applyPreset(p.key)}
                className="px-3 py-1.5 text-sm rounded-md border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800 text-gray-700 dark:text-gray-300 transition-colors"
              >
                {p.label}
              </button>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Server settings */}
      <Card>
        <CardContent className="p-5 space-y-5">
          <div className="flex items-center gap-2 mb-2">
            <Server className="w-4 h-4 text-gray-500" />
            <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Serveur SMTP</h3>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Input
              label="Hote SMTP *"
              placeholder="smtp.example.com"
              value={formData.smtp_host}
              onChange={(e) => setFormData((prev) => ({ ...prev, smtp_host: e.target.value }))}
            />
            <Input
              label="Port *"
              type="number"
              placeholder="587"
              value={String(formData.smtp_port)}
              onChange={(e) => setFormData((prev) => ({ ...prev, smtp_port: parseInt(e.target.value) || 587 }))}
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Input
              label="Identifiant SMTP *"
              placeholder="votre@email.com"
              value={formData.smtp_user}
              onChange={(e) => setFormData((prev) => ({ ...prev, smtp_user: e.target.value }))}
            />
            <div className="relative">
              <Input
                label="Mot de passe SMTP *"
                type={showPassword ? 'text' : 'password'}
                placeholder="••••••••"
                value={formData.smtp_password}
                onChange={(e) => setFormData((prev) => ({ ...prev, smtp_password: e.target.value }))}
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-[34px] text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={formData.use_tls}
                onChange={(e) => setFormData((prev) => ({ ...prev, use_tls: e.target.checked }))}
                className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
              />
              <span className="text-sm text-gray-700 dark:text-gray-300">Utiliser TLS / STARTTLS</span>
            </label>
            <Shield className="w-4 h-4 text-green-500" />
          </div>
        </CardContent>
      </Card>

      {/* Sender identity */}
      <Card>
        <CardContent className="p-5 space-y-5">
          <div className="flex items-center gap-2 mb-2">
            <Mail className="w-4 h-4 text-gray-500" />
            <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Identite d'expediteur</h3>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Input
              label="Email d'envoi *"
              placeholder="contact@cabinet.fr"
              value={formData.smtp_from_email}
              onChange={(e) => setFormData((prev) => ({ ...prev, smtp_from_email: e.target.value }))}
            />
            <Input
              label="Nom d'affichage"
              placeholder="Cabinet Dupont"
              value={formData.smtp_from_name}
              onChange={(e) => setFormData((prev) => ({ ...prev, smtp_from_name: e.target.value }))}
            />
          </div>
        </CardContent>
      </Card>

      {/* Test */}
      <Card>
        <CardContent className="p-5 space-y-4">
          <div className="flex items-center gap-2 mb-2">
            <Send className="w-4 h-4 text-gray-500" />
            <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Tester la configuration</h3>
          </div>

          <div className="flex items-end gap-3">
            <p className="flex-1 text-sm text-gray-600 dark:text-gray-400">
              Le message d&apos;essai part vers <span className="font-medium">{profile?.email}</span>,
              l&apos;adresse du compte connecté. Le serveur n&apos;accepte pas d&apos;autre
              destinataire : il n&apos;a pas à servir de relais.
            </p>
            <Button
              onClick={handleTestEmail}
              disabled={testing || !configExists || !formData.smtp_host}
              variant="secondary"
              className="shrink-0"
            >
              {testing ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Send className="w-4 h-4 mr-2" />}
              Envoyer un test
            </Button>
          </div>

          {lastTestStatus.at && (
            <div className={`flex items-center gap-2 text-sm ${lastTestStatus.status === 'success' ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
              {lastTestStatus.status === 'success' ? (
                <CheckCircle2 className="w-4 h-4" />
              ) : (
                <XCircle className="w-4 h-4" />
              )}
              <span>
                {lastTestStatus.status === 'success'
                  ? `Dernier test reussi le ${new Date(lastTestStatus.at).toLocaleString('fr-FR')}`
                  : `Echec: ${lastTestStatus.status}`
                }
              </span>
            </div>
          )}

          {!configExists && (
            <p className="text-sm text-amber-600 dark:text-amber-400">
              Enregistrez d'abord la configuration avant de lancer un test.
            </p>
          )}
        </CardContent>
      </Card>

      {/* Save */}
      <div className="flex justify-end">
        <Button onClick={handleSave} disabled={saving}>
          {saving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
          Enregistrer
        </Button>
      </div>
    </div>
  );
}
