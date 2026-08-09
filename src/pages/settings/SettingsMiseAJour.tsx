/**
 * Version de l'instance et mise à jour.
 * ---------------------------------------------------------------------------
 * L'instance savait déjà tout cela — `GET /api/version` existe depuis la refonte
 * — mais AUCUN écran ne l'appelait. Le tuyau était posé et débranché : une
 * version pouvait sortir sans qu'aucun cabinet ne l'apprenne jamais.
 *
 * Rien n'est appliqué d'ici, et c'est délibéré. Mettre à jour, c'est remplacer
 * l'image du conteneur : cela se fait sur le serveur, avec une sauvegarde
 * préalable, par quelqu'un qui peut lire le journal si cela se passe mal. Un
 * bouton « mettre à jour » dans un navigateur donnerait l'illusion du contraire.
 * L'écran dit donc ce qu'il faut taper, et où.
 */

import { useCallback, useEffect, useState } from 'react';
import {
  AlertTriangle,
  ArrowUpCircle,
  CheckCircle2,
  ExternalLink,
  Info,
  Loader2,
  RefreshCw,
  Terminal,
} from 'lucide-react';
import { Card, CardContent } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Badge } from '../../components/ui/Badge';
import { useToast } from '../../contexts/ToastContext';
import { VERSION_FRONT, etatVersion, type EtatVersion } from '../../lib/versionService';

/**
 * ⚠️ `sh maj.sh` ET NON `./maj.sh`, ET CE N'EST PAS UN DÉTAIL DE STYLE.
 *
 * Cet écran affichait `sudo ./installation/maj.sh`, qui échouait sur toute
 * installation :
 *
 *     sudo: cannot execute '/opt/crmcabinet/installation/maj.sh':
 *           Permission denied (os error 13)
 *
 * Le script était enregistré en `100644` dans git — sans bit exécutable. Le bit
 * est désormais posé, et cette commande fonctionnerait telle quelle ; on garde
 * pourtant `sh`, qui marche sur un dépôt cloné depuis un système de fichiers qui
 * ne porte pas les permissions, et sur une copie restaurée d'une archive.
 *
 * Le défaut a vécu longtemps parce que cet écran N'AVAIT JAMAIS EU DE MISE À
 * JOUR À PROPOSER : le manifeste répondait 404. Deux défauts qui se cachaient
 * l'un l'autre — corriger le premier a rendu le second atteignable.
 *
 * Le README et NOTICE-INSTALLATION.md disent la même chose. Les trois doivent
 * le rester : c'est la commande que l'administrateur copie sans la relire.
 */
const COMMANDE = 'cd /opt/crmcabinet && sudo sh installation/maj.sh';

