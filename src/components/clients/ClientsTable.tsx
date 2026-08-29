import type { DragEndEvent } from '@dnd-kit/core';
import { useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Building,
  FileText,
  ExternalLink,
  ArrowUp,
  ArrowDown,
  ArrowUpDown,
  Mail,
  Pencil,
} from 'lucide-react';
import { CopyButton } from '../ui/CopyButton';
import { Badge } from '../ui/Badge';
import { Card } from '../ui/Card';
import { DefilementHorizontal } from '../ui/DefilementHorizontal';
import { LegalFormDisplay } from './LegalFormDisplay';
import { CollaboratorAvatarGroup } from '../ui/CollaboratorAvatarGroup';
import { SortableTableWrapper } from '../ui/SortableTableWrapper';
import { SortableRow } from '../ui/SortableRow';
import { validateField, type EditableFieldKey } from '../../lib/incompleteFieldsConfig';
import { MOIS_CLOTURE } from './MonthPicker';
import type { RegimeOption } from '../../hooks/useRegimesFiscaux';
import type { SortField } from '../../hooks/useClientFilters';

import type { ClientListe } from './colonnesListe';

/**
 * ⚠️ CE TYPE EST PLUS ÉTROIT QUE LA LIGNE COMPLÈTE, ET C'EST LE POINT. La liste
 * ne demande à la base que les colonnes qu'elle affiche ; lire ici une colonne
 * absente de `COLONNES_LISTE` ne compile pas, au lieu d'arriver `undefined` à
 * l'écran. Voir `colonnesListe.ts`.
 */
type Client = ClientListe;

/**
 * Les quatre colonnes que la liste sait completer sur place, et les deux qui se
 * saisissent au clavier.
 *
 * `ChampTexte` n'est pas une commodite : `SaisieTexte` appelle a la fois
 * `validateField` (qui attend un `EditableFieldKey`) et l'enregistreur (qui
 * n'accepte que ces quatre-la). Nommer l'intersection evite de forcer l'une des
 * deux signatures.
 */
type ChampSaisissable = 'email' | 'numero_dossier' | 'regime_fiscal' | 'date_cloture';
type ChampTexte = Extract<ChampSaisissable, EditableFieldKey>;

/**
 * Enregistre un champ saisi dans la liste. Rend `true` si l'ecriture a abouti —
 * la cellule garde la saisie en cas d'echec, pour que rien de ce qui a ete tape
 * ne soit perdu.
 */
type EnregistrerChamp = (
  clientId: string,
  champ: ChampSaisissable,
  valeur: string
) => Promise<boolean>;

interface ColumnDef {
  field: SortField;
  label: string;
}

const TABLE_COLUMNS: ColumnDef[] = [
  { field: 'nom_entreprise', label: 'Entreprise' },
  { field: 'dirigeant', label: 'Dirigeant' },
  { field: 'numero_dossier', label: 'N Dossier' },
  { field: 'siren', label: 'SIREN' },
  { field: 'siret', label: 'SIRET' },
  // La ville, et PAS le numero de TVA : sept colonnes suffisent, et un numero de
  // TVA est une donnee de fiche que personne ne parcourt en liste.
  { field: 'ville', label: 'Ville' },
  { field: 'regime_fiscal', label: 'Regime' },
  { field: 'date_cloture', label: 'Cloture' },
];

interface Props {
  clients: Client[];
  displayIds: string[];
  selectedClientIds: Set<string>;
  sortField: SortField;
  sortDirection: 'asc' | 'desc';
  useCustomOrder: boolean;
  onSortToggle: (field: SortField) => void;
  onToggleSelection: (clientId: string) => void;
  onToggleSelectAll: () => void;
  onOpenAssignModal: (client: Client) => void;
  /**
   * Les regimes ACTIFS du cabinet. Deja charges par la page pour son filtre :
   * la cellule s'en sert pour proposer les choix ET pour afficher le libelle a
   * la place du code stocke.
   */
  regimes: RegimeOption[];
  onSaveChamp: EnregistrerChamp;
  onDragEnd: (event: DragEndEvent) => void;
}

