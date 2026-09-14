import { Badge } from '../../components/ui/Badge';
import { Input } from '../../components/ui/Input';
import { ExternalLink } from 'lucide-react';
import type { Database, ClientStatus } from '../../types/database';
import type { DataTableRow } from '../../components/clients/DataTable';
import { TvaStatusBadge } from '../../components/clients/TvaStatusBadge';
import { TvaVerifyButton } from '../../components/clients/TvaVerifyButton';
import type { StatutTvaAffiche } from '../../components/clients/tvaStatut';
import { controlerSaisieTva, formaterNumeroTva } from '../../lib/tva';
import { AdresseFacturationAnnuaire } from '../../components/clients/AdresseFacturationAnnuaire';
import { controlerAdresseFacturation } from '../../lib/facturationElectronique';
import { AdresseEdition, AdresseLecture } from '../../components/clients/AdresseFields';
import { composerAdresse } from '../../lib/adresseHeritee';
import { EmailLink, PhoneLink } from '../../components/ui/ContactLinks';
import { LegalFormSelect } from '../../components/clients/LegalFormSelect';
import { LegalFormDisplay } from '../../components/clients/LegalFormDisplay';
import { MonthPicker, libelleMois } from '../../components/clients/MonthPicker';
import { nombreSaisi } from '../../lib/champsClient';

type Client = Database['public']['Tables']['clients']['Row'];

/**
 * Les champs de la fiche client — ce qu'ils valent, ce qu'ils affichent et ce
 * qu'ils écrivent.
 * ---------------------------------------------------------------------------
 * Ces trois tableaux vivaient dans le corps de `ClientDetail`, qui pesait 991
 * lignes. Ils en occupaient 320 : le composant se lisait comme un formulaire,
 * pas comme un écran, et il fallait faire défiler un tiers du fichier pour
 * retrouver le rendu.
 *
 * Ils partent d'un bloc, sans être réécrits : ce sont les mêmes champs, dans le
 * même ordre, avec les mêmes commentaires. Ce qui change est la façon d'écrire
 * dans le formulaire — voir `modifier` ci-dessous.
 */

/**
 * Écrire dans le formulaire, sans le recomposer à la main.
 *
 * Chaque champ faisait `setFormData({ ...formData, x: v })` — vingt-cinq fois
 * la même incantation, dont chaque occurrence est une occasion d'oublier le
 * `...formData` et d'effacer tout le reste de la saisie. `modifier({ x: v })`
 * dit la même chose et ne peut pas se tromper.
 */
export interface ContexteFiche {
  client: Client;
  formData: Partial<Client>;
  modifier: (champs: Partial<Client>) => void;
  editMode: boolean;
  optionsRegimeFiscal: { value: string; label: string }[];
  /**
   * Indisponibilité de VIES, transitoire : le badge doit la montrer, le bouton
   * la signale. Elle n'est jamais persistée.
   */
  viesIndisponible: boolean;
  setViesIndisponible: (v: boolean) => void;
  /** Recharger la fiche après qu'une action serveur a écrit dessus. */
  recharger: () => void;
  descriptionDepliee: boolean;
  basculerDescription: () => void;
}

const STATUS_OPTIONS = [
  { value: 'actif', label: 'Actif' },
  { value: 'inactif', label: 'Inactif' },
  { value: 'prospect', label: 'Prospect' },
  { value: 'archive', label: 'Archive' },
];

/** `ddmm` : le jour et le mois de cloture de l'exercice social, « 3112 ». */
function formatFiscalClosingMonth(ddmm: string | null | undefined): string {
  if (!ddmm) return '-';
  return libelleMois(ddmm.substring(2, 4)) ?? '-';
}

function formatDate(dateString: string | null | undefined): string {
  if (!dateString) return '-';
  return new Date(dateString).toLocaleDateString('fr-FR');
}

function formatClosingMonth(dateString: string | null | undefined): string {
  if (!dateString) return '-';
  return libelleMois(String(new Date(dateString).getMonth() + 1).padStart(2, '0')) ?? '-';
}

