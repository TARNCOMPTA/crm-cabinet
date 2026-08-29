/**
 * Suivi des échéances — les déclarations télétransmises via jedeclare.
 * ---------------------------------------------------------------------------
 * TROIS ONGLETS — TVA, Bilan, Autres — puis une pastille par type à
 * l'intérieur. Il y en avait un par type de déclaration : sur un portefeuille
 * réel cela fait une douzaine d'entrées, plus les trois rythmes de TVA, dans une
 * barre qui défilait horizontalement et ne se lisait plus. Les trois familles
 * sont les trois moments de production d'un cabinet — la TVA au fil des mois, le
 * bilan à la clôture, le reste — et c'est ainsi que le travail se répartit.
 *
 * CE QUI N'A PAS CHANGÉ, ET NE DOIT PAS : rien n'est déduit d'un référentiel
 * tenu à jour à la main. La famille sort de la téléprocédure (`familleDe`,
 * serveur), les pastilles sortent de ce que jedeclare a réellement renvoyé. Un
 * cabinet qui ne dépose pas de DAS2 n'a pas de pastille DAS2, un type nouveau
 * apparaît de lui-même, et une famille sans aucune déclaration sur la période
 * n'a pas d'onglet du tout.
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
  fixerJourEcheance,
  colonnesDe,
  grouperParFamille,
  lancerAnalyse,
  periodeParDefaut,
  type Catalogue,
  type CelluleSuivi,
  type Echeance,
  type SocieteSuivie,
  type StatutInterne,
  type Suivi,
  type TableSuivi,
} from '../lib/jedeclareService';

interface CelluleOuverte {
  societe: SocieteSuivie;
  mois: string;
  cellule: CelluleSuivi;
  /** Le tableau d'ou vient la cellule — voir `changerStatut`. */
  cleTable: string;
  typeDeclaration: string;
  libelleType: string;
}

/**
 * Le choix du type À L'INTÉRIEUR d'un onglet.
 * ---------------------------------------------------------------------------
 * Des boutons plutôt qu'un second niveau d'onglets : deux barres d'onglets
 * l'une sous l'autre se ressemblent trop, et on ne sait plus laquelle commande
 * l'autre. `aria-pressed` dit ce qu'un lecteur d'écran doit entendre — une
 * sélection, pas un interrupteur isolé.
 *
 * ⚠️ UNE SEULE PASTILLE NE FAIT PAS UN BOUTON, MAIS LE NOM RESTE. Un contrôle
 * qui ne tranche rien est du bruit ; en revanche le type doit continuer d'être
 * nommé quelque part. C'est l'onglet qui le portait avant le regroupement, et
 * un écran affichant « Bilan » sans dire si l'on regarde les liasses ou l'IS
 * laisserait deviner — d'autant que le bandeau « Destinataires » juste en
 * dessous nomme la banque, ce qui n'a de sens qu'en sachant de quoi il parle.
 */
function PastillesType({
  tables,
  actif,
  onChoisir,
}: {
  tables: TableSuivi[];
  actif: string;
  onChoisir: (cle: string) => void;
}) {
  const seule = tables.length === 1 ? tables[0] : null;
  if (seule) {
    return (
      <p className="text-sm font-medium text-gray-700 dark:text-gray-300">{seule.libelle}</p>
    );
  }

  return (
    <div
      className="flex gap-2 overflow-x-auto pb-1"
      role="group"
      aria-label="Type de déclaration"
    >
      {tables.map((t) => {
        const choisi = t.cle === actif;
        return (
          <button
            key={t.cle}
            type="button"
            onClick={() => onChoisir(t.cle)}
            aria-pressed={choisi}
            className={`flex shrink-0 items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium transition-all border ${
              choisi
                ? 'bg-teal-50 dark:bg-teal-900/30 text-teal-700 dark:text-teal-300 border-teal-300 dark:border-teal-700'
                : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-400 border-gray-300 dark:border-gray-700 hover:border-teal-300 dark:hover:border-teal-700'
            }`}
          >
            <span className="whitespace-nowrap">{t.libelle}</span>
            <Badge variant="gray">{t.societes.length}</Badge>
          </button>
        );
      })}
    </div>
  );
}