export function SettingsMiseAJour() {
  const { showToast } = useToast();
  const [etat, setEtat] = useState<EtatVersion | null>(null);
  const [chargement, setChargement] = useState(true);
  const [verification, setVerification] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);

  const charger = useCallback(async (forcer = false) => {
    if (forcer) setVerification(true);
    else setChargement(true);
    setErreur(null);
    try {
      setEtat(await etatVersion(forcer));
      if (forcer) showToast('Vérification effectuée', 'success');
    } catch (e) {
      setErreur(e instanceof Error ? e.message : 'Vérification impossible.');
    } finally {
      setChargement(false);
      setVerification(false);
    }
  }, [showToast]);

  useEffect(() => {
    void charger();
  }, [charger]);

  if (chargement) {
    return (
      <div className="flex items-center gap-2 py-10 text-gray-500 dark:text-gray-400">
        <Loader2 className="w-4 h-4 animate-spin" />
        Lecture de la version...
      </div>
    );
  }

  const majDisponible = Boolean(etat && !etat.aJour && etat.distante);
  const verificationCoupee = Boolean(etat && !etat.distante && !etat.erreur);
  /**
   * Le navigateur peut exécuter un bundle plus ancien que l'instance : après une
   * mise à jour, tant que l'onglet n'a pas été rechargé. Le signaler évite
   * l'heure passée à chercher pourquoi un correctif « déployé » ne se voit pas.
   */
  const frontEnRetard = Boolean(etat && etat.locale !== 'dev' && VERSION_FRONT !== etat.locale);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
          Version et mise à jour
        </h2>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
          Ce que cette instance exécute, et ce qui est publié.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Card>
          <CardContent className="py-5">
            <p className="text-xs uppercase tracking-wider text-gray-500 dark:text-gray-400">
              Cette instance
            </p>
            <p className="text-2xl font-bold text-gray-900 dark:text-gray-100 mt-1 font-mono">
              {etat?.locale ?? '—'}
            </p>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
              Interface chargée : <span className="font-mono">{VERSION_FRONT}</span>
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="py-5">
            <p className="text-xs uppercase tracking-wider text-gray-500 dark:text-gray-400">
              Publiée
            </p>
            <div className="flex items-center gap-2 mt-1">
              <p className="text-2xl font-bold text-gray-900 dark:text-gray-100 font-mono">
                {etat?.distante ?? '—'}
              </p>
              {majDisponible && <Badge variant="warning">à jour disponible</Badge>}
              {etat?.aJour && etat.distante && <Badge variant="success">à jour</Badge>}
            </div>
            <button
              type="button"
              onClick={() => void charger(true)}
              disabled={verification}
              className="inline-flex items-center gap-1.5 text-xs text-teal-600 dark:text-teal-400 hover:underline mt-2 disabled:opacity-50"
            >
              <RefreshCw className={`w-3 h-3 ${verification ? 'animate-spin' : ''}`} />
              Vérifier maintenant
            </button>
          </CardContent>
        </Card>
      </div>

      {frontEnRetard && (
        <Encart
          ton="ambre"
          icone={AlertTriangle}
          titre="Votre onglet exécute une version différente de l’instance"
        >
          L’interface chargée ici est en <span className="font-mono">{VERSION_FRONT}</span>, le
          serveur en <span className="font-mono">{etat?.locale}</span>. Rechargez la page
          (Ctrl+Maj+R) pour prendre la nouvelle.
        </Encart>
      )}

      {erreur && (
        <Encart ton="ambre" icone={AlertTriangle} titre="Vérification impossible">
          {erreur} L’instance fonctionne parfaitement sans : cette lecture ne sert qu’à vous
          signaler qu’une version existe.
        </Encart>
      )}

      {etat?.erreur && !erreur && (
        <Encart ton="gris" icone={Info} titre="Le manifeste n’a pas pu être lu">
          {etat.erreur}. Sans accès sortant vers GitHub, l’instance ne peut pas savoir qu’une
          version existe — c’est sans conséquence sur son fonctionnement.
        </Encart>
      )}

      {verificationCoupee && (
        <Encart ton="gris" icone={Info} titre="Vérification désactivée">
          <span className="font-mono text-xs">UPDATE_DISABLED=1</span> coupe la lecture du
          manifeste. C’est le seul flux sortant du produit lui-même : un GET sur un fichier
          public, sans rien envoyer — ni domaine, ni nombre d’utilisateurs, ni statistique.
        </Encart>
      )}

      {majDisponible && (
        <Card>
          <CardContent className="py-5 space-y-4">
            <div className="flex items-start gap-3">
              <ArrowUpCircle className="w-5 h-5 text-teal-600 dark:text-teal-400 flex-shrink-0 mt-0.5" />
              <div>
                <p className="font-medium text-gray-900 dark:text-gray-100">
                  La version {etat?.distante} est disponible
                </p>
                {etat?.notes && (
                  <p className="text-sm text-gray-600 dark:text-gray-300 mt-1">{etat.notes}</p>
                )}
                <a
                  href="https://github.com/TARNCOMPTA/crmcabinet/blob/main/CHANGELOG.md"
                  target="_blank"
                  rel="noreferrer noopener"
                  className="inline-flex items-center gap-1.5 text-sm text-teal-600 dark:text-teal-400 hover:underline mt-2"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                  Lire le journal des versions
                </a>
              </div>
            </div>

            <div className="border-t border-gray-100 dark:border-gray-800 pt-4">
              <p className="text-sm text-gray-600 dark:text-gray-300 mb-2">
                La mise à jour se fait sur le serveur. Le script sauvegarde la base avant de
                remplacer l’image, et n’applique rien d’autre :
              </p>
              <div className="flex items-center gap-2 bg-gray-900 dark:bg-black rounded-lg px-3 py-2.5">
                <Terminal className="w-4 h-4 text-gray-400 flex-shrink-0" />
                <code className="text-xs text-gray-100 font-mono overflow-x-auto">{COMMANDE}</code>
                <Button
                  variant="ghost"
                  size="sm"
                  className="ml-auto text-gray-400 hover:text-white"
                  onClick={() => {
                    void navigator.clipboard.writeText(COMMANDE);
                    showToast('Commande copiée', 'success');
                  }}
                >
                  Copier
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {etat?.aJour && etat.distante && !frontEnRetard && (
        <Encart ton="vert" icone={CheckCircle2} titre="Cette instance est à jour">
          Rien à faire. La vérification est refaite au plus une fois toutes les six heures.
        </Encart>
      )}
    </div>
  );
}

const TONS = {
  ambre:
    'border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-800 dark:bg-amber-900/20 dark:text-amber-200',
  vert: 'border-green-200 bg-green-50 text-green-900 dark:border-green-800 dark:bg-green-900/20 dark:text-green-200',
  gris: 'border-gray-200 bg-gray-50 text-gray-700 dark:border-gray-700 dark:bg-gray-800/60 dark:text-gray-300',
} as const;

function Encart({
  ton,
  icone: Icone,
  titre,
  children,
}: {
  ton: keyof typeof TONS;
  icone: React.ComponentType<{ className?: string }>;
  titre: string;
  children: React.ReactNode;
}) {
  return (
    <div className={`flex gap-3 rounded-lg border p-4 ${TONS[ton]}`}>
      <Icone className="w-5 h-5 flex-shrink-0 mt-0.5" />
      <div className="text-sm">
        <p className="font-medium">{titre}</p>
        <p className="mt-1 opacity-90">{children}</p>
      </div>
    </div>
  );
}
