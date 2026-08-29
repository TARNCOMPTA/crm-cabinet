/**
 * La matrice société × période d'un type de déclaration.
 * ---------------------------------------------------------------------------
 * ⚠️ UNE PÉRIODE, ET PLUS UN MOIS. La grille recevait une liste de mois ; elle
 * reçoit maintenant des COLONNES déjà groupées au rythme du tableau — au mois,
 * au trimestre, à l'année. Une TVA trimestrielle n'a rien à déclarer deux mois
 * sur trois : ces colonnes vides PAR CONSTRUCTION se lisaient comme du retard,
 * et le bilan était pire, avec onze vides pour une pleine. Le pas est décidé
 * côté serveur (`decoupageDe`), le groupement côté écran (`colonnesDe`), et ce
 * composant ne fait qu'afficher ce qu'on lui donne.
 *
 * La conséquence à garder en tête : UNE COLONNE N'EST PLUS UN MOIS, donc ce
 * qu'on écrit en base ne se déduit plus de la colonne. `resoudreCellule` rend
 * les deux mois réels — celui du statut, celui de la déclaration — parce que
 * `jedeclare_suivi_interne` est indexée sur un mois et contraint son format.
 *
 * Deux partis pris d'affichage, et ils commandent tout le reste :
 *
 *   · CHAQUE PÉRIODE OCCUPE DEUX COLONNES — « JD » ce que jedeclare constate, et
 *     « Cab. » ce que le cabinet en dit. Sans cette seconde rangée d'en-tête,
 *     vingt-quatre pastilles alignées ne se distinguent plus les unes des
 *     autres, et personne ne sait plus laquelle il vient de cliquer.
 *
 *   · JEDECLARE EST UN ROND, LE CABINET UN CARRÉ. Les deux sont pleins — un
 *     simple contour ne se voyait pas à quatorze pixels, et une pastille qu'on
 *     ne voit pas ne sert à rien. C'est donc la FORME qui distingue les deux
 *     autorités, pas le remplissage : la couleur seule n'y suffirait pas, les
 *     deux états emploient le même vert et le même orange, et rien ne
 *     séparerait « accepté par la DGFiP » de « validé par le collaborateur ».
 *
 * Le tableau est virtualisé : un type comme la TVA CA3 mensuelle porte plusieurs
 * centaines de sociétés sur vingt-quatre mois, soit plus de dix mille cellules.
 * Un `<table>` ordinaire les construit toutes, et le premier affichage se paie
 * en secondes. D'où la grille CSS et le positionnement absolu — un `<table>` ne
 * peut pas être virtualisé sans être disloqué.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useVirtualizer } from '@tanstack/react-virtual';
import { AlertTriangle, HelpCircle, Search, UserX } from 'lucide-react';
import { Input } from '../ui/Input';
import {
  LIBELLES_STATUT,
  STATUTS_INTERNES,
  resoudreCellule,
  type CelluleSuivi,
  type Colonne,
  type SocieteSuivie,
  type StatutInterne,
  type TableSuivi,
} from '../../lib/jedeclareService';

/**
 * Largeurs fixes : c'est ce qui permet aux deux rangées d'en-tête de s'aligner.
 * ---------------------------------------------------------------------------
 * ⚠️ DEUX JEUX, ET C'EST UNE CORRECTION DE BOGUE, PAS UN CONFORT. Sur un iPhone
 * tenu droit, le conteneur fait 340 px utiles. Les deux colonnes figées — 260
 * pour la société, 88 pour l'échéance — en occupaient 348 : PAS UNE SEULE
 * PASTILLE N'ÉTAIT VISIBLE, et comme les deux colonnes sont `sticky`, faire
 * défiler ne les découvrait pas davantage — elles recouvraient ce qu'on allait
 * chercher. L'écran affichait donc une liste de noms, et rien de ce pour quoi
 * il existe.
 *
 * Le jeu étroit laisse 160 px de données, soit un peu plus de deux mois lisibles
 * d'un coup. C'est peu, mais c'est infiniment plus que rien.
 *
 * `ligne` ne rétrécit PAS avec le reste : 44 px est le plus petit rectangle
 * qu'un doigt vise sans se tromper de ligne, et une pastille qu'on rate est
 * pire qu'une pastille qu'on ne voit pas — elle écrit un statut faux.
 */
