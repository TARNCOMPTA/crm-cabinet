import { supabase } from './supabase';
import { Database } from '../types/database';

type Client = Database['public']['Tables']['clients']['Row'];
type INPISyncHistory = Database['public']['Tables']['inpi_sync_history']['Row'];
type LegalAct = Database['public']['Tables']['legal_acts']['Row'];
type CompanyOfficer = Database['public']['Tables']['company_officers']['Row'];
type OfficerCompany = Database['public']['Tables']['officer_companies']['Row'];

// Retry configuration for API calls
const RETRY_CONFIG = {
  maxRetries: 3,
  initialDelay: 1000, // 1 second
  maxDelay: 10000, // 10 seconds
  backoffMultiplier: 2,
};

/**
 * Utility function to retry async operations with exponential backoff
 */
async function retryWithBackoff<T>(
  operation: () => Promise<T>,
  retries = RETRY_CONFIG.maxRetries,
  delay = RETRY_CONFIG.initialDelay
): Promise<T> {
  try {
    return await operation();
  } catch (error: any) {
    if (retries === 0) {
      throw error;
    }

    // Don't retry on client errors (4xx) except 429 (rate limit)
    const status = error?.status || error?.response?.status;
    if (status && status >= 400 && status < 500 && status !== 429) {
      throw error;
    }

    // Wait before retrying
    await new Promise(resolve => setTimeout(resolve, delay));

    // Retry with exponential backoff
    const nextDelay = Math.min(delay * RETRY_CONFIG.backoffMultiplier, RETRY_CONFIG.maxDelay);
    return retryWithBackoff(operation, retries - 1, nextDelay);
  }
}

export interface INPICompanyData {
  siren: string;
  siret: string;
  denomination: string;
  formeJuridique: string;
  dateCreation: string;
  dateCloture?: string;
  dateClotureExerciceSocial?: string;
  datePremiereCloture?: string;
  descriptionActivite?: string;
  capitalSocial: number;
  dirigeant: string;
  adresse: {
    ligne1: string;
    codePostal: string;
    ville: string;
    /**
     * ⚠️ OPTIONNELS A DESSEIN. Le chemin `action:'search'` ne les renvoie pas
     * encore : les trois extracteurs SIREN passent par `extractAddressLine`, qui
     * jette le complement, le pays et le code INSEE que `buildAddress` extrait
     * pourtant. C'est le volet serveur qui le corrige.
     *
     * L'optionalite est ce qui rend cet ecran livrable AVANT ce correctif, sans
     * erreur de types ni comportement casse : quand le serveur les fournira, ils
     * seront lus sans une ligne de plus.
     */
    complement?: string;
    pays?: string;
    codeInsee?: string;
  };
  codeAPE: string;
  libelleAPE: string;
  /** Renseigne quand l'INPI decrit une personne physique. */
  isPersonnePhysique?: boolean;
  /** Nom d'usage a defaut du nom de naissance, pour une personne physique. */
  nom?: string;
  /** Premier prenom. */
  prenom?: string;
  /** Etat civil complet : « Jean Pierre Marie ». */
  prenoms?: string;
}

export interface INPITestResult {
  success: boolean;
  message: string;
  tokenValid?: boolean;
}

export interface INPILegalActData {
  type: string;
  category: string;
  date: string;
  depositDate?: string;
  reference: string;
  documentUrl?: string;
  description?: string;
}

export interface INPIOfficerData {
  personType: 'physique' | 'morale';
  firstName: string;
  lastName: string;
  denomination?: string | null;
  role: string;
  roleType?: string;
  startDate?: string;
  endDate?: string;
  isActive: boolean;
  birthDate?: string | null;
  nationality?: string | null;
  siren?: string | null;
}

export interface CompanySearchResult {
  siren: string;
  siret: string;
  denomination: string;
  formeJuridique: string;
  codeNaf: string;
  libelleNaf: string;
  adresse: {
    ligne1: string;
    /** Champ propre depuis que `buildAddress` ne le replie plus dans `ligne1`. */
    complement?: string;
    codePostal: string;
    ville: string;
    pays: string;
    codeInsee?: string;
  };
  dateCreation: string;
  statut: string;
  isPersonnePhysique?: boolean;
}

