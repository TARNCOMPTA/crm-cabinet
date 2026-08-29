import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../contexts/ToastContext';
import { Card, CardContent } from '../../components/ui/Card';
import {
  Mail,
  MailCheck,
  ClipboardList,
  BarChart3,
  MessageSquare,
  ShieldAlert,
  Scale,
  Loader2,
  ToggleLeft,
  ToggleRight,
  Clock,
} from 'lucide-react';
import {
  NOTIFICATION_TYPES,
  loadPreferences,
  updatePreference,
  bulkUpdatePreferences,
  loadDigestSettings,
  updateDigestSettings,
} from '../../lib/notificationPreferencesService';
import type { NotificationType, NotificationPreference, EmailDigest } from '../../types/database';

const CATEGORY_ICONS: Record<string, React.ReactNode> = {
  Tâches: <ClipboardList className="w-5 h-5 text-teal-600 dark:text-teal-400" />,
  Bilans: <BarChart3 className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />,
  Support: <MessageSquare className="w-5 h-5 text-amber-600 dark:text-amber-400" />,
  Systeme: <ShieldAlert className="w-5 h-5 text-red-600 dark:text-red-400" />,
  Juridique: <Scale className="w-5 h-5 text-sky-600 dark:text-sky-400" />,
};

function Toggle({
  enabled,
  onChange,
  disabled,
}: {
  enabled: boolean;
  onChange: (value: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={() => !disabled && onChange(!enabled)}
      disabled={disabled}
      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:ring-offset-2 dark:focus:ring-offset-gray-900 ${
        disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'
      } ${enabled ? 'bg-teal-600' : 'bg-gray-300 dark:bg-gray-600'}`}
    >
      <span
        className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform duration-200 ${
          enabled ? 'translate-x-6' : 'translate-x-1'
        }`}
      />
    </button>
  );
}

