import { useState, useCallback, useEffect, useRef } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../contexts/ToastContext';
import { useRegimesFiscaux } from '../../hooks/useRegimesFiscaux';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { Select } from '../ui/Select';
import { MonthPicker } from './MonthPicker';
import { repartirAdresseInpi } from '../../lib/adresseHeritee';
import { RegimeFiscalSelect } from './RegimeFiscalSelect';
import { CollaboratorSelect } from './CollaboratorSelect';
import { LegalFormSelect } from './LegalFormSelect';
import { Loader, CheckCircle, AlertTriangle } from 'lucide-react';
import { searchCompanyByINPI, convertDDMMToDate } from '../../lib/inpiService';
import { getLegalFormLabel } from '../../lib/legalFormsUtils';
import type { ClientStatus } from '../../types/database';

interface ClientCreateModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCreated: () => void;
  initialSiret?: string;
  initialName?: string;
}

const EMPTY_FORM = {
  nom_entreprise: '',
  // Vide et non 'morale' : « on ne sait pas » est un etat legitime, et un defaut
  // mentirait sur les LMNP et les particuliers.
  type_personne: '',
  civilite: '',
  nom: '',
  prenom: '',
  numero_dossier: '',
  siret: '',
  forme_juridique: '',
  // L'adresse en composants. `adresse` n'est plus saisie nulle part : le
  // declencheur `clients_composer_adresse` la recompose.
  adresse_ligne1: '',
  adresse_complement: '',
  code_postal: '',
  ville: '',
  pays: 'France',
  email: '',
  telephone: '',
  telephone_2: '',
  contact_principal: '',
  statut: 'actif' as ClientStatus,
  date_cloture: '',
  regime_fiscal: '',
  date_creation_entreprise: '',
  capital_social: '',
  dirigeant: '',
  code_ape: '',
  date_entree_cabinet: new Date().toISOString().split('T')[0],
};