export async function searchCompaniesByName(query: string): Promise<{
  success: boolean;
  message: string;
  results?: CompanySearchResult[];
  total?: number;
}> {
  try {
    const trimmed = query.trim();
    if (trimmed.length < 2) {
      return { success: false, message: 'Saisissez au moins 2 caracteres' };
    }

    const connecte = await sessionOuverte();
    if (!connecte) {
      return { success: false, message: 'Session invalide. Veuillez vous reconnecter.' };
    }

    const apiUrl = `/api/inpi-api`;
    const response = await fetch(apiUrl, {
      method: 'POST',
      credentials: 'same-origin',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ action: 'search-companies', query: trimmed }),
    });

    const data = await response.json().catch(() => ({}));

    if (!response.ok || !data?.success) {
      return {
        success: false,
        message: data?.message || `Erreur lors de la recherche (${response.status})`,
      };
    }

    // Le serveur nomme cette liste `companies`, pas `results` — et n'envoie pas
    // de `total`. La lecture d'origine visait `data.results`, donc undefined :
    // la recherche annonçait « 4 entreprise(s) trouvee(s) » et n'en affichait
    // aucune. Un écart de nom que rien ne pouvait signaler, l'appel étant
    // typé nulle part.
    const entreprises = (data.companies || []) as CompanySearchResult[];
    return {
      success: true,
      message: data.message || '',
      results: entreprises,
      total: entreprises.length,
    };
  } catch (error: any) {
    return {
      success: false,
      message: error?.message || 'Erreur inattendue lors de la recherche',
    };
  }
}

export interface LegalActsSyncResult {
  success: boolean;
  message: string;
  actsCount?: number;
  acts?: INPILegalActData[];
}

/**
 * Y a-t-il une session ouverte ?
 *
 * Remplace `getValidAccessToken()`. Le jeton a disparu avec Supabase : la
 * session est un cookie httpOnly, que le JavaScript de la page ne peut pas lire
 * — c'est ce qui la met hors de portée d'une XSS. L'ancienne fonction renvoyait
 * donc `undefined` en toutes circonstances, et les onze gardes qui la suivent
 * refusaient d'appeler l'INPI : recherche, synchronisation et téléchargement
 * d'actes échouaient tous sur « Session invalide », y compris avec une session
 * parfaitement valide.
 *
 * La garde, elle, garde tout son sens — ne pas lancer une requête vouée au 401,
 * et le dire clairement. Elle interroge simplement le serveur au lieu de lire un
 * jeton. Il n'y a plus rien à rafraîchir non plus : la durée de vie du cookie
 * est tenue par le serveur.
 */
async function sessionOuverte(): Promise<boolean> {
  const { data: { session } } = await supabase.auth.getSession();
  return Boolean(session?.profil);
}

export async function testINPIConnection(): Promise<INPITestResult> {
  try {
    const connecte = await sessionOuverte();

    if (!connecte) {
      return {
        success: false,
        message: 'Session invalide. Veuillez vous reconnecter.'
      };
    }

    const apiUrl = `/api/inpi-sync`;

    const response = await fetch(apiUrl, {
      method: 'POST',
      credentials: 'same-origin',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        action: 'test'
      })
    });

    const data = await response.json();

    if (!response.ok) {
      return {
        success: false,
        message: data.message || 'Erreur lors du test de connexion'
      };
    }

    return {
      success: data.success,
      message: data.message,
      tokenValid: data.tokenValid
    };
  } catch (error: any) {
    return {
      success: false,
      message: error?.message || 'Erreur inattendue lors du test de connexion'
    };
  }
}

export function convertDDMMToDate(ddmm: string | null | undefined): string | null {
  if (!ddmm || ddmm.length !== 4) return null;
  const day = ddmm.substring(0, 2);
  const month = ddmm.substring(2, 4);
  const year = new Date().getFullYear();
  const dateStr = `${year}-${month}-${day}`;
  const parsed = new Date(dateStr);
  if (isNaN(parsed.getTime())) return null;
  return dateStr;
}

