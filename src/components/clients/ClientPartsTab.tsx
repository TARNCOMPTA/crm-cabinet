import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { useToast } from '../../contexts/ToastContext';
import { Card, CardContent } from '../ui/Card';
import { Button } from '../ui/Button';
import { Badge } from '../ui/Badge';
import { Modal } from '../ui/Modal';
import { Input } from '../ui/Input';
import { Select } from '../ui/Select';
import { SearchableSelect } from '../ui/SearchableSelect';
import { ConfirmDialog } from '../ui/ConfirmDialog';
import { PieChart, Plus, Pencil, Trash2, AlertTriangle, Info, Upload } from 'lucide-react';
import { codeErreur, messageErreur } from '../../lib/erreurs';
import { PartsImportModal } from './PartsImportModal';
import {
  etatRepartition,
  motTitre,
  pourcentage,
  valeurNominale,
  type EtatRepartition,
  type MotsParts,
} from '../../lib/repartitionParts';

/**
 * La répartition des parts d'un client.
 * ---------------------------------------------------------------------------
 * L'écran n'a pas pour but d'afficher des pourcentages : il a pour but
 * d'EMPÊCHER QU'UN POURCENTAGE FAUX AIT L'AIR JUSTE. Tout le calcul vit dans
 * `src/lib/repartitionParts.ts`, testé à part ; ici on l'affiche, y compris ses
 * refus — un « — » là où le total manque, un bandeau là où la somme ne tombe
 * pas.
 *
 * ⚠️ CE QUI EST DÉLIBÉRÉMENT NON COPIÉ DE `CompanyToOfficerTab`. Cet écran-là
 * n'examine JAMAIS le `error` de ses `insert`/`update` et annonce « Dirigeant
 * enregistre » quoi qu'il arrive. C'est le défaut corrigé en 96c9896 sur la
 * fenêtre des collaborateurs, et il ne sera pas reproduit ici : chaque écriture
 * est vérifiée, et le message dit ce qui s'est réellement passé.
 *
 * Le modèle suivi est `ClientSoftwareTab` : `clientId` en unique prop, chargement
 * autonome, `useToast()` interne, `Modal` + `ConfirmDialog`, erreurs traitées par
 * code PostgreSQL.
 */

interface Associe {
  id: string;
  first_name: string;
  last_name: string;
  denomination: string | null;
  person_type: string | null;
}

interface ActeLeger {
  id: string;
  act_type: string;
  act_date: string;
}

interface LigneAssocie {
  id: string;
  officer_id: string;
  nb_parts: number;
  demembrement: string;
  date_effet: string | null;
  legal_act_id: string | null;
  acte_source: string | null;
  notes: string | null;
  /** `manual` (le cabinet l'engage) ou `statuts` (deduit d'un document date). */
  source: string;
  officer: Associe;
}

interface Props {
  clientId: string;
  nomClient: string;
  /** `clients.parts_totales`. La fiche en est propriétaire, cet onglet le lit. */
  partsTotales: number | null;
  capitalSocial: number | null;
  formeJuridique: string | null;
}

const DEMEMBREMENTS: Record<string, string> = {
  'pleine-propriete': 'Pleine propriété',
  'nue-propriete': 'Nue-propriété',
  usufruit: 'Usufruit',
};

/**
 * Le nom d'une personne du référentiel.
 *
 * ⚠️ `full_name` est une colonne GÉNÉRÉE de `company_officers`, et elle ne vaut
 * que pour les personnes physiques : une personne morale y apparaîtrait sous
 * « ' ' || last_name ». La dénomination prime donc quand elle existe.
 *
 * (La même expression figure déjà dans `OfficerToCompanyTab` et
 * `CompanyToOfficerTab`. La rassembler suppose de toucher ces deux écrans, ce
 * qui déborde de ce chantier.)
 */
function nomAssocie(o: Associe): string {
  if (o.person_type === 'morale') return o.denomination || o.last_name;
  return `${o.first_name} ${o.last_name}`.trim();
}

