/**
 * Tâches planifiées : ce qui tourne, quand, et ce qu'a donné le dernier tour.
 * ---------------------------------------------------------------------------
 * L'ordonnanceur fait tourner neuf tâches — dont la récupération jedeclare de
 * 2 h et les digests de 6 h. Son seul témoignage était le journal du serveur :
 * vérifier que la nuit s'était bien passée demandait un terminal.
 *
 * CE QUE CET ÉCRAN DIT, ET QUI COMPTE PLUS QUE LA LISTE : la dernière exécution
 * ET le dernier succès, séparément. Pour une tâche nocturne, « échoué ce matin,
 * mais ça marchait hier » est une information très différente de « échoué », et
 * les confondre ferait paniquer pour rien — ou rassurer à tort.
 */

import { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, CheckCircle2, Clock, Loader2, Play, RefreshCw } from 'lucide-react';
import { Card, CardContent } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Badge } from '../../components/ui/Badge';
import { useToast } from '../../contexts/ToastContext';
import {
  declencherTache,
  listerTachesPlanifiees,
  type EtatTache,
} from '../../lib/tachesPlanifieesService';
import { messageErreur } from '../../lib/erreurs';

/** « il y a 3 h », plutôt qu'un horodatage que personne ne soustrait de tête. */
function depuis(iso: string | null): string {
  if (!iso) return 'jamais';
  const ms = Date.now() - new Date(iso).getTime();
  if (Number.isNaN(ms)) return 'date illisible';
  const minutes = Math.floor(ms / 60_000);
  if (minutes < 1) return "a l'instant";
  if (minutes < 60) return `il y a ${minutes} min`;
  const heures = Math.floor(minutes / 60);
  if (heures < 24) return `il y a ${heures} h`;
  const jours = Math.floor(heures / 24);
  return `il y a ${jours} j`;
}

function horodatage(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleString('fr-FR');
}

function duree(ms: number | null): string {
  if (ms == null) return '';
  return ms < 1000 ? `${ms} ms` : `${(ms / 1000).toFixed(1)} s`;
}

export function SettingsTachesPlanifiees() {
  const { showToast } = useToast();
  const [taches, setTaches] = useState<EtatTache[]>([]);
  const [chargement, setChargement] = useState(true);
  const [erreur, setErreur] = useState<string | null>(null);
  const [lancee, setLancee] = useState<string | null>(null);

  const charger = useCallback(async () => {
    try {
      setTaches(await listerTachesPlanifiees());
      setErreur(null);
    } catch (e) {
      setErreur(messageErreur(e, 'Etat des taches indisponible.'));
    } finally {
      setChargement(false);
    }
  }, []);

  useEffect(() => {
    void charger();
  }, [charger]);

  const lancer = async (nom: string) => {
    setLancee(nom);
    try {
      await declencherTache(nom);
      showToast(`${nom} : terminee`, 'success');
    } catch (e) {
      showToast(messageErreur(e, 'Declenchement impossible'), 'error');
    } finally {
      setLancee(null);
      // Relire dans tous les cas : meme echouee, la tache a laisse une trace, et
      // c'est justement celle-la qu'on veut voir.
      void charger();
    }
  };

  if (chargement) {
    return (
      <div className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400">
        <Loader2 className="w-4 h-4 animate-spin" />
        Lecture de l'etat des taches…
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Taches planifiees</h2>
          <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
            Ce que l'instance fait toute seule, et ce qu'a donne le dernier tour. Les heures sont
            celles du serveur.
          </p>
        </div>
        <Button variant="outline" onClick={() => void charger()}>
          <RefreshCw className="w-4 h-4 mr-1.5" />
          Actualiser
        </Button>
      </div>

      {erreur && (
        <div className="flex items-center gap-3 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
          <AlertTriangle className="w-5 h-5 text-red-600 shrink-0" />
          <p className="text-sm text-red-800 dark:text-red-200">{erreur}</p>
        </div>
      )}

      <div className="space-y-2">
        {taches.map((t) => (
          <Card key={t.nom}>
            <CardContent className="py-4">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium text-sm text-gray-900 dark:text-gray-100">
                      {t.nom}
                    </span>
                    {t.enCours ? (
                      <Badge variant="blue">en cours</Badge>
                    ) : t.statut === 'echec' ? (
                      <Badge variant="warning">echec</Badge>
                    ) : t.statut === 'succes' ? (
                      <Badge variant="success">ok</Badge>
                    ) : (
                      <Badge variant="default">jamais lancee</Badge>
                    )}
                  </div>

                  <p className="mt-1 text-xs text-gray-500 dark:text-gray-400 flex items-center gap-1.5">
                    <Clock className="w-3.5 h-3.5" />
                    {t.quand}
                  </p>

                  {t.derniereExecution && (
                    <p
                      className="mt-1.5 text-xs text-gray-600 dark:text-gray-400"
                      title={horodatage(t.derniereExecution)}
                    >
                      Derniere execution {depuis(t.derniereExecution)}
                      {duree(t.dureeMs) && ` — ${duree(t.dureeMs)}`}
                    </p>
                  )}

                  {/*
                    Le dernier succes n'est montre QUE quand il differe du dernier
                    tour : le repeter sous chaque tache verte serait du bruit,
                    alors qu'apres un echec c'est l'information la plus utile de
                    l'ecran.
                  */}
                  {t.statut === 'echec' && (
                    <p
                      className="mt-0.5 text-xs text-gray-600 dark:text-gray-400 flex items-center gap-1.5"
                      title={horodatage(t.dernierSucces)}
                    >
                      <CheckCircle2 className="w-3.5 h-3.5 text-green-600 dark:text-green-400" />
                      Dernier succes {depuis(t.dernierSucces)}
                    </p>
                  )}

                  {t.detail && (
                    <p
                      className={`mt-1.5 text-xs break-words ${
                        t.statut === 'echec'
                          ? 'text-red-700 dark:text-red-300'
                          : 'text-gray-500 dark:text-gray-400'
                      }`}
                    >
                      {t.detail}
                    </p>
                  )}
                </div>

                <Button
                  variant="outline"
                  onClick={() => void lancer(t.nom)}
                  disabled={lancee !== null || t.enCours}
                  title="Lancer maintenant, sans attendre l'heure"
                >
                  {lancee === t.nom ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Play className="w-4 h-4" />
                  )}
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <p className="text-xs text-gray-500 dark:text-gray-400">
        Le bouton lance la tache immediatement. La reponse n'arrive qu'a la fin : une
        synchronisation INPI peut tenir plusieurs minutes.
      </p>
    </div>
  );
}