export async function syncClientWithINPI(clientId: string): Promise<{
  success: boolean;
  message: string;
  data?: Partial<Client>;
}> {
  try {
    const { data: client } = await supabase
      .from('clients')
      .select('siret, siren')
      .eq('id', clientId)
      .maybeSingle();

    if (!client || (!client.siret && !client.siren)) {
      return {
        success: false,
        message: 'Client non trouvé ou SIRET/SIREN manquant'
      };
    }

    const identifier = client.siret || client.siren;

    const connecte = await sessionOuverte();

    if (!connecte) {
      await logSyncHistory(clientId, 'error', null, 'Session invalide');
      return {
        success: false,
        message: 'Session invalide. Veuillez vous reconnecter.'
      };
    }

    const apiUrl = `/api/inpi-sync`;

    // Use retry logic with exponential backoff for API call
    const { response, data } = await retryWithBackoff(async () => {
      const res = await fetch(apiUrl, {
        method: 'POST',
        credentials: 'same-origin',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          action: 'sync',
          clientId,
          siret: identifier
        })
      });

      const responseData = await res.json();

      // Attach status for retry logic
      if (!res.ok) {
        const error: any = new Error(responseData.message || 'Erreur API');
        error.status = res.status;
        throw error;
      }

      return { response: res, data: responseData };
    });

    if (!response.ok) {
      await logSyncHistory(clientId, 'error', null, data.message || 'Erreur');
      return {
        success: false,
        message: data.message || 'Erreur lors de la synchronisation'
      };
    }

    if (data.success && data.companyData) {
      /*
       * ⚠️ LA SECONDE ECRITURE A ETE SUPPRIMEE ICI. Le serveur est desormais le
       * seul ecrivain de `clients` sur le chemin INPI.
       *
       * Ce que faisait ce bloc : sur `{action:'sync'}`, le serveur ecrivait
       * d'abord (`appliquerAuClient`), puis ces vingt-deux lignes REECRIVAIENT
       * onze colonnes par-dessus — SANS garde sur le vide. Consequence concrete :
       * synchroniser un entrepreneur individuel, dont l'INPI ne connait ni la
       * date de cloture ni la description d'activite, VIDAIT `date_cloture`,
       * `date_premiere_cloture` et `description_activite` a chaque passage.
       *
       * Les trois choses que ce front savait faire en plus ont ete portees :
       * `convertDDMMToDate` -> `server/src/inpi/dates.ts` avec son test, la
       * resolution du libelle de forme juridique -> une requete sur
       * `legal_forms` AVEC REPLI SUR LE CODE, et les trois colonnes ci-dessus
       * ajoutees a `CHAMPS_SYNCHRONISABLES` — ou elles arrivent avec la garde
       * anti-vide, ce qui corrige le defaut au passage.
       *
       * Tout le reste de cette fonction est conserve intact : la garde
       * `sessionOuverte()`, `retryWithBackoff`, `logSyncHistory` qui alimente
       * `SyncHistoryCard`, `syncOfficersToDatabase`, le flux des actes et le
       * contrat de retour `{success, message, data}`. Les trois appelants de
       * `syncClientWithINPI` n'exploitent que `success` et `message` — aucun ne
       * lit `data.adresse`.
       */
      await logSyncHistory(clientId, 'success', data.companyData, null);

      let officerMessage = '';
      if (data.companyData.officers && data.companyData.officers.length > 0) {
        try {

          const result = await syncOfficersToDatabase(clientId, data.companyData.officers);
          if (result.synced > 0) {
            officerMessage = ` - ${result.synced} dirigeant(s) importé(s)`;
          }
          if (result.errors > 0) {
            officerMessage += ` (${result.errors} erreur(s))`;
          }
        } catch {
          officerMessage = ' - Erreur import dirigeants';
        }
      }

      return {
        success: true,
        message: `Synchronisation réussie${officerMessage}`,
        /*
         * `data` portait `updateData`, l'objet que ce front ecrivait lui-meme.
         * Il n'ecrit plus rien : on rend donc ce que le SERVEUR a renvoye.
         *
         * Aucun appelant n'en patit — `INPISyncButton`, `Legal.tsx` et
         * `syncAllClientsWithINPI` n'exploitent que `success` et `message`.
         * Le champ est conserve pour ne pas casser le contrat de retour.
         */
        data: data.companyData
      };
    }

    return {
      success: false,
      message: data.message || 'Aucune donnée reçue de l\'INPI'
    };
  } catch (error: any) {
    await logSyncHistory(clientId, 'error', null, error.message);
    return {
      success: false,
      message: 'Erreur inattendue lors de la synchronisation'
    };
  }
}

function normalizeINPIBirthDate(dateStr: string | null | undefined): string | null {
  if (!dateStr) return null;
  const trimmed = dateStr.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;
  if (/^\d{4}-\d{2}$/.test(trimmed)) return `${trimmed}-01`;
  if (/^\d{4}$/.test(trimmed)) return `${trimmed}-01-01`;
  return null;
}

/**
 * Combien de dirigeants traiter de front pendant une synchronisation.
 *
 * Chacun coute deux a trois allers-retours enchainés — chercher la personne,
 * eventuellement la creer, puis rapprocher son mandat. A une centaine de
 * millisecondes le trajet, un dirigeant revient a ~300 ms, et la boucle
 * sequentielle faisait grimper la synchronisation avec leur nombre.
 *
 * Mesure du 2026-08-02 sur un portefeuille de 588 clients actifs : 2,0 s pour un
 * client a UN seul dirigeant, dont 0,9 s pour l'appel a l'INPI lui-meme. Mais la
 * distribution a une longue traine — 466 clients sur 588 n'ont zero ou un
 * dirigeant, et une SCI familiale en comptait 52, tous distincts et legitimes,
 * soit une quinzaine de secondes rien qu'en aller-retours.
 *
 * Six est un compromis : la majorite des clients n'ont qu'un ou deux
 * dirigeants et n'y gagnent rien, tandis que le cas extreme passe sous les
 * trois secondes, sans pour autant lancer cinquante requetes simultanees a
 * PostgREST.
 */
const DIRIGEANTS_SIMULTANES = 6;

/**
 * Deux entrees qui partagent cette cle designent la meme personne, et doivent
 * donc rester traitees l'une apres l'autre : la premiere cree la fiche, la
 * seconde la retrouve. Les paralleliser en creerait deux.
 *
 * La date de naissance est volontairement absente de la cle alors que la
 * recherche s'en sert : deux homonymes dont un seul porte une date resolvent
 * potentiellement vers la meme fiche. Les regrouper est prudent — au pire on
 * sequentialise deux personnes distinctes, ce qui ne coute que du temps.
 */