const LARGE = { societe: 260, echeance: 88, cellule: 56, ligne: 44 } as const;
const ETROIT = { societe: 132, echeance: 48, cellule: 34, ligne: 44 } as const;

/**
 * Vrai sur un écran étroit, au sens du palier `sm` de Tailwind — celui que le
 * reste de l'application emploie déjà, pour que la grille bascule en même temps
 * que ce qui l'entoure.
 *
 * `matchMedia` plutôt qu'une mesure du conteneur : la bascule doit suivre la
 * rotation du téléphone, et un écouteur de média le fait sans observer la mise
 * en page à chaque image.
 */
function useEcranEtroit(): boolean {
  const [etroit, setEtroit] = useState(
    () => typeof window !== 'undefined' && window.matchMedia('(max-width: 640px)').matches
  );
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 640px)');
    const maj = () => setEtroit(mq.matches);
    mq.addEventListener('change', maj);
    return () => mq.removeEventListener('change', maj);
  }, []);
  return etroit;
}

const COULEUR_JD: Record<'vert' | 'orange' | 'rouge', string> = {
  vert: 'bg-green-500',
  orange: 'bg-amber-400',
  rouge: 'bg-red-500',
};

/**
 * Les cinq statuts du cabinet.
 *
 * `a_faire` et `sans_objet` sont les deux seuls gris, et ils veulent dire le
 * contraire l'un de l'autre — « personne ne s'en est occupé » contre « il n'y a
 * rien à faire ici ». Deux nuances voisines les rendaient indiscernables : d'où
 * l'ardoise franche d'un côté et le gris presque éteint de l'autre.
 */
const COULEUR_INTERNE: Record<StatutInterne, string> = {
  a_faire: 'bg-slate-600 dark:bg-slate-400',
  en_cours: 'bg-amber-500',
  a_controler: 'bg-violet-500',
  valide: 'bg-green-600',
  sans_objet: 'bg-gray-200 dark:bg-gray-700 ring-1 ring-inset ring-gray-300 dark:ring-gray-600',
};

interface Props {
  table: TableSuivi;
  /**
   * Les colonnes a afficher, deja au pas du tableau.
   *
   * ⚠️ DES COLONNES ET NON DES MOIS, depuis qu'une TVA trimestrielle se lit par
   * trimestres et un bilan par annees : une colonne peut recouvrir plusieurs
   * mois, et c'est `resoudreCellule` qui dit lequel elle vise reellement.
   */
  colonnes: Colonne[];
  onOuvrirDetail: (societe: SocieteSuivie, mois: string, cellule: CelluleSuivi) => void;
  onChangerStatut: (societe: SocieteSuivie, mois: string, statut: StatutInterne) => void;
  /** Fixe le jour d'echeance TVA du client, ou le retire avec `null`. */
  onFixerJour: (societe: SocieteSuivie, jour: number | null) => void;
  filtreMesDossiers: boolean;
}