export function lignesGenerales(ctx: ContexteFiche): DataTableRow[] {
  const { client, formData, modifier, viesIndisponible, setViesIndisponible, recharger } = ctx;

  // Controle local de la cle, recalcule a chaque frappe : il dit ce qu'on peut
  // dire sans reseau, avant de deranger VIES.
  const controleTva = controlerSaisieTva(formData.tva_intracom);

  // Meme principe pour l'adresse de facturation, a une difference pres : il ne
  // refuse jamais rien. Voir `lib/facturationElectronique.ts`.
  const controleFacturation = controlerAdresseFacturation(
    formData.adresse_facturation_electronique,
    formData.siret
  );

  const estPhysique = formData.type_personne === 'physique';

  /**
   * La bascule morale / physique, en fonction dediee et non en `setFormData`
   * inline : elle doit PRE-REMPLIR, parce que `nom_entreprise` est NOT NULL.
   *
   *   · morale -> physique : `nom` recoit le libelle actuel EN ENTIER. Laisser
   *     les trois champs vides ferait recomposer une chaine vide au declencheur,
   *     et l'enregistrement echouerait sur la contrainte.
   *   · physique -> morale : `nom_entreprise` recoit la valeur recomposee, et
   *     civilite/nom/prenom NE SONT PAS EFFACES — on ne detruit pas trois champs
   *     sur un clic de menu. Le declencheur les ignore en `morale`, et un retour
   *     arriere ne perd rien.
   */
  function changerTypePersonne(valeur: string) {
    if (valeur === 'physique') {
      modifier({
        type_personne: 'physique',
        nom: formData.nom || client?.nom_entreprise || '',
      });
      return;
    }
    modifier({
      type_personne: valeur || null,
      nom_entreprise:
        [formData.nom, formData.prenom].filter(Boolean).join(' ') ||
        formData.nom_entreprise ||
        client?.nom_entreprise ||
        '',
    });
  }

  return [
    {
      key: 'type_personne',
      label: 'Type de personne',
      value: client.type_personne === 'physique' ? 'Personne physique' : client.type_personne === 'morale' ? 'Personne morale' : null,
      customDisplay: client.type_personne ? (
        <Badge variant={client.type_personne === 'physique' ? 'violet' : 'gray'}>
          {client.type_personne === 'physique' ? 'Personne physique' : 'Personne morale'}
        </Badge>
      ) : (
        <span className="text-gray-400 dark:text-gray-500">Non renseigne</span>
      ),
      editField: 'select' as const,
      editValue: formData.type_personne ?? '',
      onChange: changerTypePersonne,
      selectOptions: [
        { value: 'morale', label: 'Personne morale (societe)' },
        { value: 'physique', label: 'Personne physique (entrepreneur individuel)' },
      ],
    },
    /*
     * LES LIGNES APPARAISSENT ET DISPARAISSENT — JAMAIS GRISEES.
     *
     * « Raison sociale » et « Nom / Prenom / Civilite » sont des alternatives
     * mutuellement exclusives, pas un champ desactive. Une SARL avec une ligne
     * « Prenom » grisee est du bruit dans un tableau de onze lignes.
     *
     * C'est aussi ce qui rend `key` indispensable sur DataTableRow : le nombre
     * de lignes change, et sans identite stable React reassocie par position —
     * tous les champs suivants perdent le focus au milieu d'une saisie.
     */
    ...(estPhysique
      ? [
          {
            key: 'nom_affiche',
            label: 'Nom affiche',
            value: client.nom_entreprise,
            copyable: true,
            // Ni `editField` ni `customEditDisplay` : DataTable la laisse en
            // lecture meme en mode edition. C'est le declencheur qui l'ecrit.
            helperText: 'Recompose automatiquement depuis le nom et le prenom.',
          } as DataTableRow,
          {
            key: 'civilite',
            label: 'Civilite',
            value: client.civilite,
            editField: 'select' as const,
            editValue: formData.civilite ?? '',
            onChange: (v: string) => modifier({ civilite: v || null }),
            selectOptions: [
              { value: 'M.', label: 'M.' },
              { value: 'Mme', label: 'Mme' },
            ],
            helperText: "Sert au courrier, pas au libelle : le nom affiche n'en tient pas compte.",
          } as DataTableRow,
          {
            key: 'nom',
            label: 'Nom',
            value: client.nom,
            copyable: true,
            editField: 'input' as const,
            editValue: formData.nom ?? '',
            onChange: (v: string) => modifier({ nom: v }),
          } as DataTableRow,
          {
            key: 'prenom',
            label: 'Prenom',
            value: client.prenom,
            copyable: true,
            editField: 'input' as const,
            editValue: formData.prenom ?? '',
            onChange: (v: string) => modifier({ prenom: v }),
            helperText: client.prenoms && client.prenoms !== client.prenom
              ? `Etat civil complet : ${client.prenoms}`
              : undefined,
          } as DataTableRow,
        ]
      : [
          {
            key: 'raison_sociale',
            label: 'Raison sociale',
            value: client.nom_entreprise,
            copyable: true,
            editField: 'input' as const,
            editValue: formData.nom_entreprise,
            onChange: (v: string) => modifier({ nom_entreprise: v }),
          } as DataTableRow,
        ]),
    {
      key: 'nom_commercial',
      label: 'Nom commercial',
      value: client.nom_commercial,
      copyable: true,
      editField: 'input' as const,
      editValue: formData.nom_commercial ?? '',
      onChange: (v: string) => modifier({ nom_commercial: v }),
      helperText: 'Le nom sous lequel le client repond au telephone et signe ses cheques.',
    },
    { label: 'Numero de dossier', value: client.numero_dossier, copyable: true, editField: 'input' as const, editValue: formData.numero_dossier, onChange: (v: string) => modifier({ numero_dossier: v }) },
    { label: 'SIREN', value: client.siren, copyable: true, copyLabel: 'SIREN' },
    {
      label: 'SIRET', value: client.siret, copyable: true, copyLabel: 'SIRET',
      customDisplay: client.siret ? (
        <span className="flex items-center gap-2">
          <span className="font-mono">{client.siret}</span>
          <a href={`https://api-avis-situation-sirene.insee.fr/identification/pdf/${client.siret}`} target="_blank" rel="noopener noreferrer" className="text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300" title="Avis de situation INSEE">
            <ExternalLink className="w-4 h-4" />
          </a>
        </span>
      ) : undefined,
      editField: 'input' as const, editValue: formData.siret, onChange: (v: string) => modifier({ siret: v }),
    },
    /**
     * Juste apres le SIRET, et non dans « Informations comptables » : c'est un
     * identifiant derive du SIREN, il herite du voisinage SIREN/SIRET et de son
     * motif — police a chasse fixe, bouton de copie.
     */
    {
      key: 'tva_intracom',
      label: 'TVA intracommunautaire',
      value: client.tva_intracom,
      copyable: true,
      copyLabel: 'Numero de TVA',
      customDisplay: client.tva_intracom ? (
        <span className="flex items-center gap-2 flex-wrap">
          <span className="font-mono">{formaterNumeroTva(client.tva_intracom)}</span>
          <TvaStatusBadge
            numero={client.tva_intracom}
            statut={client.tva_verif_statut as StatutTvaAffiche | null}
            nomVies={client.tva_verif_nom}
            nomEnBase={client.nom_entreprise}
            verifieLe={client.tva_verif_le}
            indisponibleTransitoire={viesIndisponible}
          />
          {client.tva_intracom_source === 'manuel' && (
            <span className="text-xs text-gray-600 dark:text-gray-400">saisi a la main</span>
          )}
          {/*
            ⚠️ LE BOUTON EST ICI, EN LECTURE, ET C'EST TOUT LE SUJET.
            Il n'existait que dans `customEditDisplay` : pour vérifier un numéro
            il fallait passer la fiche en édition, deviner que la commande s'y
            trouvait, puis en ressortir. Depuis la fiche ouverte — le seul
            endroit où l'on pense à le faire — rien n'était cliquable, et le
            badge restait « non vérifié » sans que rien ne dise comment en
            sortir. Signalé le 2026-09-05 : « le connecteur VIES ne marche pas ».
            Il marchait ; il était introuvable.
          */}
          <TvaVerifyButton
            clientId={client.id}
            numero={client.tva_intracom}
            onVerified={recharger}
            onIndisponible={setViesIndisponible}
          />
        </span>
      ) : (
        <span className="text-gray-400 dark:text-gray-500">
          Calcule automatiquement des que le SIREN est renseigne
        </span>
      ),
      customEditDisplay: (
        <div className="space-y-1">
          <div className="flex items-center gap-2 flex-wrap">
            <Input
              value={formData.tva_intracom ?? ''}
              onChange={(e) => modifier({ tva_intracom: e.target.value })}
              placeholder="FR40303265045"
              className="font-mono"
            />
            <TvaVerifyButton
              clientId={client.id}
              numero={client.tva_intracom}
              numeroSaisi={formData.tva_intracom ?? ''}
              onVerified={recharger}
              onIndisponible={setViesIndisponible}
            />
            {/*
              Le badge est AUSSI ici, et pas seulement en lecture : le bouton ne
              vit qu'en edition, donc sans cette ligne le verdict s'enregistrait
              sans que rien ne change a l'ecran — seul un toast passait. On
              cliquait, et on ne voyait rien.
            */}
            <TvaStatusBadge
              numero={client.tva_intracom}
              statut={client.tva_verif_statut as StatutTvaAffiche | null}
              nomVies={client.tva_verif_nom}
              nomEnBase={client.nom_entreprise}
              verifieLe={client.tva_verif_le}
              indisponibleTransitoire={viesIndisponible}
            />
          </div>
          {controleTva && (
            <p
              className={`text-xs ${
                controleTva.niveau === 'invalid'
                  ? 'text-red-600 dark:text-red-400'
                  : controleTva.niveau === 'warning'
                    ? 'text-amber-600 dark:text-amber-400'
                    : 'text-green-600 dark:text-green-400'
              }`}
            >
              {controleTva.message}
            </p>
          )}
        </div>
      ),
      helperText:
        'Calcule depuis le SIREN. Le remplacer a la main le fige : vider le champ rend la main au calcul.',
    },
    /**
     * L'adresse a laquelle le client RECOIT ses factures electroniques.
     *
     * Elle se pose juste apres la TVA intracommunautaire, et pour la meme
     * raison : c'est un identifiant de la meme famille, le plus souvent derive
     * du SIRET, et il herite du voisinage SIREN/SIRET — police a chasse fixe,
     * bouton de copie.
     *
     * ⚠️ ELLE N'EST PAS `siret`, meme quand elle lui ressemble. Elle peut
     * porter un code de routage vers un service, ou designer une autre entite
     * du groupe. Le controle affiche le signale sans jamais refuser : voir
     * `lib/facturationElectronique.ts`.
     */
    {
      key: 'adresse_facturation_electronique',
      label: 'Adresse de facturation electronique',
      value: client.adresse_facturation_electronique,
      copyable: true,
      copyLabel: 'Adresse de facturation electronique',
      customDisplay: (
        <div className="space-y-2">
          {client.adresse_facturation_electronique ? (
            <span className="font-mono">{client.adresse_facturation_electronique}</span>
          ) : (
            <span className="text-gray-400 dark:text-gray-500">Non renseignee</span>
          )}
          {/*
            Le bouton est ICI, en lecture, et pas seulement en edition — la
            lecon du bouton VIES, signalee le 2026-09-05 : une commande qui
            n'existe qu'en mode edition est introuvable depuis la fiche
            ouverte, c'est-a-dire depuis le seul endroit ou l'on pense a s'en
            servir. En lecture, retenir une adresse ECRIT et recharge.
          */}
          <AdresseFacturationAnnuaire
            clientId={client.id}
            siren={client.siren}
            adresseActuelle={client.adresse_facturation_electronique}
            onEnregistre={recharger}
          />
        </div>
      ),
      customEditDisplay: (
        <div className="space-y-1">
          <Input
            value={formData.adresse_facturation_electronique ?? ''}
            onChange={(e) => modifier({ adresse_facturation_electronique: e.target.value })}
            placeholder={client.siret || '30326504500069'}
            className="font-mono"
          />
          {/*
            En edition, la recherche REMPLIT le champ et n'ecrit rien : la fiche
            s'enregistre par son propre bouton, donc par `patchFicheClient` et
            la normalisation unique. Ecrire ici court-circuiterait les deux, et
            l'enregistrement suivant remettrait l'ancienne valeur par-dessus.
          */}
          <AdresseFacturationAnnuaire
            clientId={client.id}
            siren={client.siren}
            adresseActuelle={formData.adresse_facturation_electronique}
            onRemplir={(v) => modifier({ adresse_facturation_electronique: v })}
          />
          {controleFacturation && (
            <p
              className={`text-xs ${
                controleFacturation.niveau === 'warning'
                  ? 'text-amber-600 dark:text-amber-400'
                  : 'text-green-600 dark:text-green-400'
              }`}
            >
              {controleFacturation.message}
            </p>
          )}
        </div>
      ),
      helperText:
        'Ou le client recoit ses factures : le plus souvent son SIRET, parfois avec un code de routage.',
    },
    { label: 'Forme juridique', value: client.forme_juridique, copyable: true, customDisplay: <LegalFormDisplay value={client.forme_juridique} />, customEditDisplay: <LegalFormSelect value={formData.forme_juridique || ''} onChange={(v) => modifier({ forme_juridique: v })} /> },
    {
      key: 'etat_administratif',
      label: 'Etat au registre',
      value: client.etat_administratif === 'A' ? 'Active' : client.etat_administratif === 'C' ? 'Cessee' : null,
      // Renseigne par la synchronisation INPI, jamais a la main : c'est un fait
      // du registre, pas une saisie du cabinet.
      customDisplay: client.etat_administratif === 'C' ? (
        <Badge variant="danger">Cessee au registre</Badge>
      ) : client.etat_administratif === 'A' ? (
        <Badge variant="success">Active</Badge>
      ) : (
        <span className="text-gray-400 dark:text-gray-500">-</span>
      ),
      helperText: client.date_radiation ? `Radiee le ${formatDate(client.date_radiation)}` : undefined,
    },
    { label: 'Code APE', value: client.code_ape, copyable: true, editField: 'input' as const, editValue: formData.code_ape, onChange: (v: string) => modifier({ code_ape: v }) },
    { label: 'Capital social', value: client.capital_social ? `${client.capital_social} EUR` : null, editField: 'number' as const, editValue: formData.capital_social, onChange: (v: string) => modifier({ capital_social: nombreSaisi(v) }) },
    {
      // Le denominateur de l'onglet « Parts ». Il se saisit ICI et nulle part
      // ailleurs : c'est une colonne de `clients`, elle appartient donc au mode
      // edition de la fiche. L'onglet la lit.
      label: 'Nombre total de parts',
      value: client.parts_totales !== null ? String(client.parts_totales) : null,
      editField: 'number' as const,
      editValue: formData.parts_totales,
      onChange: (v: string) => modifier({ parts_totales: nombreSaisi(v) }),
      helperText: 'Nombre de parts ou d’actions composant le capital. Sans lui, aucun pourcentage de detention n’est calculable.',
    },
    { label: 'Dirigeant', value: client.dirigeant, copyable: true, editField: 'input' as const, editValue: formData.dirigeant, onChange: (v: string) => modifier({ dirigeant: v }) },
    { label: 'Date de creation', value: formatDate(client.date_creation_entreprise), editField: 'date' as const, editValue: formData.date_creation_entreprise, onChange: (v: string) => modifier({ date_creation_entreprise: v }) },
    {
      label: 'Dossier LMNP', value: client.is_lmnp ? 'Oui' : 'Non',
      customDisplay: <Badge variant={client.is_lmnp ? 'success' : 'default'}>{client.is_lmnp ? 'Oui' : 'Non'}</Badge>,
      customEditDisplay: (
        <label className="relative inline-flex items-center cursor-pointer">
          <input type="checkbox" checked={formData.is_lmnp || false} onChange={(e) => modifier({ is_lmnp: e.target.checked })} className="sr-only peer" />
          <div className="w-11 h-6 bg-gray-200 dark:bg-gray-700 rounded-full peer-checked:bg-teal-600 transition-colors" />
          <div className="absolute top-[2px] left-[2px] w-5 h-5 bg-white rounded-full shadow peer-checked:translate-x-5 transition-transform" />
          <span className="ms-3 text-sm font-medium text-gray-700 dark:text-gray-300">{formData.is_lmnp ? 'Oui' : 'Non'}</span>
        </label>
      ),
    },
  ];
}