function cleIdentite(officer: INPIOfficerData, index: number): string {
  const firstName = officer.firstName || '';
  const lastName = officer.lastName || officer.denomination || '';

  if (officer.personType === 'physique' && firstName && lastName) {
    return `physique|${firstName}|${lastName}`;
  }
  if (officer.personType === 'morale' && lastName) {
    return `morale|${lastName}`;
  }
  // Sans identite exploitable, aucune recherche n'est faite et la fiche est
  // toujours creee : ces entrees ne peuvent entrer en concurrence entre elles.
  return `sans-identite|${index}`;
}

async function syncOfficersToDatabase(clientId: string, officers: INPIOfficerData[]): Promise<{ synced: number; errors: number }> {
  let synced = 0;
  let errors = 0;

  const groupes = new Map<string, INPIOfficerData[]>();
  officers.forEach((officer, index) => {
    const firstName = officer.firstName || '';
    const lastName = officer.lastName || officer.denomination || '';
    if (!lastName && !firstName) return;

    const cle = cleIdentite(officer, index);
    const groupe = groupes.get(cle);
    if (groupe) groupe.push(officer);
    else groupes.set(cle, [officer]);
  });

  const listes = Array.from(groupes.values());
  let suivant = 0;

  async function traiterGroupe(): Promise<void> {
    while (suivant < listes.length) {
      const groupe = listes[suivant++];
      // Sequentiel a l'interieur d'un groupe : meme personne, donc meme fiche.
      for (const officer of groupe) {
        await traiterDirigeant(officer);
      }
    }
  }

  async function traiterDirigeant(officer: INPIOfficerData): Promise<void> {
    const firstName = officer.firstName || '';
    const lastName = officer.lastName || officer.denomination || '';

    const birthDate = normalizeINPIBirthDate(officer.birthDate);

    let existingOfficerId: string | null = null;

    if (officer.personType === 'physique' && firstName && lastName) {
      let query = supabase
        .from('company_officers')
        .select('id')
        .eq('first_name', firstName)
        .eq('last_name', lastName)
        .eq('person_type', 'physique');

      if (birthDate) {
        query = query.eq('birth_date', birthDate);
      }

      const { data: existing } = await query.order('created_at', { ascending: true }).limit(1);
      existingOfficerId = existing?.[0]?.id || null;
    } else if (officer.personType === 'morale' && lastName) {
      const { data: existing } = await supabase
        .from('company_officers')
        .select('id')
        .eq('last_name', lastName)
        .eq('person_type', 'morale')
        .order('created_at', { ascending: true })
        .limit(1);
      existingOfficerId = existing?.[0]?.id || null;
    }

    if (!existingOfficerId) {
      const officerId = crypto.randomUUID();

      const { error: insertErr } = await supabase
        .from('company_officers')
        .insert({
          id: officerId,
          first_name: firstName,
          last_name: lastName,
          person_type: officer.personType || 'physique',
          denomination: officer.denomination || null,
          birth_date: birthDate,
          nationality: officer.nationality || null,
          source: 'inpi',
        });

      if (insertErr) {
        errors++;
        return;
      }
      existingOfficerId = officerId;
    }

    const role = officer.role || 'Dirigeant';
    const startDate = officer.startDate || new Date().toISOString().split('T')[0];

    const { data: existingRels } = await supabase
      .from('officer_companies')
      .select('id, source')
      .eq('officer_id', existingOfficerId)
      .eq('client_id', clientId)
      .eq('role', role)
      .limit(1);
    const existingRel = existingRels?.[0] || null;

    if (existingRel) {
      if (existingRel.source === 'inpi') {
        await supabase
          .from('officer_companies')
          .update({
            start_date: startDate,
            is_active: officer.isActive !== false,
            updated_at: new Date().toISOString(),
          })
          .eq('id', existingRel.id);
      }
      synced++;
    } else {
      const { error: relErr } = await supabase
        .from('officer_companies')
        .insert({
          officer_id: existingOfficerId,
          client_id: clientId,
          role,
          start_date: startDate,
          is_active: officer.isActive !== false,
          source: 'inpi',
        });

      if (relErr) {
        errors++;
      } else {
        synced++;
      }
    }
  }

  const workers = Array(Math.min(DIRIGEANTS_SIMULTANES, listes.length))
    .fill(null)
    .map(() => traiterGroupe());

  await Promise.all(workers);

  return { synced, errors };
}

export async function searchCompanyByINPI(siret: string): Promise<{
  success: boolean;
  message: string;
  data?: INPICompanyData;
}> {
  try {
    const connecte = await sessionOuverte();

    if (!connecte) {
      return {
        success: false,
        message: 'Session invalide. Veuillez vous reconnecter.'
      };
    }

    const apiUrl = `/api/inpi-sync`;

    const response = await fetch(apiUrl, {
      method: 'POST',
      credentials: 'same-origin',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        action: 'search',
        siret
      })
    });

    const data = await response.json();

    if (!response.ok) {
      return {
        success: false,
        message: data.message || 'Erreur lors de la recherche'
      };
    }

    return {
      success: data.success,
      message: data.message,
      data: data.companyData
    };
  } catch {
    return {
      success: false,
      message: 'Erreur inattendue lors de la recherche'
    };
  }
}

