import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { MailWarning } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { verdictEnvoiEmails, type EtatEnvoiEmails } from '../../lib/etatEmails';

/**
 * Le bandeau qui aurait évité vingt-quatre jours de silence.
 * ---------------------------------------------------------------------------
 * Voir `src/lib/etatEmails.ts` pour l'incident. En deux mots : plus aucun
 * courriel ne partait depuis le 15 août — ni les tâches, ni les récapitulatifs,
 * ni les relances — et la seule trace était un compteur sur l'écran des
 * réglages SMTP, c'est-à-dire un écran qu'on n'ouvre que lorsqu'on soupçonne
 * déjà quelque chose.
 *
 * ⚠️ IL EST SUR LE TABLEAU DE BORD, ET C'EST TOUT LE SUJET. Un signalement placé
 * là où il faut déjà se douter du problème ne signale rien. Le tableau de bord
 * est le seul écran que tout le monde ouvre tous les jours.
 *
 * ⚠️ ADMINISTRATEURS SEULEMENT, et pas par prudence excessive : la route est en
 * `exigerAdmin`, donc un collaborateur ne reçoit qu'un 403. Interroger quand
 * même produirait une erreur en console à chaque ouverture du tableau de bord,
 * pour un bandeau que la personne ne pourrait de toute façon pas traiter — les
 * réglages SMTP sont fermés aux non-administrateurs.
 *
 * ⚠️ UN ÉCHEC DE CETTE LECTURE NE DIT RIEN. Si `/api/emails/etat` ne répond pas,
 * on n'affiche pas de bandeau — mais on n'affiche pas non plus « tout va bien ».
 * On ne sait pas, et ce module n'a pas à trancher : c'est la règle que ce dépôt
 * répète partout, ne jamais confondre « absent » et « on n'a pas pu savoir ».
 */
export function BandeauEnvoiEmails() {
  const { profile } = useAuth();
  const [etat, setEtat] = useState<EtatEnvoiEmails | null>(null);

  useEffect(() => {
    if (profile?.role !== 'admin') return;
    let vivant = true;
    fetch('/api/emails/etat', { credentials: 'include' })
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { panne?: EtatEnvoiEmails } | null) => {
        if (vivant && d?.panne) setEtat(d.panne);
      })
      .catch(() => {
        /* Silencieux : voir l'en-tête. Un bandeau absent n'affirme rien. */
      });
    return () => {
      vivant = false;
    };
  }, [profile?.role]);

  if (!etat) return null;
  const verdict = verdictEnvoiEmails(etat);
  if (!verdict.enPanne) return null;

  return (
    <div
      role="alert"
      className="rounded-lg border border-red-300 bg-red-50 p-4 dark:border-red-800 dark:bg-red-950/40"
    >
      <div className="flex items-start gap-3">
        <MailWarning className="mt-0.5 h-5 w-5 shrink-0 text-red-600 dark:text-red-400" />
        <div className="min-w-0">
          <p className="font-medium text-red-900 dark:text-red-200">{verdict.titre}</p>
          <p className="mt-1 text-sm text-red-800 dark:text-red-300">{verdict.detail}</p>
          <Link
            to="/settings?tab=smtp"
            className="mt-2 inline-block text-sm font-medium text-red-900 underline hover:no-underline dark:text-red-200"
          >
            Ouvrir les réglages Emails
          </Link>
        </div>
      </div>
    </div>
  );
}
