import { useCallback, useEffect, useState } from 'react';
import { Inbox, Loader2, RotateCcw } from 'lucide-react';
import { Card, CardContent } from '../ui/Card';
import { Button } from '../ui/Button';
import { ConfirmDialog } from '../ui/ConfirmDialog';
import { useToast } from '../../contexts/ToastContext';

/**
 * La file d'envoi des courriels, et le moyen de relancer ce qui est bloqué.
 * ---------------------------------------------------------------------------
 * ⚠️ LA ROUTE DE RENVOI EXISTAIT SANS QUE RIEN NE L'APPELLE. Pendant la panne
 * Office 365 de septembre — vingt-quatre jours sans un envoi — c'était
 * exactement le recours qu'il fallait une fois le SMTP réparé, et il était
 * introuvable dans l'application.
 *
 * ⚠️ ICI, ET PAS DANS LE BANDEAU DU TABLEAU DE BORD. Le bandeau s'efface au
 * premier envoi réussi — c'est voulu, une alarme permanente ne se lit plus.
 * Mais le premier envoi réussi arrive JUSTEMENT après la réparation : le bouton
 * disparaîtrait avec le bandeau au moment où l'on en a besoin, et les courriels
 * bloqués resteraient oubliés. Cette section, elle, ne s'efface pas.
 *
 * ⚠️ LE BOUTON ANNONCE SON NOMBRE AVANT LE CLIC, lu par le serveur avec la même
 * fenêtre de sept jours que le renvoi lui-même. Un bouton « Renvoyer » sans
 * nombre ferait deviner ce qu'il va faire partir.
 */

interface EtatFile {
  enAttente: number;
  envoyes: number;
  enErreur: number;
  /** Absent d'une réponse servie par une version précédente, mise en cache. */
  reessayables?: number;
}

type Etat = { type: 'chargement' } | { type: 'pret'; file: EtatFile } | { type: 'echec' };

export function FileEnvoiEmails() {
  const { showToast } = useToast();
  const [etat, setEtat] = useState<Etat>({ type: 'chargement' });
  const [confirmer, setConfirmer] = useState(false);
  const [envoi, setEnvoi] = useState(false);

  const charger = useCallback(async () => {
    try {
      const r = await fetch('/api/emails/etat', { credentials: 'same-origin' });
      if (!r.ok) throw new Error(String(r.status));
      const d = (await r.json()) as { file?: EtatFile };
      setEtat(d.file ? { type: 'pret', file: d.file } : { type: 'echec' });
    } catch {
      setEtat({ type: 'echec' });
    }
  }, []);

  useEffect(() => {
    void charger();
  }, [charger]);

  async function renvoyer() {
    setEnvoi(true);
    try {
      const r = await fetch('/api/emails/reessayer', { method: 'POST', credentials: 'same-origin' });
      const d = (await r.json().catch(() => ({}))) as {
        remisEnFile?: number;
        sent?: number;
        failed?: number;
        message?: string;
      };
      if (!r.ok) throw new Error(d.message ?? 'Renvoi impossible.');
      const remis = d.remisEnFile ?? 0;
      // Le compte rendu dit ce qui est PARTI, pas seulement ce qui a été remis
      // en file : si le SMTP est encore en panne, les renvois échouent aussitôt,
      // et le dire vaut mieux qu'un « c'est fait » qui n'est pas vrai.
      if (remis === 0) {
        showToast('Aucun courriel en erreur à renvoyer.', 'info');
      } else if ((d.failed ?? 0) > 0 && (d.sent ?? 0) === 0) {
        showToast(
          `${remis} courriel(s) remis en file, mais l'envoi échoue encore : vérifiez la configuration ci-dessus.`,
          'error'
        );
      } else {
        showToast(`${remis} courriel(s) remis en file — ${d.sent ?? 0} déjà parti(s).`, 'success');
      }
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Renvoi impossible.', 'error');
    } finally {
      setEnvoi(false);
      setConfirmer(false);
      void charger();
    }
  }

  return (
    <Card>
      <CardContent className="p-5 space-y-3">
        <div className="flex items-center gap-2">
          <Inbox className="w-4 h-4 text-gray-500" />
          <h3 className="text-sm font-semibold text-gray-900 dark:text-white">File d&apos;envoi</h3>
        </div>

        {etat.type === 'chargement' && (
          <p className="text-sm text-gray-600 dark:text-gray-400">Lecture de la file…</p>
        )}

        {etat.type === 'echec' && (
          <p className="text-sm text-orange-700 dark:text-orange-400">
            L&apos;état de la file n&apos;a pas pu être lu. Cela ne dit rien des envois eux-mêmes.
          </p>
        )}

        {etat.type === 'pret' && (
          <>
            <dl className="grid grid-cols-3 gap-3 text-sm">
              <div>
                <dt className="text-gray-600 dark:text-gray-400">En attente</dt>
                <dd className="font-medium text-gray-900 dark:text-white">{etat.file.enAttente}</dd>
              </div>
              <div>
                <dt className="text-gray-600 dark:text-gray-400">Envoyés</dt>
                <dd className="font-medium text-gray-900 dark:text-white">{etat.file.envoyes}</dd>
              </div>
              <div>
                <dt className="text-gray-600 dark:text-gray-400">En erreur</dt>
                <dd
                  className={`font-medium ${etat.file.enErreur > 0 ? 'text-red-700 dark:text-red-400' : 'text-gray-900 dark:text-white'}`}
                >
                  {etat.file.enErreur}
                </dd>
              </div>
            </dl>

            {etat.file.reessayables !== undefined && (
              <div className="flex flex-wrap items-center gap-3 pt-1">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={etat.file.reessayables === 0 || envoi}
                  onClick={() => setConfirmer(true)}
                >
                  {envoi ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <RotateCcw className="w-4 h-4 mr-2" />}
                  {etat.file.reessayables === 0
                    ? 'Aucun courriel récent à renvoyer'
                    : `Renvoyer les ${etat.file.reessayables} courriel(s) en erreur`}
                </Button>
                <p className="text-xs text-gray-600 dark:text-gray-400">
                  Ceux des 7 derniers jours seulement : au-delà, une notification n&apos;informe plus.
                  À faire une fois la configuration corrigée et testée.
                </p>
              </div>
            )}
          </>
        )}
      </CardContent>

      <ConfirmDialog
        isOpen={confirmer}
        onClose={() => setConfirmer(false)}
        onConfirm={() => void renvoyer()}
        title="Renvoyer les courriels en erreur"
        message={
          etat.type === 'pret'
            ? `${etat.file.reessayables ?? 0} courriel(s) des 7 derniers jours vont repartir vers leurs destinataires. Assurez-vous que le test de configuration réussit avant de continuer.`
            : ''
        }
        confirmText="Renvoyer"
        variant="warning"
        loading={envoi}
      />
    </Card>
  );
}