export interface INPINameResolution {
  identifier: string;
  denomination: string | null;
  success: boolean;
}

export async function resolveCompanyNames(
  identifiers: Array<{ siret: string | null; siren: string | null }>,
  onProgress?: (current: number, total: number) => void
): Promise<Map<string, string>> {
  const results = new Map<string, string>();
  const MAX_CONCURRENT = 3;
  let currentIndex = 0;

  const connecte = await sessionOuverte();
  if (!connecte) return results;

  const apiUrl = `/api/inpi-sync`;

  async function resolveNext(): Promise<void> {
    while (true) {
      const index = currentIndex++;
      if (index >= identifiers.length) return;

      const { siret, siren } = identifiers[index];
      const identifier = siret || siren;
      if (!identifier) continue;

      try {
        const response = await fetch(apiUrl, {
          method: 'POST',
          credentials: 'same-origin',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ action: 'search', siret: identifier })
        });

        if (response.ok) {
          const data = await response.json();
          if (data.success && data.companyData?.denomination) {
            const key = siren || (siret ? siret.substring(0, 9) : '');
            if (key) results.set(key, data.companyData.denomination);
            if (siret) results.set(siret, data.companyData.denomination);
          }
        }
      } catch {
      }

      if (onProgress) {
        onProgress(index + 1, identifiers.length);
      }
    }
  }

  const workers = Array(Math.min(MAX_CONCURRENT, identifiers.length))
    .fill(null)
    .map(() => resolveNext());

  await Promise.all(workers);
  return results;
}

export async function getSyncHistory(clientId: string): Promise<INPISyncHistory[]> {
  try {
    const { data, error } = await supabase
      .from('inpi_sync_history')
      .select('*')
      .eq('client_id', clientId)
      .order('sync_date', { ascending: false })
      .limit(10);

    if (error) {
      return [];
    }

    return data || [];
  } catch {
    return [];
  }
}

async function logSyncHistory(
  clientId: string,
  status: 'success' | 'error' | 'partial',
  data: any,
  errorMessage: string | null
): Promise<void> {
  try {
    await supabase.from('inpi_sync_history').insert({
      client_id: clientId,
      status,
      data_received: data,
      error_message: errorMessage,
      sync_date: new Date().toISOString()
    });
  } catch {
  }
}

export async function fetchLegalActsForClient(clientId: string): Promise<LegalActsSyncResult> {
  try {
    const { data: client } = await supabase
      .from('clients')
      .select('siren, siret')
      .eq('id', clientId)
      .maybeSingle();

    if (!client || (!client.siren && !client.siret)) {
      return {
        success: false,
        message: 'Client non trouvé ou SIREN/SIRET manquant'
      };
    }

    const siren = client.siren || client.siret?.substring(0, 9);

    const connecte = await sessionOuverte();

    if (!connecte) {
      return {
        success: false,
        message: 'Session invalide. Veuillez vous reconnecter.'
      };
    }

    const apiUrl = `/api/inpi-sync`;

    const response = await fetch(apiUrl, {
      method: 'POST',
      credentials: 'same-origin',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        action: 'fetch-acts',
        clientId,
        siren
      })
    });

    const data = await response.json();

    if (!response.ok) {
      return {
        success: false,
        message: data.message || 'Erreur lors de la récupération des actes'
      };
    }

    return {
      success: data.success,
      message: data.message,
      actsCount: data.actsCount,
      acts: data.acts
    };
  } catch (error: any) {
    return {
      success: false,
      message: error?.message || 'Erreur inattendue lors de la récupération des actes'
    };
  }
}