export function ClientsTable({
  clients,
  displayIds,
  selectedClientIds,
  sortField,
  sortDirection,
  useCustomOrder,
  onSortToggle,
  onToggleSelection,
  onToggleSelectAll,
  onOpenAssignModal,
  regimes,
  onSaveChamp,
  onDragEnd,
}: Props) {
  return (
    <Card>
      {/*
        L'ascenseur horizontal vit dans `DefilementHorizontal` et non dans un
        `overflow-x-auto` posé ici : avec cinquante lignes, la barre du
        conteneur se retrouvait des milliers de pixels sous la fenêtre, et les
        colonnes de droite étaient inatteignables tant qu'un filtre ne
        raccourcissait pas la liste. L'explication complète est dans son
        en-tête.
      */}
      <DefilementHorizontal>
        <SortableTableWrapper ids={displayIds} onDragEnd={onDragEnd}>
          <table className="w-full">
            <thead className="bg-gray-50 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
              <tr>
                <th className="w-10 py-3 px-3">
                  <input
                    type="checkbox"
                    checked={selectedClientIds.size === clients.length && clients.length > 0}
                    onChange={onToggleSelectAll}
                    className="h-4 w-4 text-teal-600 focus:ring-teal-500 border-gray-300 dark:border-gray-600 rounded cursor-pointer"
                  />
                </th>
                {useCustomOrder && <th className="w-8 py-3 px-1" />}
                {TABLE_COLUMNS.map((col) => (
                  <th
                    key={col.field}
                    className="text-left py-3 px-4 text-xs font-medium text-gray-700 dark:text-gray-300 uppercase tracking-wider cursor-pointer select-none hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                    onClick={() => onSortToggle(col.field)}
                  >
                    <span className="inline-flex items-center gap-1">
                      {col.label}
                      {sortField === col.field ? (
                        sortDirection === 'asc' ? <ArrowUp className="w-3.5 h-3.5" /> : <ArrowDown className="w-3.5 h-3.5" />
                      ) : (
                        <ArrowUpDown className="w-3.5 h-3.5 text-gray-400" />
                      )}
                    </span>
                  </th>
                ))}
                <th className="text-left py-3 px-4 text-xs font-medium text-gray-700 dark:text-gray-300 uppercase tracking-wider">
                  Statut
                </th>
                <th className="text-left py-3 px-4 text-xs font-medium text-gray-700 dark:text-gray-300 uppercase tracking-wider">
                  Email
                </th>
                <th
                  className="text-left py-3 px-4 text-xs font-medium text-gray-700 dark:text-gray-300 uppercase tracking-wider cursor-pointer select-none hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                  onClick={() => onSortToggle('collaborators')}
                >
                  <span className="inline-flex items-center gap-1">
                    Collab.
                    {sortField === 'collaborators' ? (
                      sortDirection === 'asc' ? <ArrowUp className="w-3.5 h-3.5" /> : <ArrowDown className="w-3.5 h-3.5" />
                    ) : (
                      <ArrowUpDown className="w-3.5 h-3.5 text-gray-400" />
                    )}
                  </span>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 dark:divide-gray-700 bg-white dark:bg-gray-900">
              {clients.map((client) => (
                <SortableRow
                  key={client.id}
                  id={client.id}
                  disabled={!useCustomOrder}
                  className={`hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors ${
                    client.statut === 'archive' ? 'opacity-60 bg-gray-50 dark:bg-gray-800' : ''
                  } ${selectedClientIds.has(client.id) ? 'bg-teal-50/50 dark:bg-teal-900/10' : ''}`}
                >
                  <td className="py-4 px-3" onClick={(e) => e.stopPropagation()}>
                    <input
                      type="checkbox"
                      checked={selectedClientIds.has(client.id)}
                      onChange={() => onToggleSelection(client.id)}
                      className="h-4 w-4 text-teal-600 focus:ring-teal-500 border-gray-300 dark:border-gray-600 rounded cursor-pointer"
                    />
                  </td>
                  <td className="py-4 px-4">
                    <div className="flex items-center gap-3">
                      <div className="flex-shrink-0 w-10 h-10 bg-teal-100 dark:bg-teal-900/40 rounded-lg flex items-center justify-center">
                        <Building className="w-5 h-5 text-teal-600 dark:text-teal-400" />
                      </div>
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <Link
                            to={`/clients/${client.id}`}
                            className="font-medium text-gray-900 dark:text-gray-100 hover:text-teal-600 dark:hover:text-teal-400 hover:underline transition-colors"
                          >
                            {client.nom_entreprise}
                          </Link>
                          <CopyButton value={client.nom_entreprise} label="Nom" />
                        </div>
                        {client.forme_juridique && (
                          <div className="text-sm text-gray-500 dark:text-gray-400">
                            <LegalFormDisplay value={client.forme_juridique} />
                          </div>
                        )}
                      </div>
                    </div>
                  </td>
                  <td className="py-4 px-4">
                    <CellValue value={client.dirigeant} />
                  </td>
                  <td className="py-4 px-4">
                    <CelluleNumeroDossier client={client} onSaveChamp={onSaveChamp} />
                  </td>
                  <td className="py-4 px-4">
                    {client.siren ? (
                      <div className="flex items-center gap-2">
                        <span className="text-sm text-gray-900 dark:text-gray-100 font-mono">{client.siren}</span>
                        <CopyButton value={client.siren} label="SIREN" />
                      </div>
                    ) : (
                      <span className="text-gray-400 dark:text-gray-500">-</span>
                    )}
                  </td>
                  <td className="py-4 px-4">
                    {client.siret ? (
                      <div className="flex items-center gap-2">
                        <span className="text-sm text-gray-900 dark:text-gray-100 font-mono">{client.siret}</span>
                        <CopyButton value={client.siret} label="SIRET" />
                        <a
                          href={`https://api-avis-situation-sirene.insee.fr/identification/pdf/${client.siret}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 transition-colors"
                          title="Avis de situation INSEE"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <ExternalLink className="w-3.5 h-3.5" />
                        </a>
                      </div>
                    ) : (
                      <span className="text-gray-400 dark:text-gray-500">-</span>
                    )}
                  </td>
                  <td className="py-4 px-4">
                    <CellValue value={client.ville} />
                  </td>
                  <td className="py-4 px-4">
                    <CelluleRegime client={client} regimes={regimes} onSaveChamp={onSaveChamp} />
                  </td>
                  <td className="py-4 px-4">
                    <CelluleCloture client={client} onSaveChamp={onSaveChamp} />
                  </td>
                  <td className="py-4 px-4">
                    <Badge
                      variant={
                        client.statut === 'actif'
                          ? 'success'
                          : client.statut === 'prospect'
                          ? 'blue'
                          : 'warning'
                      }
                    >
                      {client.statut}
                    </Badge>
                  </td>
                  <td className="py-4 px-4">
                    <CelluleEmail client={client} onSaveChamp={onSaveChamp} />
                  </td>
                  <td className="py-4 px-4">
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); onOpenAssignModal(client); }}
                      className="group/collab flex items-center gap-2 rounded-lg px-2 py-1 -mx-2 -my-1 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors cursor-pointer"
                      title="Modifier les collaborateurs"
                    >
                      <CollaboratorAvatarGroup
                        collaborators={(client.collaborators || []).map((c) => ({
                          user_id: c.user_id,
                          full_name: `${c.user?.prenom || ''} ${c.user?.nom || ''}`.trim() || 'Utilisateur',
                          role: c.role,
                          avatar_color: c.user?.avatar_color ?? null,
                        }))}
                        size="small"
                      />
                      <Pencil className="w-3 h-3 text-gray-400 opacity-0 group-hover/collab:opacity-100 transition-opacity flex-shrink-0" />
                    </button>
                  </td>
                </SortableRow>
              ))}
            </tbody>
          </table>
        </SortableTableWrapper>
      </DefilementHorizontal>
    </Card>
  );
}

/**
 * L'email d'un client dans la liste : affiche s'il existe, SAISISSABLE SUR PLACE
 * s'il manque.
 *
 * POURQUOI SEULEMENT QUAND IL MANQUE. Ouvrir une fiche pour ajouter une adresse
 * qu'on a sous les yeux est un detour couteux quand on en complete vingt a la
 * suite. Mais rendre modifiable un email DEJA renseigne, au milieu d'une liste
 * ou l'on fait defiler et clique vite, exposerait a l'ecraser sans s'en
 * apercevoir. Une case vide n'a rien a perdre, une case remplie si : la fiche
 * reste le seul endroit ou l'on CORRIGE une adresse.
 */
function CelluleEmail({ client, onSaveChamp }: { client: Client; onSaveChamp: EnregistrerChamp }) {
  if (client.email) {
    return (
      <div className="flex items-center gap-0.5">
        <a
          href={`mailto:${client.email}`}
          className="inline-flex items-center gap-1.5 text-sm text-gray-900 dark:text-gray-100 hover:text-teal-600 dark:hover:text-teal-400 transition-colors"
          onClick={(e) => e.stopPropagation()}
        >
          <Mail className="w-3.5 h-3.5 text-gray-400" />
          <span className="truncate max-w-[180px]">{client.email}</span>
        </a>
        {/* Les lignes sont glissables pour etre reordonnees : comme la case a
            cocher et le lien ci-dessus, le bouton retient le clic pour qu'il ne
            parte pas au gestionnaire de glisser-deposer. */}
        <span onClick={(e) => e.stopPropagation()}>
          <CopyButton value={client.email} label="Email" />
        </span>
      </div>
    );
  }
  return (
    <SaisieTexte
      clientId={client.id}
      champ="email"
      type="email"
      placeholder="Ajouter un email"
      libelle="Email du client"
      onSaveChamp={onSaveChamp}
    />
  );
}

/** Le numero de dossier : meme geste que l'email, autre colonne. */
function CelluleNumeroDossier({ client, onSaveChamp }: { client: Client; onSaveChamp: EnregistrerChamp }) {
  if (client.numero_dossier) {
    return (
      <div className="flex items-center text-sm text-gray-900 dark:text-gray-100">
        <FileText className="w-4 h-4 mr-1.5 text-gray-400" />
        {client.numero_dossier}
      </div>
    );
  }
  return (
    <SaisieTexte
      clientId={client.id}
      champ="numero_dossier"
      placeholder="Ajouter un n° dossier"
      libelle="Numero de dossier du client"
      onSaveChamp={onSaveChamp}
    />
  );
}

/**
 * Le regime fiscal : LE LIBELLE quand il est connu, la valeur brute sinon.
 *
 * ⚠️ LE REPLI N'EST PAS DEFENSIF, IL EST NECESSAIRE. `useRegimesFiscaux` ne
 * remonte que les regimes ACTIFS. Un regime desactive dans les Reglages
 * disparait donc de la liste alors que des fiches le portent encore : sans repli
 * leur cellule deviendrait vide, et le cabinet croirait la donnee perdue.
 */
function CelluleRegime({
  client,
  regimes,
  onSaveChamp,
}: {
  client: Client;
  regimes: RegimeOption[];
  onSaveChamp: EnregistrerChamp;
}) {
  if (client.regime_fiscal) {
    const connu = regimes.find((r) => r.value === client.regime_fiscal);
    return (
      <span className="text-sm text-gray-900 dark:text-gray-100">
        {connu?.label || client.regime_fiscal}
      </span>
    );
  }
  return (
    <SaisieChoix
      clientId={client.id}
      champ="regime_fiscal"
      libelle="Regime fiscal du client"
      options={regimes.map((r) => ({ valeur: r.value, libelle: r.label }))}
      onSaveChamp={onSaveChamp}
    />
  );
}

/**
 * Le mois de cloture.
 *
 * LA COLONNE EST UNE DATE, MAIS SEUL LE MOIS COMPTE : la fiche l'edite au mois
 * (MonthPicker, libelle « Mois de cloture ») et la liste n'a jamais affiche que
 * le mois. On reprend donc la convention de la fiche a l'identique — premier
 * jour du mois, annee courante — pour que les deux ecrans ecrivent la meme
 * chose.
 *
 * A ne pas confondre avec ses deux voisines : `date_cloture_exercice_social`
 * (texte JJMM, alimente par la synchro INPI) et `date_premiere_cloture`.
 */
function CelluleCloture({ client, onSaveChamp }: { client: Client; onSaveChamp: EnregistrerChamp }) {
  if (client.date_cloture) {
    return (
      <span className="text-sm text-gray-900 dark:text-gray-100">
        {new Date(client.date_cloture).toLocaleDateString('fr-FR', { month: 'long' })}
      </span>
    );
  }
  return (
    <SaisieChoix
      clientId={client.id}
      champ="date_cloture"
      libelle="Mois de cloture du client"
      options={MOIS_CLOTURE.map((m) => ({ valeur: m.value, libelle: m.label }))}
      versValeur={(mois) => `${new Date().getFullYear()}-${mois}-01`}
      onSaveChamp={onSaveChamp}
    />
  );
}

/**
 * La case vide d'une colonne TEXTE, et tout ce qu'elle doit garantir.
 *
 * Partagee par l'email et le numero de dossier plutot que recopiee : la
 * subtilite d'Echap ci-dessous ne se remarque pas a la lecture, et une seconde
 * copie l'aurait perdue au premier ajustement.
 */
function SaisieTexte({
  clientId,
  champ,
  type = 'text',
  placeholder,
  libelle,
  onSaveChamp,
}: {
  clientId: string;
  champ: ChampTexte;
  type?: 'text' | 'email';
  placeholder: string;
  libelle: string;
  onSaveChamp: EnregistrerChamp;
}) {
  const [saisie, setSaisie] = useState('');
  const [erreur, setErreur] = useState<string | null>(null);
  const [enCours, setEnCours] = useState(false);

  /**
   * Echap doit ANNULER, ET UN ETAT REACT N'Y SUFFIRAIT PAS : `onBlur` s'execute
   * avec la fermeture du rendu courant, ou `saisie` vaut encore l'ancienne
   * valeur. Sans ce drapeau, echapper enregistrerait quand meme.
   */
  const annule = useRef(false);

  const enregistrer = async () => {
    const valeur = saisie.trim();
    // Une case laissee vide n'est pas une erreur : c'est l'etat de depart.
    if (!valeur || enCours) return;

    // LA MEME REGLE QUE LA FICHE CLIENT, appelee et non recopiee : deux
    // definitions de « une valeur valide » finiraient par diverger. Pour le
    // numero de dossier, elle refuse au-dela de 50 caracteres.
    const verdict = validateField(champ, valeur);
    if (verdict.level === 'invalid') {
      setErreur(verdict.message ?? 'Valeur invalide');
      return;
    }

    setErreur(null);
    setEnCours(true);
    const ok = await onSaveChamp(clientId, champ, valeur);
    setEnCours(false);
    // Succes : le parent renseigne le champ et la cellule bascule d'elle-meme en
    // affichage. Echec : ON GARDE LA SAISIE — la reperdre apres l'avoir tapee
    // serait le pire des deux.
    if (!ok) setErreur('Enregistrement impossible');
  };

  return (
    <div onClick={(e) => e.stopPropagation()}>
      <input
        type={type}
        value={saisie}
        disabled={enCours}
        placeholder={placeholder}
        aria-label={libelle}
        onChange={(e) => {
          setSaisie(e.target.value);
          if (erreur) setErreur(null);
        }}
        onBlur={() => {
          if (annule.current) {
            annule.current = false;
            setSaisie('');
            setErreur(null);
            return;
          }
          void enregistrer();
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            e.currentTarget.blur();
          } else if (e.key === 'Escape') {
            annule.current = true;
            e.currentTarget.blur();
          }
        }}
        className={`w-[180px] rounded-md border bg-white dark:bg-gray-900 px-2 py-1 text-sm text-gray-900 dark:text-gray-100 placeholder:text-gray-400 dark:placeholder:text-gray-500 focus:outline-none focus:ring-1 disabled:opacity-60 transition-colors ${
          erreur
            ? 'border-red-400 dark:border-red-600 focus:border-red-500 focus:ring-red-500'
            : 'border-gray-200 dark:border-gray-700 focus:border-teal-500 focus:ring-teal-500'
        }`}
      />
      {erreur && (
        <p className="mt-1 text-xs text-red-600 dark:text-red-400 max-w-[180px]">{erreur}</p>
      )}
    </div>
  );
}

/**
 * La case vide d'une colonne A CHOIX — regime, mois de cloture.
 *
 * PAS DE « QUITTER LE CHAMP POUR VALIDER », contrairement a la saisie texte :
 * choisir une option EST la validation. Attendre un `blur` obligerait a cliquer
 * ailleurs apres avoir deja fait son choix, et laisserait un etat intermediaire
 * ou l'ecran montre une valeur que la base n'a pas.
 *
 * L'option vide en tete ne declenche rien : c'est l'etat de depart, pas un
 * effacement.
 */
function SaisieChoix({
  clientId,
  champ,
  libelle,
  options,
  versValeur = (v) => v,
  onSaveChamp,
}: {
  clientId: string;
  champ: ChampSaisissable;
  libelle: string;
  options: { valeur: string; libelle: string }[];
  /** Ce qui part en base, quand ce n'est pas l'option elle-meme (cf. la cloture). */
  versValeur?: (option: string) => string;
  onSaveChamp: EnregistrerChamp;
}) {
  const [enCours, setEnCours] = useState(false);
  const [erreur, setErreur] = useState(false);

  const choisir = async (option: string) => {
    if (!option || enCours) return;
    setErreur(false);
    setEnCours(true);
    const ok = await onSaveChamp(clientId, champ, versValeur(option));
    setEnCours(false);
    if (!ok) setErreur(true);
  };

  return (
    <div onClick={(e) => e.stopPropagation()}>
      <select
        value=""
        disabled={enCours}
        aria-label={libelle}
        onChange={(e) => void choisir(e.target.value)}
        className={`w-[150px] rounded-md border bg-white dark:bg-gray-900 px-2 py-1 text-sm text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-1 disabled:opacity-60 transition-colors ${
          erreur
            ? 'border-red-400 dark:border-red-600 focus:border-red-500 focus:ring-red-500'
            : 'border-gray-200 dark:border-gray-700 focus:border-teal-500 focus:ring-teal-500'
        }`}
      >
        <option value="">Choisir…</option>
        {options.map((o) => (
          <option key={o.valeur} value={o.valeur}>
            {o.libelle}
          </option>
        ))}
      </select>
      {erreur && (
        <p className="mt-1 text-xs text-red-600 dark:text-red-400 max-w-[150px]">
          Enregistrement impossible
        </p>
      )}
    </div>
  );
}

function CellValue({ value }: { value: string | null | undefined }) {
  if (!value) return <span className="text-gray-400 dark:text-gray-500">-</span>;
  return <span className="text-sm text-gray-900 dark:text-gray-100">{value}</span>;
}