export function MatriceSuivi({
  table,
  colonnes,
  onOuvrirDetail,
  onChangerStatut,
  onFixerJour,
  filtreMesDossiers,
}: Props) {
  const [recherche, setRecherche] = useState('');
  const [problemesSeuls, setProblemesSeuls] = useState(false);
  const [jourFiltre, setJourFiltre] = useState('tous');
  const etroit = useEcranEtroit();
  const L = etroit ? ETROIT : LARGE;
  const conteneur = useRef<HTMLDivElement>(null);

  /**
   * Le nombre de sociétés portant au moins un refus ou une anomalie.
   *
   * Il est calculé même quand le filtre est éteint : c'est lui qui justifie le
   * bouton. Sur un an réel, 135 refus et ~295 anomalies se noient dans 6 075
   * lignes — sans compteur visible, personne ne pense à les chercher.
   */
  const nbAvecProbleme = useMemo(
    () => table.societes.filter((s) => aUnProbleme(s)).length,
    [table.societes]
  );

  /**
   * Les jours d'echeance presents dans CE tableau.
   *
   * ⚠️ LA LISTE EST TIREE DES DONNEES, PAS DU CALENDRIER CA3. Proposer les
   * quatre jours en dur donnerait des choix qui ne selectionnent rien — un
   * tableau de TVA trimestrielle peut n'avoir aucune personne physique, donc ni
   * 16 ni 19. Un filtre qui vide la liste sans prevenir se lit comme une panne.
   */
  const { jours, sansJour } = useMemo(() => {
    const vus = new Set<number>();
    let manquant = false;
    for (const s of table.societes) {
      if (s.echeance?.jour != null) vus.add(s.echeance.jour);
      else manquant = true;
    }
    return { jours: [...vus].sort((a, b) => a - b), sansJour: manquant };
  }, [table.societes]);

  /**
   * Le filtre effectivement applique.
   *
   * ⚠️ CHANGER D'ONGLET NE REMONTE PAS LE COMPOSANT : l'etat du filtre survit au
   * passage de la TVA mensuelle a l'annuelle. Un « le 21 » herite du tableau
   * precedent y viderait tout, sans que rien n'explique pourquoi. Un filtre qui
   * ne correspond a rien ici est donc ignore plutot qu'applique.
   */
  const jourActif = useMemo(() => {
    if (jourFiltre === 'aucun') return sansJour ? 'aucun' : 'tous';
    if (jourFiltre !== 'tous' && !jours.includes(Number(jourFiltre))) return 'tous';
    return jourFiltre;
  }, [jourFiltre, jours, sansJour]);

  const societes = useMemo(() => {
    const terme = recherche.trim().toLowerCase();
    return table.societes.filter((s) => {
      if (filtreMesDossiers && !s.monDossier) return false;
      if (problemesSeuls && !aUnProbleme(s)) return false;
      if (jourActif !== 'tous') {
        const j = s.echeance?.jour ?? null;
        if (jourActif === 'aucun' ? j !== null : String(j) !== jourActif) return false;
      }
      if (!terme) return true;
      return (
        s.societe.toLowerCase().includes(terme) ||
        s.siren.includes(terme) ||
        s.dossier.toLowerCase().includes(terme) ||
        (s.clientNom ?? '').toLowerCase().includes(terme)
      );
    });
  }, [table.societes, recherche, filtreMesDossiers, problemesSeuls, jourActif]);

  const virtualiseur = useVirtualizer({
    count: societes.length,
    getScrollElement: () => conteneur.current,
    estimateSize: () => L.ligne,
    overscan: 12,
  });

  // ⚠️ LES TROIS GRILLES DOIVENT S'ACCORDER — les deux rangees d'en-tete et le
  // corps. La colonne d'echeance s'intercale entre la societe et les mois, et
  // n'existe QUE pour la TVA : elle est donc calculee une fois ici, et
  // interpolee partout, plutot que reecrite a trois endroits ou elle finirait
  // par diverger et desaligner l'en-tete du contenu.
  const colEcheance = table.estTva ? `${L.echeance}px ` : '';
  const largeur = L.societe + (table.estTva ? L.echeance : 0) + colonnes.length * L.cellule * 2;
  const grille = {
    display: 'grid',
    gridTemplateColumns: `${L.societe}px ${colEcheance}repeat(${colonnes.length * 2}, ${L.cellule}px)`,
    width: largeur,
  } as const;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex-1 min-w-[200px] max-w-sm">
          <Input
            value={recherche}
            onChange={(e) => setRecherche(e.target.value)}
            placeholder="Rechercher une société, un SIREN..."
            icon={<Search className="w-4 h-4" />}
          />
        </div>
        {/*
          Le filtre n'apparait que s'il a de quoi trancher : un seul jour dans
          tout le tableau, et le proposer ne ferait qu'ajouter un controle qui
          ne change rien.
        */}
        {table.estTva && jours.length + (sansJour ? 1 : 0) > 1 && (
          <select
            value={jourActif}
            onChange={(e) => setJourFiltre(e.target.value)}
            className={`px-3 py-2 rounded-lg text-sm font-medium border transition-all ${
              jourActif === 'tous'
                ? 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-400 border-gray-300 dark:border-gray-700'
                : 'bg-teal-50 dark:bg-teal-900/30 text-teal-700 dark:text-teal-300 border-teal-300 dark:border-teal-700'
            }`}
            title="N'afficher que les sociétés dues à ce jour du mois"
            aria-label="Filtrer par jour d'échéance"
          >
            <option value="tous">Toutes les échéances</option>
            {jours.map((j) => (
              <option key={j} value={j}>
                le {j}
              </option>
            ))}
            {sansJour && <option value="aucun">Sans jour</option>}
          </select>
        )}

        {nbAvecProbleme > 0 && (
          <button
            onClick={() => setProblemesSeuls((v) => !v)}
            className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-all border ${
              problemesSeuls
                ? 'bg-red-50 dark:bg-red-900/30 text-red-700 dark:text-red-300 border-red-300 dark:border-red-700'
                : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-400 border-gray-300 dark:border-gray-700 hover:border-red-300 dark:hover:border-red-700'
            }`}
            title="N'afficher que les sociétés portant un refus ou une anomalie"
          >
            <AlertTriangle className="w-4 h-4" />
            {nbAvecProbleme} à regarder
          </button>
        )}
        <p className="text-sm text-gray-500 dark:text-gray-400">
          {societes.length} société{societes.length > 1 ? 's' : ''}
          {societes.length !== table.societes.length && ` sur ${table.societes.length}`}
        </p>
      </div>

      <Destinataires liste={table.destinataires} />

      <Legende etroit={etroit} />

      {societes.length === 0 ? (
        <p className="py-10 text-center text-gray-500 dark:text-gray-400">
          Aucune société ne correspond à ce filtre.
        </p>
      ) : (
        <div
          ref={conteneur}
          className="overflow-auto max-h-[70vh] border border-gray-200 dark:border-gray-800 rounded-xl bg-white dark:bg-gray-900"
        >
          {/* En-tête : deux rangées, la première portant les mois sur deux colonnes. */}
          <div className="sticky top-0 z-20 bg-gray-50 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: `${L.societe}px ${colEcheance}repeat(${colonnes.length}, ${L.cellule * 2}px)`,
                width: largeur,
              }}
            >
              <div className="sticky left-0 z-10 bg-gray-50 dark:bg-gray-800 px-4 py-2 text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">
                Société
              </div>
              {table.estTva && (
                <div
                  className="sticky z-10 bg-gray-50 dark:bg-gray-800 py-2 text-center text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400 border-l border-gray-200 dark:border-gray-700"
                  style={{ left: L.societe }}
                  title="Jour du mois où la déclaration est due"
                >
                  {/* « ÉCHÉANCE » ne tient pas dans 48 px : sur étroit, le mot
                      est coupé à ce que la colonne peut porter sans mentir. */}
                  {etroit ? 'Éch.' : 'Échéance'}
                </div>
              )}
              {colonnes.map((c) => (
                <div
                  key={c.cle}
                  className="py-2 text-center text-xs font-medium text-gray-600 dark:text-gray-300 border-l border-gray-200 dark:border-gray-700"
                >
                  {c.libelle}
                </div>
              ))}
            </div>
            <div style={grille}>
              <div className="sticky left-0 z-10 bg-gray-50 dark:bg-gray-800" />
              {table.estTva && (
                <div
                  className="sticky z-10 bg-gray-50 dark:bg-gray-800 border-l border-gray-200 dark:border-gray-700"
                  style={{ left: L.societe }}
                />
              )}
              {colonnes.map((c) => (
                <FragmentEnTete key={c.cle} />
              ))}
            </div>
          </div>

          <div style={{ height: virtualiseur.getTotalSize(), width: largeur, position: 'relative' }}>
            {virtualiseur.getVirtualItems().map((v) => {
              const societe = societes[v.index];
              if (!societe) return null;
              return (
                <div
                  key={`${societe.siren}|${societe.dossier}|${societe.societe}`}
                  style={{
                    ...grille,
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    height: L.ligne,
                    transform: `translateY(${v.start}px)`,
                  }}
                  className="border-b border-gray-100 dark:border-gray-800 hover:bg-gray-50/70 dark:hover:bg-gray-800/40"
                >
                  <CelluleSociete societe={societe} />
                  {table.estTva && (
                    <CelluleEcheance
                      societe={societe}
                      onFixerJour={onFixerJour}
                      gauche={L.societe}
                    />
                  )}
                  {colonnes.map((c) => {
                    // Le mois vise n'est pas la colonne : sur un trimestre ou
                    // une annee, c'est celui qui porte la declaration — ou, a
                    // defaut, celui ou un statut a deja ete pose.
                    const { moisStatut, moisDeclaration, cellule, nbDeclarations } =
                      resoudreCellule(societe, c);
                    return (
                      <FragmentCellule
                        key={c.cle}
                        societe={societe}
                        moisStatut={moisStatut}
                        moisDeclaration={moisDeclaration}
                        periode={c.libelle}
                        cellule={cellule}
                        nbDeclarations={nbDeclarations}
                        typeDeclaration={table.typeDeclaration}
                        onOuvrirDetail={onOuvrirDetail}
                        onChangerStatut={onChangerStatut}
                      />
                    );
                  })}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * La légende.
 *
 * Elle nomme les deux FORMES avant de décliner les couleurs : c'est la forme qui
 * dit d'où vient l'information, et un vert jedeclare — « accepté par la DGFiP »
 * — n'a pas le même sens qu'un vert cabinet — « le collaborateur a fini ».
 */
/**
 * Un problème à regarder : un refus, ou une acceptation avec anomalie.
 *
 * Le « sans retour » n'en est PAS un — c'est un silence du destinataire,
 * fréquent et souvent normal (326 lignes sur l'année). L'inclure remplirait le
 * filtre de bruit et le rendrait inutile.
 */
function aUnProbleme(s: SocieteSuivie): boolean {
  return Object.values(s.cellules).some(
    (c) => c.jedeclare && (c.jedeclare.etat === 'rouge' || c.jedeclare.anomalie)
  );
}

/**
 * À qui part ce type de déclaration.
 *
 * ⚠️ CE BANDEAU EXISTE POUR EMPÊCHER UNE LECTURE FAUSSE. Le libellé de
 * jedeclare ne dit pas le destinataire, et « Liasses Fiscales » (ILF) désigne
 * en réalité la copie envoyée aux BANQUES du client : 433 lignes sur l'année,
 * aucune vers la DGFiP. Ses 27 refus et 45 anomalies se lisaient donc comme des
 * refus de l'administration — ils envoyaient chercher un incident fiscal qui
 * n'existe pas.
 *
 * Aucun classement « banque / administration » n'est tenté : on affiche le nom
 * brut. Deviner la nature du destinataire marcherait pour TARN COMPTA et se
 * tromperait chez le cabinet suivant.
 */
function Destinataires({ liste }: { liste: { nom: string; lignes: number }[] }) {
  if (!liste.length) return null;
  const tete = liste.slice(0, 3);
  const reste = liste.length - tete.length;
  return (
    <p className="text-xs text-gray-500 dark:text-gray-400">
      <span className="font-medium">Destinataire{liste.length > 1 ? 's' : ''} :</span>{' '}
      {tete.map((d) => `${d.nom} (${d.lignes})`).join(', ')}
      {reste > 0 && ` + ${reste} autre${reste > 1 ? 's' : ''}`}
    </p>
  );
}

function Legende({ etroit }: { etroit: boolean }) {
  const JD: [string, string][] = [
    ['bg-green-500', 'acceptée'],
    ['bg-amber-400', 'en attente'],
    ['bg-red-500', 'rejetée'],
  ];

  const contenu = (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-gray-500 dark:text-gray-400">
      <span className="font-medium text-gray-600 dark:text-gray-300">jedeclare</span>
      {JD.map(([couleur, libelle]) => (
        <span key={libelle} className="flex items-center gap-1.5">
          <span className={`w-3 h-3 rounded-full ${couleur}`} aria-hidden />
          {libelle}
        </span>
      ))}

      <span className="text-gray-300 dark:text-gray-600" aria-hidden>
        │
      </span>

      <span className="font-medium text-gray-600 dark:text-gray-300">cabinet</span>
      {STATUTS_INTERNES.map((s) => (
        <span key={s.value} className="flex items-center gap-1.5">
          <span className={`w-3 h-3 rounded-[3px] ${COULEUR_INTERNE[s.value]}`} aria-hidden />
          {s.label}
        </span>
      ))}
    </div>
  );

  if (!etroit) return contenu;

  /**
   * Sur un telephone, la legende se replie.
   *
   * Elle tient sur TROIS LIGNES a cette largeur — une centaine de pixels — et
   * repousse d'autant le tableau, qui est ce qu'on vient voir. C'est une
   * reference : on la consulte le premier jour, puis les formes et les couleurs
   * se lisent seules. Elle reste a un doigt, et depliee sur grand ecran ou la
   * place ne coute rien.
   */
  return (
    <details className="text-xs">
      <summary className="cursor-pointer text-gray-500 dark:text-gray-400 select-none">
        Légende
      </summary>
      <div className="pt-2">{contenu}</div>
    </details>
  );
}

function FragmentEnTete() {
  return (
    <>
      <div
        className="py-1.5 text-center text-[10px] font-semibold uppercase text-gray-400 border-l border-gray-200 dark:border-gray-700"
        title="Ce que jedeclare constate"
      >
        JD
      </div>
      <div
        className="py-1.5 text-center text-[10px] font-semibold uppercase text-gray-400"
        title="Le suivi du cabinet"
      >
        Cab.
      </div>
    </>
  );
}

/**
 * La colonne société.
 *
 * Une société non rapprochée est AFFICHÉE, pas masquée : elle télédéclare et
 * n'existe pas au portefeuille — c'est un dossier sorti ou une fiche manquante,
 * et c'est le signal le plus utile de cet écran.
 */
function CelluleSociete({ societe }: { societe: SocieteSuivie }) {
  return (
    <div className="sticky left-0 z-10 bg-white dark:bg-gray-900 px-4 flex items-center gap-2 min-w-0 border-r border-gray-200 dark:border-gray-800">
      <div className="min-w-0 flex-1">
        {societe.clientId ? (
          <Link
            to={`/clients/${societe.clientId}`}
            className="block truncate text-sm font-medium text-gray-900 dark:text-gray-100 hover:text-teal-600 dark:hover:text-teal-400"
            title={societe.societe}
          >
            {societe.societe}
          </Link>
        ) : (
          <span
            className="block truncate text-sm font-medium text-orange-700 dark:text-orange-400"
            title={societe.societe}
          >
            {societe.societe}
          </span>
        )}
        <span className="block truncate text-[10px] font-mono text-gray-400">
          {societe.siren || societe.dossier || '—'}
        </span>
      </div>
      {societe.rapprochement === 'ambigu' && (
        <AlertTriangle
          className="w-3.5 h-3.5 text-amber-500 flex-shrink-0"
          aria-label="Plusieurs fiches clients portent ce SIREN"
        />
      )}
      {societe.rapprochement === 'aucun' && (
        <UserX
          className="w-3.5 h-3.5 text-orange-500 flex-shrink-0"
          aria-label="Aucune fiche client ne correspond"
        />
      )}
      {societe.rapprochement === 'dossier' && (
        <HelpCircle
          className="w-3.5 h-3.5 text-gray-300 dark:text-gray-600 flex-shrink-0"
          aria-label="Rapproché par numéro de dossier, pas par SIREN"
        />
      )}
    </div>
  );
}

/**
 * La colonne d'echeance.
 *
 * Collee a la colonne societe (`left: gauche`) et sticky comme elle : le
 * tableau defile sur vingt-quatre mois, et un jour d'echeance qu'il faut
 * ramener a l'ecran pour le lire ne sert a rien quand on regarde decembre.
 */
function CelluleEcheance({
  societe,
  onFixerJour,
  gauche,
}: {
  societe: SocieteSuivie;
  onFixerJour: Props['onFixerJour'];
  /** Décalage de la colonne société, qui varie avec la largeur d'écran. */
  gauche: number;
}) {
  return (
    <div
      className="sticky z-10 bg-white dark:bg-gray-900 flex items-center justify-center border-r border-gray-200 dark:border-gray-800"
      style={{ left: gauche }}
    >
      <JourEcheance societe={societe} onFixerJour={onFixerJour} />
    </div>
  );
}

/**
 * Le jour du calendrier CA3, et sa surcharge.
 * ---------------------------------------------------------------------------
 * ⚠️ UN JOUR DÉDUIT ET UN JOUR SAISI NE SE VALENT PAS, et l'écran doit le dire.
 * La règle part de la forme juridique, qui est une donnée déclarative du CRM :
 * elle peut manquer, ou dater d'avant une transformation de société. Affichés à
 * l'identique, les deux se seraient confondus, et personne n'aurait su lequel
 * mérite d'être vérifié. D'où le soulignement pointillé sur le déduit, et
 * l'encre franche sur ce que le cabinet a tranché.
 *
 * Le motif est porté en `title` : un jour affiché sans sa justification ne peut
 * ni se vérifier ni se contester.
 */
function JourEcheance({
  societe,
  onFixerJour,
}: {
  societe: SocieteSuivie;
  onFixerJour: Props['onFixerJour'];
}) {
  const [edite, setEdite] = useState(false);
  // Hors TVA il n'y a rien à dire : le calendrier CA3 ne s'y applique pas.
  if (!societe.echeance) return null;
  const { jour, origine, motif, jourRegle } = societe.echeance;

  // La surcharge vit sur la fiche client : sans fiche, il n'y a rien à écrire.
  // Le jour reste affiché — c'est le rattachement qu'il faut corriger d'abord.
  const modifiable = Boolean(societe.clientId);

  if (edite && modifiable) {
    return (
      <select
        autoFocus
        className="text-[10px] font-mono bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded px-1 py-0 text-gray-900 dark:text-gray-100"
        defaultValue={origine === 'surcharge' && jour !== null ? String(jour) : ''}
        onBlur={() => setEdite(false)}
        onChange={(e) => {
          setEdite(false);
          const v = e.target.value;
          onFixerJour(societe, v === '' ? null : Number(v));
        }}
      >
        <option value="">
          {jourRegle === null ? 'Règle (aucun jour)' : `Règle (le ${jourRegle})`}
        </option>
        {Array.from({ length: 31 }, (_, i) => i + 1).map((j) => (
          <option key={j} value={j}>
            le {j}
          </option>
        ))}
      </select>
    );
  }

  const commun = 'text-xs tabular-nums';
  const titre = modifiable ? `${motif}\n\nCliquer pour fixer un autre jour.` : motif;

  const contenu =
    jour === null ? (
      <span className="text-gray-300 dark:text-gray-600">—</span>
    ) : origine === 'surcharge' ? (
      <span className="text-teal-700 dark:text-teal-400 font-semibold">le {jour}</span>
    ) : (
      <span className="text-gray-600 dark:text-gray-300 underline decoration-dotted decoration-gray-300 dark:decoration-gray-600 underline-offset-4">
        le {jour}
      </span>
    );

  if (!modifiable) {
    return (
      <span className={commun} title={titre}>
        {contenu}
      </span>
    );
  }

  return (
    <button
      type="button"
      className={`${commun} hover:text-teal-600 dark:hover:text-teal-400`}
      title={titre}
      onClick={() => setEdite(true)}
    >
      {contenu}
    </button>
  );
}

interface PropsCellule {
  societe: SocieteSuivie;
  /** Le mois REEL ou s'ecrit le statut du cabinet. */
  moisStatut: string;
  /** Le mois de la declaration montree : c'est lui qu'ouvre le detail. */
  moisDeclaration: string;
  /**
   * Ce que la colonne AFFICHE — « 1er T 26 », « 2026 », « mars 26 ».
   *
   * Distinct de `mois` a dessein : sur un trimestre, dire « mars 26 » dans une
   * infobulle sous une colonne intitulee « 1er T 26 » ferait douter de ce qu'on
   * regarde. L'utilisateur voit une periode, on lui nomme cette periode.
   */
  periode: string;
  cellule: CelluleSuivi;
  /** Declarations que la colonne recouvre : au-dela d'une, elle n'en montre qu'une. */
  nbDeclarations: number;
  typeDeclaration: string;
  onOuvrirDetail: Props['onOuvrirDetail'];
  onChangerStatut: Props['onChangerStatut'];
}

function FragmentCellule({
  societe,
  moisStatut,
  moisDeclaration,
  periode,
  cellule,
  nbDeclarations,
  onOuvrirDetail,
  onChangerStatut,
}: PropsCellule) {
  const { jedeclare, interne } = cellule;
  /*
    Une colonne groupee peut recouvrir plusieurs depots — une liasse et sa
    rectificative dans la meme annee. On n'en montre qu'un, et le taire
    laisserait croire qu'il n'y en a eu qu'un. L'anneau garde la priorite a
    l'anomalie : deux anneaux concentriques sur 14 px ne se distinguent pas.
  */
  const cumul = nbDeclarations > 1 ? ` (${nbDeclarations} declarations, la plus recente est affichee)` : '';

  return (
    <>
      <div className="flex items-center justify-center border-l border-gray-100 dark:border-gray-800">
        {jedeclare ? (
          <button
            type="button"
            onClick={() => onOuvrirDetail(societe, moisDeclaration, cellule)}
            title={`${societe.societe} — ${periode} : ${jedeclare.libelle}${cumul}`}
            aria-label={`${societe.societe}, ${periode} : ${jedeclare.libelle}${cumul}`}
            className={`w-3.5 h-3.5 rounded-full ${COULEUR_JD[jedeclare.etat]} ${
              jedeclare.anomalie
                ? 'ring-2 ring-offset-1 ring-amber-400 dark:ring-offset-gray-900'
                : nbDeclarations > 1
                  ? 'ring-2 ring-offset-1 ring-sky-400/70 dark:ring-offset-gray-900'
                  : ''
            } hover:scale-125 transition-transform`}
          />
        ) : (
          <span className="text-gray-200 dark:text-gray-700 select-none" aria-hidden>
            ·
          </span>
        )}
      </div>

      {/*
        Le `<select>` natif est posé transparent PAR-DESSUS la pastille : un clic
        ouvre la liste des cinq statuts, le clavier fonctionne, et rien de tout
        cela n'aurait tenu dans cinquante-six pixels sous forme de menu dessiné.
      */}
      <div className="relative flex items-center justify-center">
        {/*
          Carré, pas rond, et plein comme la pastille jedeclare. Seule
          l'absence de suivi reste en contour : il faut bien qu'une cellule
          jamais annotée se distingue d'une cellule classée « sans objet ».
        */}
        <span
          className={`w-3.5 h-3.5 rounded-[3px] ${
            interne
              ? COULEUR_INTERNE[interne.statut]
              : 'border-2 border-gray-200 dark:border-gray-700'
          }`}
          aria-hidden
        />
        <select
          value={interne?.statut ?? ''}
          onChange={(e) => onChangerStatut(societe, moisStatut, e.target.value as StatutInterne)}
          aria-label={`Suivi du cabinet — ${societe.societe}, ${periode}${
            interne ? ` : ${LIBELLES_STATUT[interne.statut]}` : ''
          }`}
          title={
            interne
              ? `${LIBELLES_STATUT[interne.statut]}${interne.commentaire ? ` — ${interne.commentaire}` : ''}`
              : 'Aucun suivi'
          }
          className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
        >
          <option value="" disabled>
            Choisir un statut
          </option>
          {STATUTS_INTERNES.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </select>
      </div>
    </>
  );
}