export async function syncLegalActsToDatabase(clientId: string): Promise<{
  success: boolean;
  message: string;
  insertedCount?: number;
  /**
   * Le registre a répondu, et il ne porte aucune pièce pour ce SIREN.
   *
   * DISTINCT D'UN ÉCHEC, et il faut pouvoir les distinguer : l'appelant qui
   * masque son affichage quand il n'y a rien ferait autrement passer une panne
   * de l'INPI pour une société sans acte déposé. `success` reste `false` — il
   * signifie « des actes ont été enregistrés », et il n'y en a pas.
   */
  registreVide?: boolean;
}> {
  try {
    const result = await fetchLegalActsForClient(clientId);

    if (!result.success) {
      return { success: false, message: result.message || 'Erreur lors de la synchronisation' };
    }

    if (!result.acts || result.acts.length === 0) {
      /**
       * ⚠️ ON DATE MÊME UNE RECHERCHE INFRUCTUEUSE.
       *
       * `last_legal_sync` répond à « quand a-t-on interrogé le registre ? », pas
       * à « quand a-t-on trouvé quelque chose ? ». Sans cette écriture, une
       * société sans acte déposé n'en garde aucune trace, et tout appelant qui
       * consulte l'INPI « seulement si on ne sait rien » le réinterroge à chaque
       * fois, indéfiniment — pour redécouvrir chaque fois qu'il n'y a rien.
       */
      await supabase
        .from('clients')
        .update({ last_legal_sync: new Date().toISOString() })
        .eq('id', clientId);

      return {
        success: false,
        registreVide: true,
        message: 'Aucun acte depose au registre',
        insertedCount: 0,
      };
    }

    /**
     * ⚠️ `legal_acts.act_date` est NOT NULL, et `listerPieces` rend `null` quand
     * aucun des trois champs de date de l'INPI n'est renseigné.
     *
     * L'insertion se fait en UN SEUL LOT : une pièce sans date faisait échouer
     * les vingt autres. `last_legal_sync` restait alors vide, et tout appelant
     * qui n'interroge le registre que « si on ne sait rien » y retournait à
     * chaque fois — pour rééchouer à l'identique.
     *
     * La date de dépôt sert de repli avant d'écarter la pièce : au greffe, c'est
     * elle qui fait foi.
     */
    // `flatMap` plutot qu'un `filter` puis un `map` : c'est le meme test qui
    // ecarte la piece et qui prouve au compilateur que la date existe.
    const actsToInsert = result.acts.flatMap(act => {
      const acteDate = act.date || act.depositDate;
      if (!acteDate) return [];
      return [{
        client_id: clientId,
        act_type: act.type,
        act_category: act.category,
        act_date: acteDate,
        deposit_date: act.depositDate || null,
        inpi_reference: act.reference,
        document_url: act.documentUrl || null,
        download_status: 'pending' as const,
        metadata: { description: act.description }
      }];
    });

    if (actsToInsert.length === 0) {
      await supabase
        .from('clients')
        .update({ last_legal_sync: new Date().toISOString() })
        .eq('id', clientId);

      return {
        success: false,
        registreVide: true,
        message: 'Aucun acte datable au registre',
        insertedCount: 0,
      };
    }


    const { data, error } = await supabase
      .from('legal_acts')
      .upsert(actsToInsert, {
        onConflict: 'inpi_reference',
        ignoreDuplicates: false
      })
      .select();

    if (error) {
      return {
        success: false,
        message: 'Erreur lors de l\'enregistrement des actes'
      };
    }

    await supabase
      .from('clients')
      .update({ last_legal_sync: new Date().toISOString() })
      .eq('id', clientId);

    return {
      success: true,
      message: `${data?.length || 0} acte(s) synchronisé(s)`,
      insertedCount: data?.length || 0
    };
  } catch (error: any) {
    return {
      success: false,
      message: error?.message || 'Erreur inattendue lors de la synchronisation'
    };
  }
}

export async function getLegalActsForClient(clientId: string): Promise<LegalAct[]> {
  try {
    const { data, error } = await supabase
      .from('legal_acts')
      .select('*')
      .eq('client_id', clientId)
      .order('act_date', { ascending: false });

    if (error) {
      return [];
    }

    return data || [];
  } catch {
    return [];
  }
}

export async function getOfficersForClient(clientId: string): Promise<(OfficerCompany & { officer: CompanyOfficer })[]> {
  try {
    const { data, error } = await supabase
      .from('officer_companies')
      .select(`
        *,
        officer:company_officers(*)
      `)
      .eq('client_id', clientId)
      .order('start_date', { ascending: false });

    if (error) {
      return [];
    }

    return (data as any) || [];
  } catch {
    return [];
  }
}

export async function getClientsForOfficer(officerId: string): Promise<(OfficerCompany & { client: Client })[]> {
  try {
    const { data, error } = await supabase
      .from('officer_companies')
      .select(`
        *,
        client:clients(*)
      `)
      .eq('officer_id', officerId)
      .order('start_date', { ascending: false });

    if (error) {
      return [];
    }

    return (data as any) || [];
  } catch {
    return [];
  }
}

export async function downloadStatutsForClient(clientId: string, clientName: string): Promise<{
  success: boolean;
  message: string;
}> {
  try {
    const { data: client } = await supabase
      .from('clients')
      .select('siren, siret')
      .eq('id', clientId)
      .maybeSingle();

    if (!client || (!client.siren && !client.siret)) {
      return { success: false, message: 'SIREN/SIRET manquant pour ce client' };
    }

    const siren = client.siren || client.siret?.substring(0, 9);

    const connecte = await sessionOuverte();
    if (!connecte) {
      return { success: false, message: 'Session invalide. Veuillez vous reconnecter.' };
    }

    const apiUrl = `/api/inpi-sync`;

    const response = await fetch(apiUrl, {
      method: 'POST',
      credentials: 'same-origin',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ action: 'download-document', siren })
    });

    if (!response.ok) {
      const contentType = response.headers.get('Content-Type') || '';
      if (contentType.includes('application/json')) {
        const data = await response.json();
        return { success: false, message: data.message || 'Erreur lors du téléchargement' };
      }
      return { success: false, message: `Erreur lors du téléchargement (${response.status})` };
    }

    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const safeName = clientName.replace(/[^a-zA-Z0-9À-ÿ\s-]/g, '').replace(/\s+/g, '_');
    a.download = `Statuts_${safeName}.pdf`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    return { success: true, message: `Statuts téléchargés pour ${clientName}` };
  } catch (error: any) {
    return { success: false, message: error?.message || 'Erreur inattendue lors du téléchargement' };
  }
}

