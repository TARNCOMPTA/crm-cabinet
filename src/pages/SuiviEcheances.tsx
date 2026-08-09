/**
 * Suivi des échéances — les déclarations télétransmises via jedeclare.
 * ---------------------------------------------------------------------------
 * Un onglet par type de déclaration, DÉDUIT de ce que jedeclare a renvoyé :
 * aucun référentiel n'est tenu à jour ici. Un cabinet qui ne dépose pas de DAS2
 * n'a pas d'onglet DAS2, et un type nouveau apparaît de lui-même. L'inverse —
 * une liste écrite en dur — se serait périmée à la première évolution fiscale.
 *
 * Les filtres vivent dans l'URL. C'est ce qui rend une vue partageable : « la
 * TVA CA3 de mars, chez moi » tient dans un lien collé à un collègue, et le
 * retour arrière du navigateur fait ce qu'on attend de lui.
 *
 * CE QU'UNE CELLULE VIDE VEUT DIRE. Rien n'a été télétransmis pour ce mois — ou
 * la période n'a jamais été analysée. Ces deux situations ne se distinguent pas
 * à l'œil, d'où le compteur « X déclarations · Y en cache » en tête de page :
 * sans lui, un cache vide se lirait « aucune échéance en retard ».
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { CalendarClock, Info, RefreshCw, Stethoscope, UserX } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import { useShowMyDossiers } from '../hooks/useShowMyDossiers';
import { Card, CardContent } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Select } from '../components/ui/Select';
import { Badge } from '../components/ui/Badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/Tabs';
import { PageSkeleton } from '../components/ui/Skeleton';
import { MatriceSuivi } from '../components/suiviEcheances/MatriceSuivi';
import { DetailCellule } from '../components/suiviEcheances/DetailCellule';
import { AnalyseModal } from '../components/suiviEcheances/AnalyseModal';
import { DiagnosticJedeclare } from '../components/suiviEcheances/DiagnosticJedeclare';
import {
  chargerCatalogue,
  chargerSuivi,
  enregistrerStatut,
  lancerAnalyse,
  periodeParDefaut,
  type Catalogue,
  type CelluleSuivi,
  type SocieteSuivie,
  type StatutInterne,
  type Suivi,
} from '../lib/jedeclareService';

interface CelluleOuverte {
  societe: SocieteSuivie;
  mois: string;
  cellule: CelluleSuivi;
  typeDeclaration: string;
  libelleType: string;
}

export function SuiviEcheances() {
  const { isAdmin } = useAuth();
  const { showToast } = useToast();
  const [mesDossiers, basculerMesDossiers] = useShowMyDossiers();
  const [params, setParams] = useSearchParams();

  const defauts = useMemo(periodeParDefaut, []);
  const debut = params.get('debut') ?? defauts.debut;
  const fin = params.get('fin') ?? defauts.fin;
  const procedure = params.get('procedure') ?? 'TOUTES';
  const axe = params.get('axe') === 'depot' ? 'depot' : 'periode';
  const typeUrl = params.get('type') ?? '';

  const [suivi, setSuivi] = useState<Suivi | null>(null);
  const [catalogue, setCatalogue] = useState<Catalogue | null>(null);
  const [chargement, setChargement] = useState(true);
  const [erreur, setErreur] = useState<string | null>(null);
  const [ouverte, setOuverte] = useState<CelluleOuverte | null>(null);
  const [analyseOuverte, setAnalyseOuverte] = useState(false);
  const [diagnosticOuvert, setDiagnosticOuvert] = useState(false);

  const majFiltre = useCallback(
    (cles: Record<string, string>) => {
      const suivants = new URLSearchParams(params);
      for (const [cle, valeur] of Object.entries(cles)) {
        if (valeur) suivants.set(cle, valeur);
        else suivants.delete(cle);
      }
      setParams(suivants, { replace: true });
    },
    [params, setParams]
  );

  const charger = useCallback(async () => {
    setChargement(true);
    setErreur(null);
    try {
      setSuivi(await chargerSuivi({ debut, fin, procedure, axe }));
    } catch (e) {
      setErreur(e instanceof Error ? e.message : 'Chargement impossible.');
      setSuivi(null);
    } finally {
      setChargement(false);
    }
  }, [debut, fin, procedure, axe]);

  useEffect(() => {
    void charger();
  }, [charger]);

  useEffect(() => {
    chargerCatalogue().then(setCatalogue).catch(() => setCatalogue(null));
  }, []);

  /**
   * L'onglet actif.
   *
   * Changer de période fait disparaître des types : sans ce repli, un lien
   * partagé vers un type absent de la nouvelle période afficherait un écran
   * vide sans le dire.
   */
  const tables = suivi?.tables ?? [];
  const typeActif = tables.some((t) => t.typeDeclaration === typeUrl)
    ? typeUrl
    : (tables[0]?.typeDeclaration ?? '');

  const tableActive = tables.find((t) => t.typeDeclaration === typeActif) ?? null;

  /**
   * Écriture optimiste : la pastille change avant l'aller-retour, et revient à
   * sa valeur d'origine si le serveur refuse. Un tableau de plusieurs milliers
   * de cellules ne se recharge pas à chaque clic.
   */
  const changerStatut = useCallback(
    async (
      typeDeclaration: string,
      societe: SocieteSuivie,
      mois: string,
      statut: StatutInterne,
      commentaire?: string
    ) => {
      const avant = societe.cellules[mois]?.interne ?? null;

      const appliquer = (valeur: CelluleSuivi['interne']) => {
        setSuivi((etat) => {
          if (!etat) return etat;
          return {
            ...etat,
            tables: etat.tables.map((t) =>
              t.typeDeclaration !== typeDeclaration
                ? t
                : {
                    ...t,
                    societes: t.societes.map((s) =>
                      s.siren !== societe.siren || s.societe !== societe.societe
                        ? s
                        : {
                            ...s,
                            cellules: {
                              ...s.cellules,
                              [mois]: { ...s.cellules[mois], interne: valeur },
                            },
                          }
                    ),
                  }
            ),
          };
        });
      };

      appliquer({
        statut,
        commentaire: commentaire ?? avant?.commentaire ?? '',
        assigneeId: avant?.assigneeId ?? null,
        majLe: new Date().toISOString(),
      });

      try {
        await enregistrerStatut({
          societe,
          typeDeclaration,
          mois,
          axe,
          statut,
          commentaire: commentaire ?? avant?.commentaire ?? '',
        });
      } catch (e) {
        appliquer(avant);
        showToast(e instanceof Error ? e.message : 'Enregistrement refusé.', 'error');
      }
    },
    [axe, showToast]
  );

  if (chargement && !suivi) return <PageSkeleton />;

  const nonConfigure = suivi ? !suivi.configure : catalogue ? !catalogue.configure : false;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Suivi échéances</h1>
          <p className="text-gray-600 dark:text-gray-400 mt-1">
            Les déclarations télétransmises, par type et par mois.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={() => void charger()} disabled={chargement}>
            <RefreshCw className={`w-4 h-4 mr-2 ${chargement ? 'animate-spin' : ''}`} />
            Actualiser
          </Button>
          {isAdmin && !nonConfigure && (
            <Button variant="outline" onClick={() => setDiagnosticOuvert((v) => !v)}>
              <Stethoscope className="w-4 h-4 mr-2" />
              Diagnostic
            </Button>
          )}
          {isAdmin && !nonConfigure && (
            <Button onClick={() => setAnalyseOuverte(true)}>
              <CalendarClock className="w-4 h-4 mr-2" />
              Analyser
            </Button>
          )}
        </div>
      </div>

      {/* Une cellule vide ne dit pas si le mois n'a rien eu ou si un compte de
          flux n'a pas repondu. Le diagnostic est le seul endroit qui tranche. */}
      {diagnosticOuvert && isAdmin && !nonConfigure && (
        <DiagnosticJedeclare onFermer={() => setDiagnosticOuvert(false)} />
      )}

      {nonConfigure && (
        <Card>
          <CardContent className="py-10 text-center">
            <Info className="w-10 h-10 text-gray-400 mx-auto mb-4" />
            <p className="font-medium text-gray-900 dark:text-gray-100 mb-2">
              Suivi jedeclare non configuré
            </p>
            <p className="text-gray-500 dark:text-gray-400 max-w-xl mx-auto">
              Renseignez <code className="font-mono text-xs">JEDECLARE_LOGIN</code>,{' '}
              <code className="font-mono text-xs">JEDECLARE_MDP</code> et{' '}
              <code className="font-mono text-xs">JEDECLARE_EDITEUR</code> dans le fichier{' '}
              <code className="font-mono text-xs">.env</code> de l’instance, puis redémarrez-la.
              Le compte reste celui du cabinet : rien n’est mutualisé.
            </p>
          </CardContent>
        </Card>
      )}

      {erreur && !nonConfigure && (
        <Card>
          <CardContent className="py-8 text-center">
            <p className="text-red-600 dark:text-red-400">{erreur}</p>
          </CardContent>
        </Card>
      )}

      <div className="flex flex-wrap items-end gap-3">
        <div className="w-40">
          <Input
            label="Du"
            type="date"
            value={debut}
            onChange={(e) => majFiltre({ debut: e.target.value })}
          />
        </div>
        <div className="w-40">
          <Input
            label="Au"
            type="date"
            value={fin}
            onChange={(e) => majFiltre({ fin: e.target.value })}
          />
        </div>
        <div className="w-56">
          <Select
            label="Téléprocédure"
            value={procedure}
            onChange={(e) => majFiltre({ procedure: e.target.value })}
          >
            <option value="TOUTES">Toutes</option>
            {Object.entries(catalogue?.teleprocedures ?? {}).map(([code, libelle]) => (
              <option key={code} value={code}>
                {libelle}
              </option>
            ))}
          </Select>
        </div>
        <div className="w-48">
          <Select
            label="Colonnes"
            value={axe}
            onChange={(e) => majFiltre({ axe: e.target.value })}
          >
            <option value="periode">Mois déclaré</option>
            <option value="depot">Mois de dépôt</option>
          </Select>
        </div>
        <button
          onClick={basculerMesDossiers}
          className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-all border ${
            mesDossiers
              ? 'bg-teal-50 dark:bg-teal-900/30 text-teal-700 dark:text-teal-300 border-teal-300 dark:border-teal-700'
              : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-400 border-gray-300 dark:border-gray-700 hover:border-teal-300 dark:hover:border-teal-700'
          }`}
          title="N'afficher que les dossiers dont je suis collaborateur"
        >
          Mes dossiers
        </button>
      </div>

      {suivi && (
        <div className="flex flex-wrap items-center gap-4 text-sm text-gray-500 dark:text-gray-400">
          <span>
            <strong className="text-gray-900 dark:text-gray-100">{suivi.nbDeclarations}</strong>{' '}
            déclaration{suivi.nbDeclarations > 1 ? 's' : ''} sur la période
          </span>
          <span title="Accusés analysés et conservés, toutes périodes confondues">
            {suivi.nbEnCache} en cache
          </span>
          {suivi.sansClient > 0 && (
            <span className="flex items-center gap-1.5 text-orange-600 dark:text-orange-400">
              <UserX className="w-4 h-4" />
              {suivi.sansClient} société{suivi.sansClient > 1 ? 's' : ''} sans fiche client
            </span>
          )}
        </div>
      )}

      {suivi && tables.length === 0 && !nonConfigure && (
        <Card>
          <CardContent className="py-16 text-center">
            <CalendarClock className="w-12 h-12 text-gray-400 mx-auto mb-4" />
            <p className="font-medium text-gray-900 dark:text-gray-100 mb-2">
              Aucune déclaration sur cette période
            </p>
            <p className="text-gray-500 dark:text-gray-400">
              {suivi.nbEnCache === 0
                ? 'Rien n’a encore été analysé : un administrateur doit lancer une première analyse.'
                : 'Élargissez la période ou changez de téléprocédure.'}
            </p>
          </CardContent>
        </Card>
      )}

      {tables.length > 0 && (
        <Tabs
          defaultValue={typeActif}
          value={typeActif}
          onValueChange={(v) => majFiltre({ type: v })}
        >
          <TabsList className="overflow-x-auto">
            {tables.map((t) => (
              <TabsTrigger key={t.typeDeclaration} value={t.typeDeclaration}>
                <span className="flex items-center gap-2 whitespace-nowrap">
                  {t.libelle}
                  <Badge variant="gray">{t.societes.length}</Badge>
                </span>
              </TabsTrigger>
            ))}
          </TabsList>

          {tableActive && (
            <TabsContent value={tableActive.typeDeclaration} className="pt-4">
              <MatriceSuivi
                table={tableActive}
                mois={suivi?.mois ?? []}
                filtreMesDossiers={mesDossiers}
                onOuvrirDetail={(societe, mois, cellule) =>
                  setOuverte({
                    societe,
                    mois,
                    cellule,
                    typeDeclaration: tableActive.typeDeclaration,
                    libelleType: tableActive.libelle,
                  })
                }
                onChangerStatut={(societe, mois, statut) =>
                  void changerStatut(tableActive.typeDeclaration, societe, mois, statut)
                }
              />
            </TabsContent>
          )}
        </Tabs>
      )}

      <DetailCellule
        ouvert={ouverte !== null}
        onFermer={() => setOuverte(null)}
        societe={ouverte?.societe ?? null}
        mois={ouverte?.mois ?? ''}
        cellule={ouverte?.cellule ?? null}
        libelleType={ouverte?.libelleType ?? ''}
        onEnregistrer={async (statut, commentaire) => {
          if (!ouverte) return;
          await changerStatut(
            ouverte.typeDeclaration,
            ouverte.societe,
            ouverte.mois,
            statut,
            commentaire
          );
        }}
      />

      <AnalyseModal
        ouvert={analyseOuverte}
        onFermer={() => setAnalyseOuverte(false)}
        debut={debut}
        fin={fin}
        procedure={procedure}
        teleprocedures={catalogue?.teleprocedures ?? {}}
        onLancer={async (demande) => {
          const bilan = await lancerAnalyse(demande);
          await charger();
          return bilan;
        }}
      />
    </div>
  );
}