export function SuiviEcheances() {
  const { isAdmin } = useAuth();
  const { showToast } = useToast();
  const [mesDossiers, basculerMesDossiers] = useShowMyDossiers();
  const [params, setParams] = useSearchParams();

  const defauts = useMemo(periodeParDefaut, []);
  const debut = params.get('debut') ?? defauts.debut;
  const fin = params.get('fin') ?? defauts.fin;
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
      setSuivi(await chargerSuivi({ debut, fin, axe }));
    } catch (e) {
      setErreur(e instanceof Error ? e.message : 'Chargement impossible.');
      setSuivi(null);
    } finally {
      setChargement(false);
    }
  }, [debut, fin, axe]);

  useEffect(() => {
    void charger();
  }, [charger]);

  useEffect(() => {
    chargerCatalogue().then(setCatalogue).catch(() => setCatalogue(null));
  }, []);

  // Mémorisé pour lui-même : sans cela `?? []` rend un nouveau tableau à chaque
  // rendu quand le suivi est vide, et le regroupement se rejoue pour rien.
  const tables = useMemo(() => suivi?.tables ?? [], [suivi]);
  const groupes = useMemo(() => grouperParFamille(tables), [tables]);

  /**
   * Le tableau affiché, et l'onglet qui s'en déduit.
   *
   * ⚠️ L'URL NE PORTE QUE `?type=<cle>`, ET L'ONGLET SE DÉDUIT DE LA TABLE.
   * Ajouter un second paramètre pour la famille aurait créé deux états à tenir
   * d'accord — et un lien partagé avant le regroupement, qui ne porte que
   * `type`, ouvre ainsi le bon onglet ET la bonne pastille sans rien réécrire.
   *
   * La pastille est désignée par `cle` et non par `typeDeclaration` : la TVA
   * produit trois tableaux — mensuelle, trimestrielle, annuelle — qui portent
   * tous le même code de déclaration, et indexer dessus les masquerait l'un
   * l'autre. `typeDeclaration` reste ce qu'on écrit en base pour le suivi
   * interne.
   *
   * Le repli existe parce que changer de période fait disparaître des types :
   * sans lui, un lien partagé vers un type absent de la nouvelle période
   * afficherait un écran vide sans le dire. Il emporte l'onglet avec lui.
   */
  const tableActive = tables.find((t) => t.cle === typeUrl) ?? tables[0] ?? null;
  const groupeActif =
    groupes.find((g) => g.famille === tableActive?.famille) ?? groupes[0] ?? null;

  /**
   * Les colonnes de la grille, au pas du tableau affiche.
   *
   * La fenetre de mois est GLOBALE — le serveur la calcule une fois pour toutes
   * les tables — mais le pas ne l'est pas : une TVA trimestrielle se lit par
   * trimestres, un bilan par annees, une DSN au mois. Le regroupement se fait
   * donc ici, a l'affichage, et non dans la reponse : les memes mois servent
   * plusieurs tableaux qui ne les decoupent pas pareil.
   */
  const colonnes = useMemo(
    () => colonnesDe(suivi?.mois ?? [], tableActive?.decoupage ?? 'mois'),
    [suivi?.mois, tableActive?.decoupage]
  );

  /**
   * Écriture optimiste : la pastille change avant l'aller-retour, et revient à
   * sa valeur d'origine si le serveur refuse. Un tableau de plusieurs milliers
   * de cellules ne se recharge pas à chaque clic.
   */
  const changerStatut = useCallback(
    async (
      cleTable: string,
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
              // ⚠️ ON VISE LE TABLEAU, PAS LE TYPE. Les trois tableaux de TVA
              // partagent un meme `typeDeclaration` : filtrer dessus toucherait
              // aussi les deux autres, et poserait une pastille « Cab. » sur un
              // mois que ce tableau-la n'affiche pas — un fantome qui disparait
              // au rechargement, puisque le serveur n'attache l'etat interne
              // qu'aux mois reellement presents dans la table.
              t.cle !== cleTable
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

  /**
   * Fixe le jour d'echeance TVA d'un client, ou le retire.
   *
   * ⚠️ LA SURCHARGE VIT SUR LA FICHE CLIENT, PAS SUR LA SOCIETE : elle vaut donc
   * pour TOUS les tableaux ou ce client apparait — une societe qui a change de
   * regime figure a la fois en mensuelle et en trimestrielle, et son jour ne
   * saurait differer de l'un a l'autre. D'ou le balayage de toutes les tables
   * sur `clientId`, et non sur le SIREN de la seule ligne cliquee.
   *
   * `jourRegle` est conserve tel quel : c'est ce que la regle donnerait, et
   * poser une surcharge ne le change pas.
   */
  const fixerJour = useCallback(
    async (societe: SocieteSuivie, jour: number | null) => {
      const clientId = societe.clientId;
      if (!clientId) return;
      const avant = societe.echeance;

      const appliquer = (valeur: Echeance | null) => {
        setSuivi((etat) => {
          if (!etat) return etat;
          return {
            ...etat,
            tables: etat.tables.map((t) => ({
              ...t,
              societes: t.societes.map((s) =>
                s.clientId !== clientId || !s.echeance ? s : { ...s, echeance: valeur ?? s.echeance }
              ),
            })),
          };
        });
      };

      appliquer(
        jour === null
          ? {
              jour: avant?.jourRegle ?? null,
              origine: avant?.jourRegle == null ? 'inconnue' : 'regle',
              motif: 'Retour à la règle. Rechargez pour le détail.',
              jourRegle: avant?.jourRegle ?? null,
            }
          : {
              jour,
              origine: 'surcharge',
              motif: 'Jour fixé sur la fiche client.',
              jourRegle: avant?.jourRegle ?? null,
            }
      );

      try {
        await fixerJourEcheance({ clientId, jour });
      } catch (e) {
        appliquer(avant);
        showToast(e instanceof Error ? e.message : 'Enregistrement refusé.', 'error');
      }
    },
    [showToast]
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

      {groupes.length > 0 && (
        <Tabs
          defaultValue={groupeActif?.famille ?? ''}
          value={groupeActif?.famille ?? ''}
          /*
            Changer d'onglet, c'est choisir sa PREMIÈRE PASTILLE. L'URL ne porte
            que `type`, et lui laisser désigner un tableau précis est ce qui rend
            un lien reproductible : « la TVA trimestrielle de mars » se colle à un
            collègue, et il voit exactement la même chose.
          */
          onValueChange={(f) => {
            const premiere = groupes.find((g) => g.famille === f)?.tables[0];
            if (premiere) majFiltre({ type: premiere.cle });
          }}
        >
          <TabsList aria-label="Familles d'echeances" className="overflow-x-auto">
            {groupes.map((g) => (
              <TabsTrigger key={g.famille} value={g.famille}>
                <span className="flex items-center gap-2 whitespace-nowrap">
                  {g.libelle}
                  {/* Sociétés DISTINCTES : une société déclarant en TVA mensuelle
                      et en remboursement ne compte qu'une fois. Voir
                      `grouperParFamille`. */}
                  <Badge variant="gray">{g.nbSocietes}</Badge>
                </span>
              </TabsTrigger>
            ))}
          </TabsList>

          {groupeActif && tableActive && (
            <TabsContent value={groupeActif.famille} className="pt-4 space-y-4">
              <PastillesType
                tables={groupeActif.tables}
                actif={tableActive.cle}
                onChoisir={(cle) => majFiltre({ type: cle })}
              />
              <MatriceSuivi
                table={tableActive}
                colonnes={colonnes}
                filtreMesDossiers={mesDossiers}
                onOuvrirDetail={(societe, mois, cellule) =>
                  setOuverte({
                    societe,
                    mois,
                    cellule,
                    cleTable: tableActive.cle,
                    typeDeclaration: tableActive.typeDeclaration,
                    libelleType: tableActive.libelle,
                  })
                }
                onChangerStatut={(societe, mois, statut) =>
                  void changerStatut(
                    tableActive.cle,
                    tableActive.typeDeclaration,
                    societe,
                    mois,
                    statut
                  )
                }
                onFixerJour={(societe, jour) => void fixerJour(societe, jour)}
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
            ouverte.cleTable,
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