export interface INPIDocument {
  id: string;
  type: string;
  date: string | null;
  depositDate: string | null;
  reference: string;
  url: string | null;
  description: string;
}

export async function listLegalDocuments(clientId: string): Promise<{
  success: boolean;
  message: string;
  documents?: INPIDocument[];
}> {
  try {
    const { data: client } = await supabase
      .from('clients')
      .select('siren, siret')
      .eq('id', clientId)
      .maybeSingle();

    if (!client || (!client.siren && !client.siret)) {
      return { success: false, message: 'SIREN/SIRET manquant pour ce client' };
    }

    const siren = client.siren || client.siret?.substring(0, 9);

    const connecte = await sessionOuverte();
    if (!connecte) {
      return { success: false, message: 'Session invalide. Veuillez vous reconnecter.' };
    }

    const apiUrl = `/api/inpi-api`;

    const response = await fetch(apiUrl, {
      method: 'POST',
      credentials: 'same-origin',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ action: 'list-documents', siren })
    });

    const data = await response.json();

    if (!response.ok || !data?.success) {
      return {
        success: false,
        message: data?.message || 'Erreur lors de la récupération des documents'
      };
    }

    return {
      success: true,
      message: data.message,
      documents: data.documents
    };
  } catch (error: any) {
    return {
      success: false,
      message: error?.message || 'Erreur inattendue lors de la récupération des documents'
    };
  }
}

export async function downloadActDocument(clientId: string, clientName: string, actType: string, documentId?: string | null): Promise<{
  success: boolean;
  message: string;
}> {
  try {
    const { data: client } = await supabase
      .from('clients')
      .select('siren, siret')
      .eq('id', clientId)
      .maybeSingle();

    if (!client || (!client.siren && !client.siret)) {
      return { success: false, message: 'SIREN/SIRET manquant pour ce client' };
    }

    const siren = client.siren || client.siret?.substring(0, 9);

    if (!documentId) {
      return { success: false, message: 'ID de document manquant' };
    }

    if (!(await sessionOuverte())) {
      return { success: false, message: 'Session invalide. Veuillez vous reconnecter.' };
    }

    const apiUrl = `/api/inpi-api`;
    const body = JSON.stringify({
      action: 'download-document',
      siren,
      documentId
    });

    // Tout l'échafaudage de rafraîchissement qui entourait cet appel a disparu
    // avec le jeton : il n'y a plus rien à rafraîchir côté navigateur, et un 401
    // ne veut plus dire « jeton périmé, réessaie » mais « session close ».
    // Réessayer ne ferait que retarder le message.
    let response: Response;
    try {
      response = await fetch(apiUrl, {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body,
      });
    } catch (err: any) {
      return { success: false, message: err?.message || 'Erreur reseau lors du telechargement' };
    }

    if (response.status === 401) {
      return { success: false, message: 'Session expiree. Veuillez vous reconnecter.' };
    }

    if (!response.ok) {
      const contentType = response.headers.get('Content-Type') || '';
      if (contentType.includes('application/json')) {
        const data = await response.json();
        if (data.portalUrl && typeof data.portalUrl === 'string') {
          try {
            const url = new URL(data.portalUrl);
            if (url.hostname.endsWith('inpi.fr')) {
              window.open(data.portalUrl, '_blank', 'noopener');
              return { success: true, message: 'Redirection vers le portail INPI pour consulter le document.' };
            }
          } catch {
          }
        }
        return { success: false, message: data.message || 'Erreur lors du téléchargement' };
      }
      return { success: false, message: `Erreur lors du téléchargement (${response.status})` };
    }

    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const safeName = clientName.replace(/[^a-zA-Z0-9À-ÿ\s-]/g, '').replace(/\s+/g, '_');
    const safeType = actType.replace(/[^a-zA-Z0-9À-ÿ\s-]/g, '').replace(/\s+/g, '_');
    a.download = `${safeType}_${safeName}.pdf`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    return { success: true, message: `Document téléchargé pour ${clientName}` };
  } catch (error: any) {
    return { success: false, message: error?.message || 'Erreur inattendue lors du téléchargement' };
  }
}

/**
 * `sync_progress`, `phases_completed` et `error_details` sont des colonnes
 * `jsonb` : la base les type en `Json`, volontairement large. Les deux formes
 * derivent donc de la ligne, en ne redisant que ce que la base ne peut pas
 * savoir — la structure du JSON. Ecrites a la main, elles divergeaient aussi sur
 * la nullabilite, et aucune ligne lue ne leur correspondait.
 */