export function lignesComptables(ctx: ContexteFiche): DataTableRow[] {
  const { client, formData, modifier, editMode, optionsRegimeFiscal, descriptionDepliee, basculerDescription } = ctx;

  return [
    { label: 'Mois de cloture', value: formatClosingMonth(client.date_cloture), customEditDisplay: <MonthPicker label="" value={formData.date_cloture || ''} onChange={(d) => modifier({ date_cloture: d })} /> },
    { label: 'Date cloture exercice social', value: formatFiscalClosingMonth(client.date_cloture_exercice_social) },
    { label: 'Date de premiere cloture', value: formatDate(client.date_premiere_cloture) },
    { label: 'Regime fiscal', value: client.regime_fiscal, editField: 'select' as const, editValue: formData.regime_fiscal, onChange: (v: string) => modifier({ regime_fiscal: v }), selectOptions: optionsRegimeFiscal },
    {
      label: 'Statut', value: client.statut,
      customDisplay: !editMode ? <Badge variant={client.statut === 'actif' ? 'success' : client.statut === 'prospect' ? 'blue' : 'warning'}>{client.statut}</Badge> : undefined,
      editField: 'select' as const, editValue: formData.statut, onChange: (v: string) => modifier({ statut: v as ClientStatus }), selectOptions: STATUS_OPTIONS,
    },
    { label: "Date d'entree au cabinet", value: formatDate(client.date_entree_cabinet), editField: 'date' as const, editValue: formData.date_entree_cabinet, onChange: (v: string) => modifier({ date_entree_cabinet: v }) },
    { label: 'Date de sortie du cabinet', value: formatDate(client.date_sortie_cabinet), editField: 'date' as const, editValue: formData.date_sortie_cabinet, onChange: (v: string) => modifier({ date_sortie_cabinet: v }) },
    {
      label: "Description de l'activite", value: client.description_activite,
      customDisplay: client.description_activite ? (
        <div className="text-sm text-gray-900 dark:text-gray-100">
          <p>{descriptionDepliee ? client.description_activite : (client.description_activite.length > 150 ? client.description_activite.substring(0, 150) + '...' : client.description_activite)}</p>
          {client.description_activite.length > 150 && (
            <button type="button" onClick={basculerDescription} className="text-teal-600 dark:text-teal-400 hover:text-teal-700 font-medium mt-1 text-sm">
              {descriptionDepliee ? 'Voir moins' : 'Voir plus'}
            </button>
          )}
        </div>
      ) : <span className="text-gray-400 dark:text-gray-500">-</span>,
      editField: 'textarea' as const, editValue: formData.description_activite, onChange: (v: string) => modifier({ description_activite: v }),
    },
  ];
}

