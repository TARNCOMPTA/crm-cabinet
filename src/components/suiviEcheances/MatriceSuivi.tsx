/**
 * La matrice société × mois d'un type de déclaration.
 * ---------------------------------------------------------------------------
 * Deux partis pris d'affichage, et ils commandent tout le reste :
 *
 *   · CHAQUE MOIS OCCUPE DEUX COLONNES — « JD » ce que jedeclare constate, et
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

import { useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useVirtualizer } from '@tanstack/react-virtual';
import { AlertTriangle, HelpCircle, Search, UserX } from 'lucide-react';
import { Input } from '../ui/Input';
import {
  LIBELLES_STATUT,
  STATUTS_INTERNES,
  moisCourt,
  type CelluleSuivi,
  type SocieteSuivie,
  type StatutInterne,
  type TableSuivi,
} from '../../lib/jedeclareService';

/** Largeurs fixes : c'est ce qui permet aux deux rangées d'en-tête de s'aligner. */
const L_SOCIETE = 260;
const L_CELLULE = 56;
const H_LIGNE = 44;

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
  mois: string[];
  onOuvrirDetail: (societe: SocieteSuivie, mois: string, cellule: CelluleSuivi) => void;
  onChangerStatut: (societe: SocieteSuivie, mois: string, statut: StatutInterne) => void;
  filtreMesDossiers: boolean;
}

export function MatriceSuivi({
  table,
  mois,
  onOuvrirDetail,
  onChangerStatut,
  filtreMesDossiers,
}: Props) {
  const [recherche, setRecherche] = useState('');
  const [problemesSeuls, setProblemesSeuls] = useState(false);
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

  const societes = useMemo(() => {
    const terme = recherche.trim().toLowerCase();
    return table.societes.filter((s) => {
      if (filtreMesDossiers && !s.monDossier) return false;
      if (problemesSeuls && !aUnProbleme(s)) return false;
      if (!terme) return true;
      return (
        s.societe.toLowerCase().includes(terme) ||
        s.siren.includes(terme) ||
        s.dossier.toLowerCase().includes(terme) ||
        (s.clientNom ?? '').toLowerCase().includes(terme)
      );
    });
  }, [table.societes, recherche, filtreMesDossiers, problemesSeuls]);

  const virtualiseur = useVirtualizer({
    count: societes.length,
    getScrollElement: () => conteneur.current,
    estimateSize: () => H_LIGNE,
    overscan: 12,
  });

  const largeur = L_SOCIETE + mois.length * L_CELLULE * 2;
  const grille = {
    display: 'grid',
    gridTemplateColumns: `${L_SOCIETE}px repeat(${mois.length * 2}, ${L_CELLULE}px)`,
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

      <Legende />

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
                gridTemplateColumns: `${L_SOCIETE}px repeat(${mois.length}, ${L_CELLULE * 2}px)`,
                width: largeur,
              }}
            >
              <div className="sticky left-0 z-10 bg-gray-50 dark:bg-gray-800 px-4 py-2 text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">
                Société
              </div>
              {mois.map((m) => (
                <div
                  key={m}
                  className="py-2 text-center text-xs font-medium text-gray-600 dark:text-gray-300 border-l border-gray-200 dark:border-gray-700"
                >
                  {moisCourt(m)}
                </div>
              ))}
            </div>
            <div style={grille}>
              <div className="sticky left-0 z-10 bg-gray-50 dark:bg-gray-800" />
              {mois.map((m) => (
                <FragmentEnTete key={m} />
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
                    height: H_LIGNE,
                    transform: `translateY(${v.start}px)`,
                  }}
                  className="border-b border-gray-100 dark:border-gray-800 hover:bg-gray-50/70 dark:hover:bg-gray-800/40"
                >
                  <CelluleSociete societe={societe} />
                  {mois.map((m) => {
                    const cellule = societe.cellules[m] ?? { jedeclare: null, interne: null };
                    return (
                      <FragmentCellule
                        key={m}
                        societe={societe}
                        mois={m}
                        cellule={cellule}
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
 * brut. Deviner la nature du destinataire marcherait dans le cabinet où la règle
 * a été écrite, et se tromperait chez le suivant.
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

function Legende() {
  const JD: [string, string][] = [
    ['bg-green-500', 'acceptée'],
    ['bg-amber-400', 'en attente'],
    ['bg-red-500', 'rejetée'],
  ];

  return (
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
        <span className="block text-[10px] font-mono text-gray-400">
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

interface PropsCellule {
  societe: SocieteSuivie;
  mois: string;
  cellule: CelluleSuivi;
  typeDeclaration: string;
  onOuvrirDetail: Props['onOuvrirDetail'];
  onChangerStatut: Props['onChangerStatut'];
}

function FragmentCellule({
  societe,
  mois,
  cellule,
  onOuvrirDetail,
  onChangerStatut,
}: PropsCellule) {
  const { jedeclare, interne } = cellule;

  return (
    <>
      <div className="flex items-center justify-center border-l border-gray-100 dark:border-gray-800">
        {jedeclare ? (
          <button
            type="button"
            onClick={() => onOuvrirDetail(societe, mois, cellule)}
            title={`${societe.societe} — ${moisCourt(mois)} : ${jedeclare.libelle}`}
            aria-label={`${societe.societe}, ${moisCourt(mois)} : ${jedeclare.libelle}`}
            className={`w-3.5 h-3.5 rounded-full ${COULEUR_JD[jedeclare.etat]} ${
              jedeclare.anomalie ? 'ring-2 ring-offset-1 ring-amber-400 dark:ring-offset-gray-900' : ''
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
          onChange={(e) => onChangerStatut(societe, mois, e.target.value as StatutInterne)}
          aria-label={`Suivi du cabinet — ${societe.societe}, ${moisCourt(mois)}${
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