export type SyncSettings = Omit<
  Database['public']['Tables']['sync_settings']['Row'],
  'sync_progress'
> & {
  // Ce que SyncSettingsPanel lit reellement dans ce jsonb.
  sync_progress: {
    batch_offset?: number;
    total?: number;
    processed?: number;
    phases?: Record<string, string>;
  } | null;
};

export type LegalSyncLogEntry = Omit<
  Database['public']['Tables']['legal_sync_log']['Row'],
  'phases_completed' | 'error_details'
> & {
  phases_completed: Record<string, string> | null;
  error_details: Array<{ clientId: string; name: string; phase: string; error: string }> | null;
};

export async function getSyncSettings(syncType = 'inpi_officers'): Promise<SyncSettings | null> {
  const { data } = await supabase
    .from('sync_settings')
    .select('*')
    .eq('sync_type', syncType)
    .maybeSingle();
  return data as SyncSettings | null;
}

export async function upsertSyncSettings(settings: {
  frequency: string;
  batch_size?: number;
  sync_hour?: number;
  is_enabled: boolean;
}, syncType = 'inpi_officers'): Promise<boolean> {
  const payload: Record<string, any> = {
    sync_type: syncType,
    frequency: settings.frequency,
    is_enabled: settings.is_enabled,
    updated_at: new Date().toISOString(),
  };
  if (settings.batch_size !== undefined) payload.batch_size = settings.batch_size;
  if (settings.sync_hour !== undefined) payload.sync_hour = settings.sync_hour;

  const { error } = await supabase
    .from('sync_settings')
    .upsert(payload, { onConflict: 'sync_type' });

  return !error;
}

export async function getLegalSyncLogs(limit = 10): Promise<LegalSyncLogEntry[]> {
  const { data } = await supabase
    .from('legal_sync_log')
    .select('*')
    .order('started_at', { ascending: false })
    .limit(limit);
  return (data || []) as LegalSyncLogEntry[];
}

export async function triggerLegalFullSync(
  jobId?: string | null
): Promise<{ success: boolean; message: string }> {
  try {
    const apiUrl = `/api/legal-sync-all`;
    const response = await fetch(apiUrl, {
      method: 'POST',
      credentials: 'same-origin',
      // Plus de clé « anon » : elle appartenait à Supabase, elle n'est plus
      // dans le bundle, et `import.meta.env.VITE_SUPABASE_ANON_KEY` valait donc
      // littéralement `undefined` dans l'en-tête envoyé.
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jobId: jobId ?? null }),
    });
    const data = await response.json();
    return { success: data.success, message: data.message || data.error || '' };
  } catch {
    return { success: false, message: 'Erreur de connexion' };
  }
}

export async function schedulePeriodicSync(intervalDays: number = 30): Promise<boolean> {
  try {
    const connecte = await sessionOuverte();
    if (!connecte) return false;

    const apiUrl = `/api/inpi-sync`;

    const response = await fetch(apiUrl, {
      method: 'POST',
      credentials: 'same-origin',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ action: 'schedule', intervalDays })
    });

    const data = await response.json();
    return data.success;
  } catch {
    return false;
  }
}

export interface BulkSyncResult {
  successful: number;
  failed: number;
  details: Array<{
    clientId: string;
    clientName: string;
    success: boolean;
    message: string;
  }>;
}

export async function bulkSyncWithINPI(
  clients: Array<{ id: string; nom_entreprise: string }>,
  onProgress?: (current: number, total: number) => void
): Promise<BulkSyncResult> {
  const MAX_CONCURRENT = 3;
  let currentIndex = 0;

  // Store individual results to avoid race conditions
  const allDetails: Array<{
    clientId: string;
    clientName: string;
    success: boolean;
    message: string;
  }> = [];

  async function syncNext(): Promise<void> {
    while (true) {
      const index = currentIndex++;
      if (index >= clients.length) return;

      const client = clients[index];

      try {
        const syncResult = await syncClientWithINPI(client.id);

        allDetails.push({
          clientId: client.id,
          clientName: client.nom_entreprise,
          success: syncResult.success,
          message: syncResult.message
        });
      } catch (error: any) {
        allDetails.push({
          clientId: client.id,
          clientName: client.nom_entreprise,
          success: false,
          message: error?.message || 'Erreur inattendue'
        });
      }

      if (onProgress) {
        onProgress(index + 1, clients.length);
      }
    }
  }

  const workers = Array(Math.min(MAX_CONCURRENT, clients.length))
    .fill(null)
    .map(() => syncNext());

  await Promise.all(workers);

  // Aggregate results after all workers complete
  const successful = allDetails.filter(d => d.success).length;
  const failed = allDetails.filter(d => !d.success).length;

  return {
    successful,
    failed,
    details: allDetails
  };
}