export function ClientCreateModal({ isOpen, onClose, onCreated, initialSiret, initialName }: ClientCreateModalProps) {
  const { profile } = useAuth();
  const { showToast } = useToast();
  const { regimes: REGIMES_FISCAUX } = useRegimesFiscaux();

  const [formData, setFormData] = useState({ ...EMPTY_FORM });
  // Les roles ne sont plus une liste figee : ils se configurent dans
  // « Parametres ▸ Roles des collaborateurs » (table cabinet_collaborator_roles),
  // et la colonne `client_collaborators.role` est nullable. L'union litterale
  // heritee empechait `CollaboratorSelect` de rendre le moindre role
  // personnalise.
  const [selectedCollaborators, setSelectedCollaborators] = useState<Array<{
    user_id: string;
    role: string | null;
  }>>([]);
  const [isLoadingINPI, setIsLoadingINPI] = useState(false);
  const [inpiDataLoaded, setInpiDataLoaded] = useState(false);
  const [inpiSearchStatus, setInpiSearchStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const lastSearchedSiret = useRef<string>('');

  useEffect(() => {
    if (isOpen) {
      setFormData({
        ...EMPTY_FORM,
        date_entree_cabinet: new Date().toISOString().split('T')[0],
        ...(initialSiret ? { siret: initialSiret } : {}),
        ...(initialName ? { nom_entreprise: initialName } : {}),
      });
      setSelectedCollaborators([]);
      setInpiDataLoaded(false);
      setInpiSearchStatus('idle');
      setIsLoadingINPI(false);
      lastSearchedSiret.current = '';
    }
  }, [isOpen, initialSiret, initialName]);

  const handleINPISearch = useCallback(async (siret: string) => {
    setIsLoadingINPI(true);
    setInpiSearchStatus('loading');
    try {
      const result = await searchCompanyByINPI(siret);
      if (result.success && result.data) {
        const adresse = repartirAdresseInpi(result.data.adresse);
        const formeJuridiqueLabel = await getLegalFormLabel(result.data.formeJuridique);
        const rawDateCloture = result.data.dateCloture || result.data.dateClotureExerciceSocial;
        const dateCloture = convertDDMMToDate(rawDateCloture) || '';
        const inpiSiret = result.data.siret;
        setFormData(prev => ({
          ...prev,
          siret: (inpiSiret && inpiSiret.length === 14) ? inpiSiret : prev.siret,
          // `isPersonnePhysique` vient de l'extraction serveur (tranche 6) : le
          // deviner depuis `forme_juridique` serait faux, la colonne stockant le
          // LIBELLE et non le code.
          type_personne: result.data!.isPersonnePhysique ? 'physique' : 'morale',
          nom: result.data!.nom || prev.nom,
          prenom: result.data!.prenom || prev.prenom,
          // Une personne physique ne rend plus de `denomination` : son libelle est
          // recompose depuis nom et prenom, ci-dessous et par le declencheur.
          nom_entreprise: result.data!.denomination || prev.nom_entreprise,
          forme_juridique: formeJuridiqueLabel || result.data!.formeJuridique || prev.forme_juridique,
          date_creation_entreprise: result.data!.dateCreation || prev.date_creation_entreprise,
          capital_social: result.data!.capitalSocial ? result.data!.capitalSocial.toString() : prev.capital_social,
          dirigeant: result.data!.dirigeant || prev.dirigeant,
          code_ape: result.data!.codeAPE || prev.code_ape,
          adresse_ligne1: adresse.adresse_ligne1 || prev.adresse_ligne1,
          adresse_complement: adresse.adresse_complement || prev.adresse_complement,
          code_postal: adresse.code_postal || prev.code_postal,
          ville: adresse.ville || prev.ville,
          pays: adresse.pays || prev.pays,
          date_cloture: dateCloture || prev.date_cloture,
        }));
        if (inpiSiret && inpiSiret.length === 14) {
          lastSearchedSiret.current = inpiSiret;
        }
        setInpiDataLoaded(true);
        setInpiSearchStatus('success');
        showToast('Donnees INPI chargees avec succes', 'success');
      } else {
        setInpiSearchStatus('error');
        showToast(result.message || 'Entreprise non trouvee dans la base INPI', 'error');
      }
    } catch {
      setInpiSearchStatus('error');
      showToast('Erreur lors de la recherche INPI', 'error');
    } finally {
      setIsLoadingINPI(false);
    }
  }, [showToast]);

  useEffect(() => {
    const value = formData.siret.replace(/\s/g, '');
    const isValidSiren = value.length === 9 && /^\d{9}$/.test(value);
    const isValidSiret = value.length === 14 && /^\d{14}$/.test(value);
    if (isValidSiren || isValidSiret) {
      if (value !== lastSearchedSiret.current) {
        lastSearchedSiret.current = value;
        const timer = setTimeout(() => handleINPISearch(value), 500);
        return () => clearTimeout(timer);
      }
    } else if (value.length < 9 || (value.length > 9 && value.length < 14)) {
      lastSearchedSiret.current = '';
      setInpiSearchStatus('idle');
      setInpiDataLoaded(false);
    }
  }, [formData.siret, handleINPISearch]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!profile) return;
    try {
      /*
       * DISTINCTION A TENIR ENTRE LES DEUX CHEMINS.
       *
       * En UPDATE, le front n'ecrit JAMAIS `nom_entreprise` : elle figure dans
       * COLONNES_NON_ENVOYEES, c'est le declencheur qui la recompose.
       *
       * En INSERT, il l'ecrit. Le declencheur la recalculerait a l'identique —
       * il s'execute BEFORE INSERT — donc ces trois lignes sont une CEINTURE,
       * pas une necessite. Elles valent quand meme leur place : elles rendent
       * l'INSERT lisible sans avoir a connaitre le declencheur, et la colonne
       * etant NOT NULL, l'echec serait brutal si celui-ci venait a manquer.
       *
       * Le calcul est EXACTEMENT celui du declencheur — « NOM Prenom », sans
       * civilite — donc aucune divergence possible.
       */
      const libelle =
        formData.type_personne === 'physique'
          ? [formData.nom, formData.prenom].filter(Boolean).join(' ')
          : formData.nom_entreprise;

      const clientData = {
        ...formData,
        nom_entreprise: libelle || formData.nom_entreprise,
        type_personne: formData.type_personne || null,
        civilite: formData.civilite || null,
        capital_social: formData.capital_social ? parseFloat(formData.capital_social) : null,
      };
      const { data: newClient, error } = await supabase
        .from('clients')
        .insert([clientData])
        .select()
        .single();
      if (error) throw error;

      if (newClient && selectedCollaborators.length > 0) {
        const collabData = selectedCollaborators.map(c => ({
          client_id: newClient.id,
          user_id: c.user_id,
          role: c.role,
        }));
        await supabase.from('client_collaborators').insert(collabData);
      }

      showToast('Client cree avec succes', 'success');
      onCreated();
      onClose();
    } catch (error: any) {
      showToast(error.message || 'Erreur lors de la creation du client', 'error');
    }
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Nouveau client" size="xl">
      <form onSubmit={handleSubmit} className="space-y-6">
        {inpiDataLoaded && (
          <div className="flex items-center gap-2 p-3 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg">
            <CheckCircle className="w-5 h-5 text-green-600 dark:text-green-400 flex-shrink-0" />
            <div className="flex-1">
              <p className="text-sm font-medium text-green-900 dark:text-green-300">
                Donnees auto-remplies depuis l'INPI
              </p>
              <p className="text-xs text-green-700 dark:text-green-400 mt-0.5">
                Vous pouvez modifier les champs si necessaire
              </p>
            </div>
          </div>
        )}

        <div className="space-y-4">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Informations generales</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Select
              label="Type de personne"
              value={formData.type_personne}
              onChange={(e) => setFormData({ ...formData, type_personne: e.target.value })}
            >
              <option value="">Non renseigne</option>
              <option value="morale">Personne morale (societe)</option>
              <option value="physique">Personne physique (entrepreneur individuel)</option>
            </Select>
            <Input
              label="Numero de dossier"
              value={formData.numero_dossier}
              onChange={(e) => setFormData({ ...formData, numero_dossier: e.target.value })}
              placeholder="N interne"
            />
          </div>
          {/*
            Soit la raison sociale, soit civilite / nom / prenom — jamais les
            deux. `required` est conserve sur le champ effectivement utilise :
            `nom_entreprise` est NOT NULL en base.
          */}
          {formData.type_personne === 'physique' ? (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <Select
                label="Civilite"
                value={formData.civilite}
                onChange={(e) => setFormData({ ...formData, civilite: e.target.value })}
              >
                <option value="">-</option>
                <option value="M.">M.</option>
                <option value="Mme">Mme</option>
              </Select>
              <Input
                label="Nom"
                value={formData.nom}
                onChange={(e) => setFormData({ ...formData, nom: e.target.value })}
                required
              />
              <Input
                label="Prenom"
                value={formData.prenom}
                onChange={(e) => setFormData({ ...formData, prenom: e.target.value })}
              />
            </div>
          ) : (
            <Input
              label="Nom de l'entreprise"
              value={formData.nom_entreprise}
              onChange={(e) => setFormData({ ...formData, nom_entreprise: e.target.value })}
              required
            />
          )}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="relative">
              <Input
                label="SIREN / SIRET"
                value={formData.siret}
                onChange={(e) => setFormData({ ...formData, siret: e.target.value })}
                placeholder="9 ou 14 chiffres - Auto-remplissage INPI"
                disabled={isLoadingINPI}
              />
              <div className="absolute right-3 top-9 flex items-center gap-2">
                {inpiSearchStatus === 'loading' && <Loader className="w-5 h-5 text-teal-500 animate-spin" />}
                {inpiSearchStatus === 'success' && <CheckCircle className="w-5 h-5 text-green-500" />}
                {inpiSearchStatus === 'error' && <AlertTriangle className="w-5 h-5 text-orange-500" />}
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Forme juridique</label>
              <LegalFormSelect
                value={formData.forme_juridique}
                onChange={(value) => setFormData({ ...formData, forme_juridique: value })}
              />
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Input
              label="Code APE"
              value={formData.code_ape}
              onChange={(e) => setFormData({ ...formData, code_ape: e.target.value })}
              placeholder="Ex: 6202A"
            />
            <Input
              label="Capital social"
              type="number"
              value={formData.capital_social}
              onChange={(e) => setFormData({ ...formData, capital_social: e.target.value })}
              placeholder="Montant"
            />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Input
              label="Dirigeant"
              value={formData.dirigeant}
              onChange={(e) => setFormData({ ...formData, dirigeant: e.target.value })}
              placeholder="Nom du dirigeant"
            />
            <Input
              label="Date de creation"
              type="date"
              value={formData.date_creation_entreprise}
              onChange={(e) => setFormData({ ...formData, date_creation_entreprise: e.target.value })}
            />
          </div>
        </div>

        <div className="border-t border-gray-200 dark:border-gray-700 pt-6 space-y-4">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Informations comptables</h3>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <MonthPicker
              label="Mois de cloture"
              value={formData.date_cloture}
              onChange={(date) => setFormData({ ...formData, date_cloture: date })}
            />
            <RegimeFiscalSelect
              label="Regime fiscal"
              value={formData.regime_fiscal}
              onChange={(regime) => setFormData({ ...formData, regime_fiscal: regime })}
              regimes={REGIMES_FISCAUX}
            />
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Statut</label>
              <Select
                value={formData.statut}
                onChange={(e) => setFormData({ ...formData, statut: e.target.value as ClientStatus })}
              >
                <option value="actif">Actif</option>
                <option value="inactif">Inactif</option>
                <option value="prospect">Prospect</option>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Input
              label="Date d'entree au cabinet"
              type="date"
              value={formData.date_entree_cabinet}
              onChange={(e) => setFormData({ ...formData, date_entree_cabinet: e.target.value })}
            />
          </div>
          <CollaboratorSelect
            collaborators={selectedCollaborators}
            onChange={setSelectedCollaborators}
          />
        </div>

        <div className="border-t border-gray-200 dark:border-gray-700 pt-6 space-y-4">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Coordonnees</h3>
          <Input
            label="Adresse"
            value={formData.adresse_ligne1}
            onChange={(e) => setFormData({ ...formData, adresse_ligne1: e.target.value })}
            placeholder="12 RUE de l Exemple"
          />
          <Input
            label="Complement"
            value={formData.adresse_complement}
            onChange={(e) => setFormData({ ...formData, adresse_complement: e.target.value })}
            placeholder="Batiment B, 2e etage"
          />
          {/*
            `code_insee` n'apparait pas : personne ne le saisit a la main. Il vient
            de la synchronisation INPI, ou du bouton « Auto » de la fiche.
          */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <Input
              label="Code postal"
              value={formData.code_postal}
              onChange={(e) => setFormData({ ...formData, code_postal: e.target.value })}
              placeholder="81120"
            />
            <Input
              label="Ville"
              value={formData.ville}
              onChange={(e) => setFormData({ ...formData, ville: e.target.value })}
              placeholder="Villeneuve"
            />
            <Input
              label="Pays"
              value={formData.pays}
              onChange={(e) => setFormData({ ...formData, pays: e.target.value })}
            />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Input
              label="Email"
              type="email"
              value={formData.email}
              onChange={(e) => setFormData({ ...formData, email: e.target.value })}
            />
            <Input
              label="Telephone"
              type="tel"
              value={formData.telephone}
              onChange={(e) => setFormData({ ...formData, telephone: e.target.value })}
            />
            <Input
              label="Telephone 2"
              type="tel"
              value={formData.telephone_2}
              onChange={(e) => setFormData({ ...formData, telephone_2: e.target.value })}
            />
          </div>
          <Input
            label="Contact principal"
            value={formData.contact_principal}
            onChange={(e) => setFormData({ ...formData, contact_principal: e.target.value })}
            placeholder="Nom de la personne a contacter"
          />
        </div>

        <div className="flex justify-end gap-2 pt-4 border-t border-gray-200 dark:border-gray-700">
          <Button type="button" variant="secondary" onClick={onClose}>Annuler</Button>
          <Button type="submit" disabled={isLoadingINPI}>
            {isLoadingINPI ? 'Chargement...' : 'Creer le client'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
