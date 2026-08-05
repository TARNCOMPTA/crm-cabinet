import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../contexts/ToastContext';
import { supabase } from '../../lib/supabase';
import { Card, CardContent } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { Fingerprint, Plus, ShieldCheck, Trash2, AlertTriangle } from 'lucide-react';

/**
 * Sécurité du compte : gestion des passkeys.
 * ---------------------------------------------------------------------------
 * Remplace l'écran de changement de mot de passe. Il n'y a plus de mot de passe
 * à changer, donc plus de jauge de robustesse, plus de confirmation, plus de
 * vérification de l'ancien.
 *
 * Ce qui compte ici, c'est le nombre de passkeys. Avec une seule, perdre
 * l'appareil signifie perdre l'accès — il faut alors un code d'enrôlement
 * généré par un administrateur. L'écran pousse donc explicitement à en enrôler
 * une deuxième, et le serveur refuse de supprimer la dernière.
 */

interface Passkey {
  id: string;
  libelle: string | null;
  created_at: string;
  last_used_at: string | null;
}

function formaterDate(iso: string | null): string {
  if (!iso) return 'jamais';
  return new Date(iso).toLocaleDateString('fr-FR', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  });
}

export function SettingsSecurite() {
  const { profile } = useAuth();
  const { showToast } = useToast();
  const [passkeys, setPasskeys] = useState<Passkey[]>([]);
  const [chargement, setChargement] = useState(true);
  const [ajoutOuvert, setAjoutOuvert] = useState(false);
  const [libelle, setLibelle] = useState('');
  const [enCours, setEnCours] = useState(false);

  const charger = useCallback(async () => {
    const { data, error } = await supabase.auth.listerPasskeys();
    if (error) {
      showToast(error.message, 'error');
    } else {
      setPasskeys(data?.passkeys ?? []);
    }
    setChargement(false);
  }, [showToast]);

  useEffect(() => {
    void charger();
  }, [charger]);

  async function ajouter() {
    setEnCours(true);
    // Session déjà ouverte : pas de code d'enrôlement à fournir.
    const { error } = await supabase.auth.enrolerPasskey({
      libelle: libelle.trim() || undefined,
    });
    if (error) {
      showToast(error.message, 'error');
    } else {
      showToast('Appareil enrôlé', 'success');
      setLibelle('');
      setAjoutOuvert(false);
      await charger();
    }
    setEnCours(false);
  }

  async function supprimer(id: string, nom: string) {
    if (!confirm(`Retirer « ${nom} » ? Cet appareil ne pourra plus se connecter.`)) return;
    const { error } = await supabase.auth.supprimerPasskey(id);
    if (error) {
      showToast(error.message, 'error');
    } else {
      showToast('Appareil retiré', 'success');
      await charger();
    }
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardContent className="p-6">
          <div className="flex items-start gap-3 mb-6">
            <div className="w-10 h-10 rounded-lg bg-teal-50 dark:bg-teal-950/40 flex items-center justify-center flex-shrink-0">
              <ShieldCheck className="w-5 h-5 text-teal-600 dark:text-teal-400" />
            </div>
            <div>
              <h3 className="font-semibold text-gray-900 dark:text-white">
                Connexion sans mot de passe
              </h3>
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
                Vous vous connectez avec l&apos;empreinte, le visage ou le code de vos
                appareils. Rien n&apos;est à retenir, et il n&apos;y a aucun mot de passe à
                intercepter.
              </p>
              {profile?.email && (
                <p className="text-sm text-gray-400 dark:text-gray-500 mt-2">
                  Compte : {profile.email}
                </p>
              )}
            </div>
          </div>

          {!chargement && passkeys.length === 1 && (
            <div className="mb-6 flex items-start gap-3 rounded-lg border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/30 px-4 py-3">
              <AlertTriangle className="w-5 h-5 text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5" />
              <p className="text-sm text-amber-800 dark:text-amber-300">
                Un seul appareil est enrôlé. Si vous le perdez, il faudra un code
                d&apos;enrôlement pour retrouver l&apos;accès. Enrôlez-en un deuxième
                (téléphone, autre poste) pour éviter cette situation.
              </p>
            </div>
          )}

          <div className="space-y-2">
            {chargement ? (
              <p className="text-sm text-gray-500 dark:text-gray-400">Chargement...</p>
            ) : passkeys.length === 0 ? (
              <p className="text-sm text-gray-500 dark:text-gray-400">
                Aucun appareil enrôlé.
              </p>
            ) : (
              passkeys.map((pk) => (
                <div
                  key={pk.id}
                  className="flex items-center gap-3 rounded-lg border border-gray-200 dark:border-gray-800 px-4 py-3"
                >
                  <Fingerprint className="w-5 h-5 text-gray-400 dark:text-gray-500 flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-gray-900 dark:text-white truncate">
                      {pk.libelle || 'Appareil sans nom'}
                    </p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      Enrôlé le {formaterDate(pk.created_at)} · dernière utilisation :{' '}
                      {formaterDate(pk.last_used_at)}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => supprimer(pk.id, pk.libelle || 'Appareil sans nom')}
                    className="p-2 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/40 transition-colors"
                    aria-label="Retirer cet appareil"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))
            )}
          </div>

          <div className="mt-6 pt-6 border-t border-gray-100 dark:border-gray-800">
            {ajoutOuvert ? (
              <div className="space-y-3">
                <Input
                  label="Nom de cet appareil (facultatif)"
                  value={libelle}
                  onChange={(e) => setLibelle(e.target.value)}
                  placeholder="iPhone, portable du bureau..."
                />
                <div className="flex gap-2">
                  <Button onClick={ajouter} disabled={enCours}>
                    {enCours ? 'Enrôlement...' : 'Enrôler'}
                  </Button>
                  <Button
                    variant="ghost"
                    onClick={() => {
                      setAjoutOuvert(false);
                      setLibelle('');
                    }}
                    disabled={enCours}
                  >
                    Annuler
                  </Button>
                </div>
              </div>
            ) : (
              <Button variant="outline" onClick={() => setAjoutOuvert(true)}>
                <Plus className="w-4 h-4 mr-2" />
                Enrôler un appareil
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