export function lignesCoordonnees(ctx: ContexteFiche): DataTableRow[] {
  const { client, formData, modifier, editMode } = ctx;

  return [
    {
      key: 'adresse',
      label: 'Adresse',
      // La valeur brute sert au bouton « copier » et a rien d'autre : l'affichage
      // passe par `customDisplay`, qui compose depuis les composants.
      value: composerAdresse({
        ligne1: client.adresse_ligne1,
        complement: client.adresse_complement,
        codePostal: client.code_postal,
        ville: client.ville,
        pays: client.pays,
      }) || client.adresse,
      copyable: true,
      wide: true,
      customDisplay: (
        <AdresseLecture
          composants={client}
          adresseHeritee={client.adresse}
        />
      ),
      customEditDisplay: (
        <AdresseEdition
          composants={formData}
          adresseHeritee={client.adresse}
          onChange={modifier}
        />
      ),
    },
    { label: 'Email', value: client.email, customDisplay: !editMode && client.email?.trim() ? <EmailLink email={client.email} /> : undefined, copyable: !editMode, editField: 'input' as const, editValue: formData.email, onChange: (v: string) => modifier({ email: v }) },
    { label: 'Email 2', value: client.email_2, customDisplay: !editMode && client.email_2?.trim() ? <EmailLink email={client.email_2} /> : undefined, copyable: !editMode, editField: 'input' as const, editValue: formData.email_2, onChange: (v: string) => modifier({ email_2: v }) },
    { label: 'Telephone', value: client.telephone, customDisplay: !editMode && client.telephone?.trim() ? <PhoneLink phone={client.telephone} /> : undefined, copyable: !editMode, editField: 'input' as const, editValue: formData.telephone, onChange: (v: string) => modifier({ telephone: v }) },
    { label: 'Telephone 2', value: client.telephone_2, customDisplay: !editMode && client.telephone_2?.trim() ? <PhoneLink phone={client.telephone_2} /> : undefined, copyable: !editMode, editField: 'input' as const, editValue: formData.telephone_2, onChange: (v: string) => modifier({ telephone_2: v }) },
    { label: 'Contact principal', value: client.contact_principal, copyable: true, editField: 'input' as const, editValue: formData.contact_principal, onChange: (v: string) => modifier({ contact_principal: v }) },
  ];
}
