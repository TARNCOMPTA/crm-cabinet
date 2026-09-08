import { useState, useEffect } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../contexts/ToastContext';
import { supabase } from '../../lib/supabase';
import { Card, CardContent } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { Mail, Server, Shield, Send, CheckCircle2, XCircle, Loader2, Eye, EyeOff, Info, KeyRound } from 'lucide-react';
import { champsManquants } from './reglagesSmtp';

interface SmtpFormData {
  smtp_host: string;
  smtp_port: number;
  smtp_user: string;
  smtp_password: string;
  smtp_from_email: string;
  smtp_from_name: string;
  use_tls: boolean;
  is_enabled: boolean;
  auth_mode: 'motdepasse' | 'oauth2';
  oauth_tenant_id: string;
  oauth_client_id: string;
  oauth_client_secret: string;
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
  const [showSecret, setShowSecret] = useState(false);
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
    auth_mode: 'motdepasse',
    oauth_tenant_id: '',
    oauth_client_id: '',
    oauth_client_secret: '',
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
          auth_mode: data.auth_mode === 'oauth2' ? 'oauth2' : 'motdepasse',
          oauth_tenant_id: data.oauth_tenant_id || '',
          oauth_client_id: data.oauth_client_id || '',
          oauth_client_secret: data.oauth_client_secret || '',
        });
        setLastTestStatus({ at: data.last_test_at, status: data.last_test_status });
      }
    } catch {
      showToast('Erreur lors du chargement de la configuration SMTP', 'error');
    } finally {
      setLoading(false);
    }
  }

  async function handleSave() {
    if (!profile) return;

    // Les champs requis dependent du mode : voir `reglagesSmtp.ts`, ou la regle
    // est ecrite une fois et prouvee. Le message NOMME ce qui manque — un
    // « champs obligatoires » sans liste fait recommencer a l'aveugle.
    const manque = formData.is_enabled ? champsManquants(formData) : [];
    if (manque.length > 0) {
      showToast(`A renseigner avant d'activer l'envoi : ${manque.join(', ')}.`, 'error');
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
        auth_mode: formData.auth_mode,
        oauth_tenant_id: formData.oauth_tenant_id.trim(),
        oauth_client_id: formData.oauth_client_id.trim(),
        oauth_client_secret: formData.oauth_client_secret,
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
    } catch {
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
            {/* `role="switch"` + `aria-checked` + un nom : sans eux, cette bascule
                est un bouton anonyme — un lecteur d'ecran n'annonce ni ce
                qu'elle fait ni son etat, et aucun test ne peut la designer.
                C'est le defaut que le parcours de bout en bout existe pour
                attraper, et il porte ici le reglage le plus consequent de
                l'ecran. */}
            <button
              type="button"
              role="switch"
              aria-checked={formData.is_enabled}
              aria-label="Activer l'envoi par votre serveur SMTP"
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

          {/*
            LE MODE D'AUTHENTIFICATION.
            Microsoft 365 coupe l'authentification par mot de passe sur SMTP
            depuis 2023 et la retire progressivement ; les mots de passe
            d'application suivent. OAuth 2.0 est la voie qui reste. Le choix
            reste explicite : la plupart des hebergeurs acceptent encore le mot
            de passe, et on ne change pas le mode de quelqu'un a sa place.
          */}
          <fieldset className="rounded-lg border border-gray-200 dark:border-gray-700 p-4">
            <legend className="px-2 text-sm font-medium text-gray-700 dark:text-gray-300">
              Authentification
            </legend>
            <div className="flex flex-col gap-2 sm:flex-row sm:gap-6">
              {([
                { v: 'motdepasse', t: 'Mot de passe', d: 'La plupart des hébergeurs' },
                { v: 'oauth2', t: 'OAuth 2.0 (Microsoft 365)', d: 'Authentification moderne' },
              ] as const).map((o) => (
                <label key={o.v} className="flex items-start gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="auth_mode"
                    className="mt-1"
                    checked={formData.auth_mode === o.v}
                    onChange={() => setFormData((prev) => ({ ...prev, auth_mode: o.v }))}
                  />
                  <span>
                    <span className="block text-sm text-gray-900 dark:text-gray-100">{o.t}</span>
                    <span className="block text-xs text-gray-500 dark:text-gray-400">{o.d}</span>
                  </span>
                </label>
              ))}
            </div>
          </fieldset>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Input
              label="Identifiant SMTP *"
              placeholder="votre@email.com"
              value={formData.smtp_user}
              onChange={(e) => setFormData((prev) => ({ ...prev, smtp_user: e.target.value }))}
              helperText={
                formData.auth_mode === 'oauth2'
                  ? "La boîte au nom de laquelle l'application envoie."
                  : undefined
              }
            />
            {formData.auth_mode === 'motdepasse' && (
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
                  aria-label={showPassword ? 'Masquer le mot de passe' : 'Afficher le mot de passe'}
                  title={showPassword ? 'Masquer le mot de passe' : 'Afficher le mot de passe'}
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-[34px] text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            )}
          </div>

          {formData.auth_mode === 'oauth2' && (
            <div className="space-y-4 rounded-lg border border-teal-200 bg-teal-50/50 p-4 dark:border-teal-900 dark:bg-teal-950/20">
              <div className="flex items-start gap-2">
                <KeyRound className="mt-0.5 h-4 w-4 flex-shrink-0 text-teal-600 dark:text-teal-400" />
                <div className="text-sm text-gray-700 dark:text-gray-300">
                  <p className="font-medium">Application Azure (flux « client credentials »)</p>
                  <p className="mt-1 text-xs text-gray-600 dark:text-gray-400">
                    À préparer côté Microsoft, dans cet ordre : enregistrer une application dans
                    Azure ; lui donner la permission <strong>d'application</strong>{' '}
                    <code>SMTP.SendAsApp</code> sur Office&nbsp;365 Exchange Online, avec
                    consentement administrateur ; puis autoriser cette application à envoyer pour{' '}
                    <strong>cette boîte précise</strong> — sans quoi elle pourrait écrire au nom de
                    n'importe laquelle du locataire.
                  </p>
                </div>
              </div>

              <Input
                label="Identifiant de locataire (tenant) *"
                placeholder="contoso.onmicrosoft.com"
                value={formData.oauth_tenant_id}
                onChange={(e) => setFormData((prev) => ({ ...prev, oauth_tenant_id: e.target.value }))}
              />
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Input
                  label="Identifiant d'application (client) *"
                  placeholder="00000000-0000-0000-0000-000000000000"
                  value={formData.oauth_client_id}
                  onChange={(e) => setFormData((prev) => ({ ...prev, oauth_client_id: e.target.value }))}
                />
                <div className="relative">
                  <Input
                    label="Secret d'application *"
                    type={showSecret ? 'text' : 'password'}
                    placeholder="••••••••"
                    value={formData.oauth_client_secret}
                    onChange={(e) =>
                      setFormData((prev) => ({ ...prev, oauth_client_secret: e.target.value }))
                    }
                  />
                  <button
                    type="button"
                    aria-label={showSecret ? 'Masquer le secret' : 'Afficher le secret'}
                    title={showSecret ? 'Masquer le secret' : 'Afficher le secret'}
                    onClick={() => setShowSecret(!showSecret)}
                    className="absolute right-3 top-[34px] text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                  >
                    {showSecret ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>
              <p className="text-xs text-gray-600 dark:text-gray-400">
                Le secret Azure a une date d'expiration, fixée à sa création. Notez-la : le jour où
                il expire, plus aucun courriel ne part.
              </p>
            </div>
          )}

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