export function SettingsNotifications() {
  const { profile } = useAuth();
  const { showToast } = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [preferences, setPreferences] = useState<NotificationPreference[]>([]);
  const [digest, setDigest] = useState<EmailDigest | null>(null);

  const loadData = useCallback(async () => {
    if (!profile) return;
    try {
      const [prefs, digestData] = await Promise.all([
        loadPreferences(profile.id),
        loadDigestSettings(profile.id),
      ]);
      setPreferences(prefs);
      setDigest(digestData);
    } catch {
      showToast('Erreur lors du chargement des preferences', 'error');
    } finally {
      setLoading(false);
    }
  }, [profile, showToast]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  function getPref(type: NotificationType): { email_enabled: boolean; digest_enabled: boolean } {
    const pref = preferences.find((p) => p.notification_type === type);
    return {
      email_enabled: pref?.email_enabled ?? true,
      digest_enabled: pref?.digest_enabled ?? false,
    };
  }

  async function handleToggle(type: NotificationType, field: 'email_enabled' | 'digest_enabled', value: boolean) {
    if (!profile) return;
    const key = `${type}-${field}`;
    setSaving(key);
    try {
      await updatePreference(profile.id, type, field, value);
      setPreferences((prev) => {
        const idx = prev.findIndex((p) => p.notification_type === type);
        if (idx >= 0) {
          const updated = [...prev];
          updated[idx] = { ...updated[idx], [field]: value };
          return updated;
        }
        return [
          ...prev,
          {
            id: crypto.randomUUID(),
            user_id: profile.id,
            notification_type: type,
            email_enabled: field === 'email_enabled' ? value : true,
            digest_enabled: field === 'digest_enabled' ? value : false,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          },
        ];
      });
    } catch {
      showToast('Erreur lors de la sauvegarde', 'error');
    } finally {
      setSaving(null);
    }
  }

  async function handleBulkToggle(field: 'email_enabled' | 'digest_enabled', value: boolean) {
    if (!profile) return;
    setSaving(`bulk-${field}`);
    try {
      await bulkUpdatePreferences(profile.id, field, value);
      await loadData();
      showToast(value ? 'Notifications activees' : 'Notifications desactivees', 'success');
    } catch {
      showToast('Erreur lors de la sauvegarde', 'error');
    } finally {
      setSaving(null);
    }
  }

  async function handleDigestChange(type: 'daily' | 'weekly' | null) {
    if (!profile) return;
    setSaving('digest');
    try {
      await updateDigestSettings(profile.id, type);
      setDigest((prev) =>
        prev
          ? { ...prev, digest_type: type || 'daily', is_active: type !== null }
          : type !== null
            ? {
                id: crypto.randomUUID(),
                user_id: profile.id,
                digest_type: type,
                last_sent_at: null,
                next_send_at: new Date().toISOString(),
                is_active: true,
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
              }
            : null
      );
      showToast(
        type ? `Resume ${type === 'daily' ? 'quotidien' : 'hebdomadaire'} active` : 'Resume desactive',
        'success'
      );
    } catch {
      showToast('Erreur lors de la sauvegarde', 'error');
    } finally {
      setSaving(null);
    }
  }

  const categories = [...new Set(NOTIFICATION_TYPES.map((nt) => nt.category))];
  const allEmailEnabled = NOTIFICATION_TYPES.every((nt) => getPref(nt.type as NotificationType).email_enabled);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="w-6 h-6 animate-spin text-teal-600" />
        <span className="ml-2 text-gray-500 dark:text-gray-400">Chargement...</span>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Notifications par email</h2>
        <p className="text-gray-600 dark:text-gray-400 mt-1">
          Choisissez les notifications que vous souhaitez recevoir par email
        </p>
      </div>

      <Card>
        <CardContent className="p-5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-teal-50 dark:bg-teal-900/30">
                <Mail className="w-5 h-5 text-teal-600 dark:text-teal-400" />
              </div>
              <div>
                <p className="font-medium text-gray-900 dark:text-gray-100">Emails instantanes</p>
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  Recevoir un email pour chaque notification
                </p>
              </div>
            </div>
            <button
              onClick={() => handleBulkToggle('email_enabled', !allEmailEnabled)}
              disabled={saving === 'bulk-email_enabled'}
              className="flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg transition-colors border border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-800 text-gray-700 dark:text-gray-300 disabled:opacity-50"
            >
              {saving === 'bulk-email_enabled' ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : allEmailEnabled ? (
                <ToggleRight className="w-4 h-4" />
              ) : (
                <ToggleLeft className="w-4 h-4" />
              )}
              {allEmailEnabled ? 'Tout desactiver' : 'Tout activer'}
            </button>
          </div>
        </CardContent>
      </Card>

      {categories.map((category) => {
        const items = NOTIFICATION_TYPES.filter((nt) => nt.category === category);
        return (
          <Card key={category}>
            <CardContent className="p-0">
              <div className="flex items-center gap-3 px-5 py-4 border-b border-gray-100 dark:border-gray-700/50">
                {CATEGORY_ICONS[category]}
                <h3 className="font-semibold text-gray-900 dark:text-gray-100">{category}</h3>
              </div>
              <div className="divide-y divide-gray-100 dark:divide-gray-700/50">
                {items.map((nt) => {
                  const pref = getPref(nt.type as NotificationType);
                  const emailKey = `${nt.type}-email_enabled`;
                  const digestKey = `${nt.type}-digest_enabled`;
                  return (
                    <div
                      key={nt.type}
                      className="flex items-center justify-between px-5 py-4 hover:bg-gray-50/50 dark:hover:bg-gray-800/30 transition-colors"
                    >
                      <div className="flex-1 min-w-0 mr-8">
                        <p className="font-medium text-gray-900 dark:text-gray-100">{nt.label}</p>
                        <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">{nt.description}</p>
                      </div>
                      <div className="flex items-center gap-8 shrink-0">
                        <div className="flex flex-col items-center gap-1">
                          <span className="text-xs text-gray-500 dark:text-gray-400">Email</span>
                          <Toggle
                            enabled={pref.email_enabled}
                            onChange={(v) => handleToggle(nt.type as NotificationType, 'email_enabled', v)}
                            disabled={saving === emailKey}
                          />
                        </div>
                        <div className="flex flex-col items-center gap-1">
                          <span className="text-xs text-gray-500 dark:text-gray-400">Digest</span>
                          <Toggle
                            enabled={pref.digest_enabled}
                            onChange={(v) => handleToggle(nt.type as NotificationType, 'digest_enabled', v)}
                            disabled={saving === digestKey}
                          />
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        );
      })}

      <Card>
        <CardContent className="p-5">
          <div className="flex items-center gap-3 mb-4">
            <div className="p-2 rounded-lg bg-teal-50 dark:bg-teal-900/30">
              <MailCheck className="w-5 h-5 text-teal-600 dark:text-teal-400" />
            </div>
            <div>
              <p className="font-medium text-gray-900 dark:text-gray-100">Resume par email (Digest)</p>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                Recevez un email recapitulatif au lieu de notifications individuelles
              </p>
            </div>
          </div>
          <div className="flex flex-wrap gap-3">
            {[
              { value: null, label: 'Desactive' },
              { value: 'daily' as const, label: 'Quotidien' },
              { value: 'weekly' as const, label: 'Hebdomadaire' },
            ].map((option) => {
              const isActive =
                option.value === null
                  ? !digest?.is_active
                  : digest?.is_active && digest.digest_type === option.value;
              return (
                <button
                  key={option.value ?? 'off'}
                  onClick={() => handleDigestChange(option.value)}
                  disabled={saving === 'digest'}
                  className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium transition-all border ${
                    isActive
                      ? 'bg-teal-50 dark:bg-teal-900/30 border-teal-300 dark:border-teal-700 text-teal-700 dark:text-teal-300 ring-1 ring-teal-200 dark:ring-teal-800'
                      : 'border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800'
                  } disabled:opacity-50`}
                >
                  {saving === 'digest' ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Clock className="w-4 h-4" />
                  )}
                  {option.label}
                </button>
              );
            })}
          </div>
          {digest?.is_active && digest.last_sent_at && (
            <p className="text-xs text-gray-400 dark:text-gray-500 mt-3">
              Dernier envoi : {new Date(digest.last_sent_at).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