/** Les nombres de la fiche arrivent en `numeric`, donc parfois en chaîne. */
function nombre(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null;
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

function formatNombre(n: number): string {
  return n.toLocaleString('fr-FR', { maximumFractionDigits: 4 });
}

function formatDate(date: string | null): string | null {
  if (!date) return null;
  return new Date(date).toLocaleDateString('fr-FR');
}

const FORMULAIRE_VIDE = {
  officer_id: '',
  nb_parts: '',
  demembrement: 'pleine-propriete',
  date_effet: '',
  legal_act_id: '',
  acte_source: '',
  notes: '',
};

const IDENTITE_VIDE = {
  person_type: 'physique',
  first_name: '',
  last_name: '',
  denomination: '',
};

export function ClientPartsTab({
  clientId,
  nomClient,
  partsTotales,
  capitalSocial,
  formeJuridique,
}: Props) {
  const { showToast } = useToast();
  const [lignes, setLignes] = useState<LigneAssocie[]>([]);
  const [personnes, setPersonnes] = useState<Associe[]>([]);
  const [actes, setActes] = useState<ActeLeger[]>([]);
  const [loading, setLoading] = useState(true);
  /**
   * ⚠️ LE VOILE DE CHARGEMENT NE VAUT QUE POUR LE PREMIER AFFICHAGE, et ce n'est
   * pas une preference d'ergonomie. Le retour anticipe sur `loading` DEMONTE
   * tout le sous-arbre, fenetres comprises : apres un import reussi,
   * `onImporte` rappelle `charger()`, la fenetre disparaissait et revenait
   * vierge sur son ecran de depot. L'utilisateur voyait son enregistrement
   * s'evanouir sans un mot — une ecriture reussie qui a l'air de n'avoir rien
   * fait. Constate dans un navigateur.
   */
  const [premierAffichage, setPremierAffichage] = useState(true);
  /**
   * ⚠️ L'ÉCHEC DE CHARGEMENT A SON PROPRE ÉTAT, et ce n'est pas du zèle.
   * Sans lui, une lecture qui échoue laisse `lignes` vide et l'écran annonce
   * « Aucune repartition saisie » — c'est-à-dire qu'il présente une PANNE comme
   * un FAIT. Constaté dans un navigateur, pas supposé : PostgREST rendait
   * PGRST200 (cache de schéma antérieur à la table) et l'onglet affichait
   * sereinement son état vide. C'est exactement la confusion entre « absent »
   * et « on n'a pas pu savoir » que tout ce chantier existe pour empêcher.
   */
  const [erreurChargement, setErreurChargement] = useState<string | null>(null);
  const [enregistrement, setEnregistrement] = useState(false);
  const [modale, setModale] = useState(false);
  const [enEdition, setEnEdition] = useState<string | null>(null);
  const [aSupprimer, setASupprimer] = useState<LigneAssocie | null>(null);
  const [form, setForm] = useState(FORMULAIRE_VIDE);
  const [importOuvert, setImportOuvert] = useState(false);
  const [nouvelleIdentite, setNouvelleIdentite] = useState(false);
  const [identite, setIdentite] = useState(IDENTITE_VIDE);

  const mots = motTitre(formeJuridique);

  useEffect(() => {
    charger();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientId]);

  async function charger() {
    try {
      setLoading(true);
      setErreurChargement(null);
      const [ligneRes, personneRes, acteRes] = await Promise.all([
        supabase
          .from('client_associes')
          .select(
            `id, officer_id, nb_parts, demembrement, date_effet, legal_act_id,
             acte_source, notes, source,
             officer:officer_id ( id, first_name, last_name, denomination, person_type )`
          )
          .eq('client_id', clientId),
        supabase
          .from('company_officers')
          .select('id, first_name, last_name, denomination, person_type')
          .order('last_name'),
        supabase
          .from('legal_acts')
          .select('id, act_type, act_date')
          .eq('client_id', clientId)
          .order('act_date', { ascending: false }),
      ]);

      if (ligneRes.error) throw ligneRes.error;
      if (personneRes.error) throw personneRes.error;
      if (acteRes.error) throw acteRes.error;

      setLignes(
        ((ligneRes.data || []) as unknown as LigneAssocie[]).map((r) => ({
          ...r,
          nb_parts: nombre(r.nb_parts) ?? 0,
        }))
      );
      setPersonnes((personneRes.data || []) as Associe[]);
      setActes((acteRes.data || []) as ActeLeger[]);
    } catch (e) {
      setErreurChargement(messageErreur(e, 'La répartition n’a pas pu être lue.'));
      showToast('Erreur lors du chargement de la répartition', 'error');
    } finally {
      setLoading(false);
      setPremierAffichage(false);
    }
  }

  function ouvrirAjout() {
    setEnEdition(null);
    setForm(FORMULAIRE_VIDE);
    setNouvelleIdentite(false);
    setIdentite(IDENTITE_VIDE);
    setModale(true);
  }

  function ouvrirEdition(ligne: LigneAssocie) {
    setEnEdition(ligne.id);
    setForm({
      officer_id: ligne.officer_id,
      nb_parts: String(ligne.nb_parts),
      demembrement: ligne.demembrement,
      date_effet: ligne.date_effet || '',
      legal_act_id: ligne.legal_act_id || '',
      acte_source: ligne.acte_source || '',
      notes: ligne.notes || '',
    });
    setNouvelleIdentite(false);
    setIdentite(IDENTITE_VIDE);
    setModale(true);
  }

  /**
   * Crée la personne dans le référentiel et rend son identifiant.
   *
   * ⚠️ Une personne, PAS UN MANDAT. `OfficerFormModal` aurait pu servir, mais il
   * est taillé pour `officer_companies` : il impose un rôle et une date de début
   * de mandat, et créerait donc un dirigeant là où on veut seulement nommer un
   * détenteur de parts. Un associé n'est pas un dirigeant.
   */
  async function creerPersonne(): Promise<string | null> {
    const morale = identite.person_type === 'morale';
    const nom = morale ? identite.denomination.trim() : identite.last_name.trim();
    if (!nom) {
      showToast(morale ? 'Dénomination obligatoire' : 'Nom obligatoire', 'error');
      return null;
    }

    const { data, error } = await supabase
      .from('company_officers')
      .insert({
        person_type: identite.person_type,
        // `first_name` et `last_name` sont NOT NULL : une personne morale y met
        // sa denomination, comme le fait deja `CompanyToOfficerTab`.
        first_name: morale ? '' : identite.first_name.trim(),
        last_name: nom,
        denomination: morale ? nom : null,
        source: 'manual',
      })
      .select('id')
      .maybeSingle();

    if (error) {
      // Index unique sur (prenom, nom, type, date de naissance) : la personne
      // existe deja, et le dire vaut mieux qu'un « erreur inconnue ».
      if (codeErreur(error) === '23505') {
        showToast('Cette personne existe déjà : choisissez-la dans la liste', 'error');
      } else {
        showToast("Erreur lors de la création de l'associé", 'error');
      }
      return null;
    }
    return data?.id ?? null;
  }

  async function enregistrer() {
    const parts = Number(form.nb_parts.replace(',', '.'));
    if (!Number.isFinite(parts) || parts <= 0) {
      showToast(`Le nombre ${mots.de} doit être supérieur à zéro`, 'error');
      return;
    }

    setEnregistrement(true);
    try {
      let officerId = form.officer_id;
      if (nouvelleIdentite) {
        const cree = await creerPersonne();
        if (!cree) return;
        officerId = cree;
      }
      if (!officerId) {
        showToast('Veuillez choisir un associé', 'error');
        return;
      }

      const valeurs = {
        nb_parts: parts,
        demembrement: form.demembrement,
        date_effet: form.date_effet || null,
        legal_act_id: form.legal_act_id || null,
        acte_source: form.acte_source.trim() || null,
        notes: form.notes.trim() || null,
      };

      const { error } = enEdition
        ? await supabase
            .from('client_associes')
            .update({ ...valeurs, officer_id: officerId })
            .eq('id', enEdition)
        : await supabase
            .from('client_associes')
            .insert({ ...valeurs, client_id: clientId, officer_id: officerId });

      if (error) throw error;

      showToast(enEdition ? 'Détention modifiée' : 'Associé ajouté', 'success');
      setModale(false);
      charger();
    } catch (e) {
      if (codeErreur(e) === '23505') {
        showToast(
          `Cet associé a déjà une ligne en ${DEMEMBREMENTS[form.demembrement]?.toLowerCase()} : modifiez-la`,
          'error'
        );
      } else if (codeErreur(e) === '23514') {
        showToast('Valeur refusée par la base : vérifiez le nombre de parts', 'error');
      } else {
        showToast("Erreur lors de l'enregistrement", 'error');
      }
    } finally {
      setEnregistrement(false);
    }
  }

  async function supprimer(ligne: LigneAssocie) {
    try {
      const { error } = await supabase.from('client_associes').delete().eq('id', ligne.id);
      if (error) throw error;
      showToast('Détention supprimée', 'success');
      setASupprimer(null);
      charger();
    } catch {
      showToast('Erreur lors de la suppression', 'error');
    }
  }

  const etat = etatRepartition(lignes, partsTotales);
  const nominale = valeurNominale(capitalSocial, partsTotales);

  if (loading && premierAffichage) {
    return (
      <Card>
        <CardContent className="py-12">
          <div className="flex items-center justify-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-teal-600" />
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <PieChart className="w-5 h-5 text-gray-500" />
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
            Répartition des {mots.pluriel}
          </h2>
          {lignes.length > 0 && (
            <Badge className="bg-gray-100 text-gray-700">{lignes.length}</Badge>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setImportOuvert(true)}
            disabled={!!erreurChargement}
          >
            <Upload className="w-4 h-4 mr-1.5" />
            Importer
          </Button>
          <Button size="sm" onClick={ouvrirAjout} disabled={!!erreurChargement}>
            <Plus className="w-4 h-4 mr-1.5" />
            Ajouter un associé
          </Button>
        </div>
      </div>

      {erreurChargement !== null ? (
        // Une panne n'est PAS une absence. Tant qu'on n'a pas pu lire, on
        // n'affiche ni tableau vide, ni « aucune repartition » — on le dit.
        <Card>
          <CardContent className="py-12">
            <div className="text-center">
              <AlertTriangle className="mx-auto h-10 w-10 text-red-400" />
              <p className="mt-3 text-sm font-medium text-gray-900 dark:text-gray-100">
                La répartition n&apos;a pas pu être lue
              </p>
              <p className="mt-1 text-sm text-gray-500">
                Ce client a peut-être des associés enregistrés : cet écran ne peut pas le dire.
              </p>
              <p className="mt-2 text-xs text-gray-400">{erreurChargement}</p>
              <Button variant="outline" size="sm" className="mt-4" onClick={charger}>
                Réessayer
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : (
      <>
      <Card>
        <CardContent className="py-4">
          <dl className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-sm">
            <div>
              <dt className="text-gray-500 dark:text-gray-400">Capital social</dt>
              <dd className="font-medium text-gray-900 dark:text-gray-100">
                {capitalSocial === null ? '-' : `${formatNombre(capitalSocial)} EUR`}
              </dd>
            </div>
            <div>
              <dt className="text-gray-500 dark:text-gray-400">
                Nombre total {mots.de}
              </dt>
              <dd className="font-medium text-gray-900 dark:text-gray-100">
                {partsTotales === null ? '-' : formatNombre(partsTotales)}
              </dd>
            </div>
            <div>
              <dt className="text-gray-500 dark:text-gray-400">Valeur nominale</dt>
              <dd className="font-medium text-gray-900 dark:text-gray-100">
                {nominale === null ? '-' : `${formatNombre(nominale)} EUR`}
              </dd>
            </div>
          </dl>
        </CardContent>
      </Card>

      <BandeauEtat etat={etat} mots={mots} />

      {lignes.length === 0 ? (
        <Card>
          <CardContent className="py-12">
            <div className="text-center">
              <PieChart className="mx-auto h-10 w-10 text-gray-300" />
              <p className="mt-3 text-sm text-gray-500">
                Aucune répartition saisie pour ce client
              </p>
              <Button variant="outline" size="sm" className="mt-4" onClick={ouvrirAjout}>
                <Plus className="w-4 h-4 mr-1.5" />
                Ajouter un associé
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-200 dark:border-gray-700 text-left text-xs uppercase text-gray-500 dark:text-gray-400">
                    <th className="px-4 py-2 font-medium">Associé</th>
                    <th className="px-4 py-2 font-medium text-right">
                      {mots.pluriel.charAt(0).toUpperCase() + mots.pluriel.slice(1)}
                    </th>
                    <th className="px-4 py-2 font-medium text-right">%</th>
                    <th className="px-4 py-2 font-medium">Détention</th>
                    <th className="px-4 py-2 font-medium">Depuis</th>
                    <th className="px-4 py-2 font-medium">Acte</th>
                    <th className="px-4 py-2" />
                  </tr>
                </thead>
                <tbody>
                  {lignes.map((ligne) => {
                    const pct = pourcentage(ligne.nb_parts, partsTotales);
                    const acte = actes.find((a) => a.id === ligne.legal_act_id);
                    return (
                      <tr
                        key={ligne.id}
                        className="border-b border-gray-100 dark:border-gray-800 last:border-0"
                      >
                        <td className="px-4 py-2.5 font-medium text-gray-900 dark:text-gray-100">
                          {nomAssocie(ligne.officer)}
                        </td>
                        <td className="px-4 py-2.5 text-right tabular-nums">
                          {formatNombre(ligne.nb_parts)}
                        </td>
                        {/* Un tiret, et surtout pas « 0 % » : sans total declare,
                            le pourcentage est inconnu, pas nul. */}
                        <td className="px-4 py-2.5 text-right tabular-nums">
                          {pct === null ? (
                            <span className="text-gray-400" title={`Nombre total ${mots.de} absent de la fiche`}>
                              -
                            </span>
                          ) : (
                            `${pct.toFixed(2)} %`
                          )}
                        </td>
                        <td className="px-4 py-2.5">
                          {ligne.demembrement === 'pleine-propriete' ? (
                            <span className="text-gray-500">
                              {DEMEMBREMENTS[ligne.demembrement]}
                            </span>
                          ) : (
                            <Badge variant="warning">{DEMEMBREMENTS[ligne.demembrement]}</Badge>
                          )}
                        </td>
                        <td className="px-4 py-2.5 text-gray-500">
                          {formatDate(ligne.date_effet) || '-'}
                        </td>
                        <td className="px-4 py-2.5 text-gray-500">
                          {/* ⚠️ UNE LIGNE DEDUITE DES STATUTS SE VOIT, et c'est
                              tout l'objet de la colonne `source`. Elle date du
                              depot : les cessions posterieures n'y sont pas.
                              Sans marqueur, elle se lirait comme un chiffre que
                              le cabinet a verifie. */}
                          {ligne.source === 'statuts' && (
                            <Badge variant="warning" className="mr-1.5">
                              D&apos;après les statuts
                            </Badge>
                          )}
                          {acte
                            ? `${acte.act_type} du ${formatDate(acte.act_date)}`
                            : ligne.acte_source || (ligne.source === 'statuts' ? '' : '-')}
                        </td>
                        <td className="px-4 py-2.5">
                          <div className="flex items-center justify-end gap-1">
                            <button
                              type="button"
                              onClick={() => ouvrirEdition(ligne)}
                              aria-label={`Modifier la détention de ${nomAssocie(ligne.officer)}`}
                              title="Modifier"
                              className="p-1.5 text-gray-400 hover:text-teal-600 rounded-md hover:bg-teal-50 dark:hover:bg-teal-900/30"
                            >
                              <Pencil className="w-4 h-4" />
                            </button>
                            <button
                              type="button"
                              onClick={() => setASupprimer(ligne)}
                              aria-label={`Supprimer la détention de ${nomAssocie(ligne.officer)}`}
                              title="Supprimer"
                              className="p-1.5 text-gray-400 hover:text-red-500 rounded-md hover:bg-red-50 dark:hover:bg-red-900/30"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {/* Sans cette note, la somme du bandeau ne correspondrait pas a ce
                qu'on lit dans la colonne, et l'ecran aurait l'air de se tromper. */}
            {lignes.some((x) => x.demembrement === 'usufruit') && (
              <p className="px-4 py-3 text-xs text-gray-500 border-t border-gray-100 dark:border-gray-800">
                L&apos;usufruit n&apos;entre pas dans le total : il porte sur des {mots.pluriel} dont
                une autre personne est nu-propriétaire, et les compter deux fois ferait dépasser le
                capital.
              </p>
            )}
          </CardContent>
        </Card>
      )}
      </>
      )}

      <Modal
        isOpen={modale}
        onClose={() => setModale(false)}
        title={enEdition ? 'Modifier la détention' : 'Ajouter un associé'}
        size="lg"
      >
        <div className="space-y-4">
          {!nouvelleIdentite ? (
            <div className="space-y-2">
              <SearchableSelect
                label="Associé"
                value={form.officer_id}
                onChange={(v) => setForm({ ...form, officer_id: v })}
                placeholder="Rechercher une personne..."
                required
                options={personnes.map((p) => ({
                  value: p.id,
                  label: nomAssocie(p),
                  subtitle: p.person_type === 'morale' ? 'Personne morale' : 'Personne physique',
                }))}
              />
              <button
                type="button"
                onClick={() => setNouvelleIdentite(true)}
                className="text-sm text-teal-600 hover:underline"
              >
                L&apos;associé n&apos;est pas dans la liste
              </button>
            </div>
          ) : (
            <div className="space-y-3 rounded-lg border border-gray-200 dark:border-gray-700 p-3">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                  Nouvel associé
                </span>
                <button
                  type="button"
                  onClick={() => setNouvelleIdentite(false)}
                  className="text-sm text-teal-600 hover:underline"
                >
                  Choisir dans la liste
                </button>
              </div>
              <Select
                label="Type de personne"
                value={identite.person_type}
                onChange={(e) => setIdentite({ ...identite, person_type: e.target.value })}
                options={[
                  { value: 'physique', label: 'Personne physique' },
                  { value: 'morale', label: 'Personne morale' },
                ]}
              />
              {identite.person_type === 'morale' ? (
                <Input
                  label="Dénomination sociale"
                  value={identite.denomination}
                  onChange={(e) => setIdentite({ ...identite, denomination: e.target.value })}
                />
              ) : (
                <div className="grid grid-cols-2 gap-3">
                  <Input
                    label="Prénom"
                    value={identite.first_name}
                    onChange={(e) => setIdentite({ ...identite, first_name: e.target.value })}
                  />
                  <Input
                    label="Nom"
                    value={identite.last_name}
                    onChange={(e) => setIdentite({ ...identite, last_name: e.target.value })}
                  />
                </div>
              )}
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Input
              label={`Nombre ${mots.de}`}
              type="number"
              min="0"
              step="any"
              value={form.nb_parts}
              onChange={(e) => setForm({ ...form, nb_parts: e.target.value })}
            />
            <Select
              label="Détention"
              value={form.demembrement}
              onChange={(e) => setForm({ ...form, demembrement: e.target.value })}
              options={Object.entries(DEMEMBREMENTS).map(([value, label]) => ({ value, label }))}
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Input
              label="Date d'effet"
              type="date"
              value={form.date_effet}
              onChange={(e) => setForm({ ...form, date_effet: e.target.value })}
              helperText="La date de l'acte qui a établi cette détention"
            />
            <Select
              label="Acte du registre"
              value={form.legal_act_id}
              onChange={(e) => setForm({ ...form, legal_act_id: e.target.value })}
              options={[
                { value: '', label: 'Aucun' },
                ...actes.map((a) => ({
                  value: a.id,
                  label: `${a.act_type} du ${formatDate(a.act_date)}`,
                })),
              ]}
            />
          </div>

          {/* Le champ libre existe parce que la plupart des cessions de parts
              sont notariees et ne sont jamais deposees au greffe : elles
              n'apparaissent donc pas dans la liste ci-dessus. */}
          <Input
            label="Autre acte source"
            value={form.acte_source}
            onChange={(e) => setForm({ ...form, acte_source: e.target.value })}
            placeholder="Cession de parts du 12/03/2019, Me Durand"
            helperText="Pour un acte absent du registre : cession notariée, acte sous seing privé"
          />

          <Input
            label="Notes"
            value={form.notes}
            onChange={(e) => setForm({ ...form, notes: e.target.value })}
          />

          <div className="flex justify-end gap-3 pt-2">
            <Button variant="outline" onClick={() => setModale(false)}>
              Annuler
            </Button>
            <Button onClick={enregistrer} disabled={enregistrement}>
              {enregistrement ? 'Enregistrement...' : enEdition ? 'Modifier' : 'Ajouter'}
            </Button>
          </div>
        </div>
      </Modal>

      <PartsImportModal
        isOpen={importOuvert}
        onClose={() => setImportOuvert(false)}
        clientId={clientId}
        nomClient={nomClient}
        motPluriel={mots.pluriel}
        lignesExistantes={lignes.length}
        partsTotales={partsTotales}
        onImporte={charger}
      />

      <ConfirmDialog
        isOpen={!!aSupprimer}
        onClose={() => setASupprimer(null)}
        onConfirm={() => aSupprimer && supprimer(aSupprimer)}
        title="Supprimer la détention"
        message={
          aSupprimer
            ? `Retirer ${formatNombre(aSupprimer.nb_parts)} ${mots.pluriel} de ${nomAssocie(aSupprimer.officer)} ? La répartition deviendra incomplète.`
            : ''
        }
        confirmText="Supprimer"
        variant="danger"
      />
    </div>
  );
}

/**
 * Le bandeau d'état.
 *
 * ⚠️ IL NE DIT RIEN QUAND TOUT VA BIEN. Un avertissement permanent est un
 * avertissement qu'on n'a plus vu au bout d'une semaine ; celui-ci n'apparaît
 * que lorsqu'il porte une information.
 */
function BandeauEtat({
  etat,
  mots,
}: {
  etat: EtatRepartition;
  mots: MotsParts;
}) {
  if (etat.etat === 'complete' || etat.etat === 'non-saisie') return null;

  const grave = etat.etat === 'incoherente';
  const Icone = grave ? AlertTriangle : Info;

  const message =
    etat.etat === 'total-inconnu'
      ? `Le nombre total ${mots.de} n'est pas renseigné dans la fiche : les pourcentages ne peuvent pas être calculés. Renseignez-le dans l'onglet Informations.`
      : etat.etat === 'incomplete'
        ? `Répartition incomplète : ${formatNombre(etat.somme)} ${mots.pluriel} saisies sur ${formatNombre(etat.total)}, il en manque ${formatNombre(etat.manquant)}. Les pourcentages affichés sont justes, mais la liste ne couvre pas tout le capital.`
        : `Répartition incohérente : la somme saisie (${formatNombre(etat.somme)}) dépasse le total déclaré (${formatNombre(etat.total)}) de ${formatNombre(etat.excedent)} ${mots.pluriel}. L'une des deux valeurs est fausse.`;

  return (
    <div
      className={`flex items-start gap-2 rounded-lg border p-3 text-sm ${
        grave
          ? 'border-red-200 bg-red-50 text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300'
          : 'border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-300'
      }`}
    >
      <Icone className="w-4 h-4 mt-0.5 flex-shrink-0" />
      <span>{message}</span>
    </div>
  );
}
