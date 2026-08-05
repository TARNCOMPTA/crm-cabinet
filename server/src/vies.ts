/**
 * VIES — vérification d'un numéro de TVA intracommunautaire.
 * ---------------------------------------------------------------------------
 * Service de la Commission européenne, ouvert : pas de clé, pas de compte, pas
 * d'en-tête d'authentification. Calqué sur `bodacc.ts` pour cette raison —
 * constantes en tête, `fetch` nu, aucun identifiant à protéger.
 *
 *   GET https://ec.europa.eu/taxation_customs/vies/rest-api/ms/{CC}/vat/{NUMERO}
 *
 * Le numéro s'envoie SANS son préfixe pays : `FR40303265045` devient
 * `ms/FR/vat/40303265045`.
 *
 * ---------------------------------------------------------------------------
 * ⚠️ CE QUI REND CE MODULE DÉLICAT : `isValid: false` NE VEUT PAS DIRE « FAUX ».
 *
 * VIES répond HTTP 200 même quand il n'a rien vérifié. Le champ `isValid` passe
 * alors à `false`, et une implémentation naïve écrit « numéro invalide » sur un
 * numéro parfaitement bon. Observé pour de vrai le 2026-08-03 : le numéro de
 * SA SODIMAS, vérifié valide, a répondu `isValid: false` au rappel deux minutes
 * plus tard avec `userError: 'MS_MAX_CONCURRENT_REQ'`. La charge est en fixture
 * dans `vies.test.ts`.
 *
 * `userError` est donc le seul discriminant, et voici ce qu'il vaut réellement —
 * cinq appels réels du 2026-08-03 :
 *
 *   VALID                  isValid=true   nom et adresse renseignés
 *   INVALID                isValid=false  numéro bien formé mais non immatriculé
 *                                         (nom et adresse vides), OU malformé
 *                                         (nom et adresse à « --- »)
 *   INVALID_INPUT          isValid=false  notre appel est fautif (pays inconnu)
 *   MS_MAX_CONCURRENT_REQ  isValid=false  service saturé : IL N'A RIEN VÉRIFIÉ
 *
 * D'où la règle : le verdict n'est fiable que si `userError` vaut `VALID` ou
 * `INVALID`. Tout le reste est un aveu d'ignorance, y compris — et surtout — les
 * codes que nous ne connaissons pas. Défaut sûr : `indisponible`.
 *
 * ---------------------------------------------------------------------------
 * LE PIÈGE MÉTIER, qui n'est pas technique.
 *
 * Une entreprise française RÉELLE et EN ACTIVITÉ mais non immatriculée aux
 * opérations intracommunautaires répond `isValid: false, userError: 'INVALID'`.
 * Le numéro est syntaxiquement juste, la clé est bonne, l'entreprise existe — et
 * VIES dit « non ». Une microentreprise en franchise en base de TVA est dans ce
 * cas PAR CONSTRUCTION.
 *
 * Les messages ne doivent donc JAMAIS suggérer une faute de frappe. Ils sont
 * définis ici, côté serveur, pour qu'il n'en existe qu'une version.
 *
 * ---------------------------------------------------------------------------
 * TOUT LE RÉSEAU DANS UNE FONCTION, TOUT LE JUGEMENT DANS UNE AUTRE. C'est ce
 * qui rend `interpreter()` testable sur des charges réelles sans toucher au
 * réseau — et c'est la seule logique du produit où une erreur se traduirait par
 * « votre client a mal saisi son numéro » alors que VIES est en panne.
 */

const BASE = 'https://ec.europa.eu/taxation_customs/vies/rest-api';
/** VIES est lent : d'une à plusieurs secondes en temps normal. */
const DELAI_MS = 20_000;

export type StatutTva = 'non_verifie' | 'valide' | 'invalide' | 'indisponible';

export interface Verdict {
  statut: StatutTva;
  /** `userError` de VIES, ou un code à nous pour les échecs de transport. */
  code: string;
  nom: string | null;
  adresse: string | null;
  message: string;
}

interface ReponseVies {
  isValid?: boolean;
  userError?: string;
  name?: string;
  address?: string;
  vatNumber?: string;
}

/** Deux lettres de pays, puis 2 à 13 caractères alphanumériques. */
const FORMAT = /^([A-Z]{2})([0-9A-Z]{2,13})$/;

const MESSAGES = {
  valide: 'Numero valide et actif au registre des operations intracommunautaires.',
  /**
   * Le libellé le plus important du module. Il ne dit pas « invalide » tout
   * court, parce que le cas le plus fréquent est une entreprise en règle qui
   * n'a jamais demandé son numéro intracommunautaire.
   */
  invalide:
    "Ce numero n'est pas actif au registre des operations intracommunautaires. " +
    "Cela ne veut pas dire qu'il est mal saisi : une entreprise en franchise en " +
    "base de TVA, ou qui n'a jamais demande son numero intracommunautaire, " +
    'repond « non » avec un numero pourtant correct.',
  format: 'Format attendu : deux lettres de pays puis 2 a 13 caracteres, par exemple FR40303265045.',
  appel:
    "VIES a refuse la requete : le code pays n'est pas celui d'un Etat membre. " +
    'Rien ne peut etre conclu du numero.',
  indisponible:
    "VIES n'a pas pu verifier ce numero pour le moment. Le statut precedent est " +
    "conserve : aucune conclusion n'est tiree du numero lui-meme.",
} as const;

/** Nettoie un numéro saisi : majuscules, ni espaces ni ponctuation. */
export function normaliser(numero: string): string {
  return (numero || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
}

/**
 * Traduit une réponse de VIES en verdict. FONCTION PURE — aucun réseau, aucune
 * horloge : c'est elle que les tests exercent sur les charges réelles.
 */
export function interpreter(httpStatus: number, corps: unknown): Verdict {
  if (httpStatus !== 200) {
    return {
      statut: 'indisponible',
      code: `HTTP_${httpStatus}`,
      nom: null,
      adresse: null,
      message: MESSAGES.indisponible,
    };
  }

  const r = (corps ?? {}) as ReponseVies;
  const code = (r.userError ?? '').toUpperCase();

  // Le nom et l'adresse ne valent que sur un verdict positif. VIES rend « --- »
  // sur une entrée malformée et une chaîne vide sur un numéro non immatriculé :
  // ni l'un ni l'autre n'est une information sur l'entreprise.
  const propre = (v: string | undefined): string | null => {
    const t = (v ?? '').trim();
    return t === '' || t === '---' ? null : t;
  };

  if (code === 'VALID' && r.isValid === true) {
    return {
      statut: 'valide',
      code,
      nom: propre(r.name),
      adresse: propre(r.address),
      message: MESSAGES.valide,
    };
  }

  if (code === 'INVALID') {
    return { statut: 'invalide', code, nom: null, adresse: null, message: MESSAGES.invalide };
  }

  if (code === 'INVALID_INPUT') {
    // Notre appel est fautif, pas le numéro. On ne conclut donc rien sur lui —
    // mais on le distingue d'une panne, parce que réessayer n'y changera rien.
    return { statut: 'invalide', code, nom: null, adresse: null, message: MESSAGES.appel };
  }

  /**
   * TOUT LE RESTE EST UN AVEU D'IGNORANCE, y compris `VALID` accompagné d'un
   * `isValid` faux — incohérence dont on ne sait rien conclure — et surtout les
   * codes inconnus. La famille est large et bouge : saturation
   * (`*MAX_CONCURRENT_REQ*`), panne (`MS_UNAVAILABLE`, `SERVICE_UNAVAILABLE`,
   * `TIMEOUT`, `IO_ERROR`, `TECHNICAL_ERROR`), blocage (`VAT_BLOCKED`,
   * `IP_BLOCKED`). Les énumérer serait s'engager à suivre leurs évolutions ;
   * le défaut sûr ne demande rien de tel.
   */
  return {
    statut: 'indisponible',
    code: code || 'REPONSE_INATTENDUE',
    nom: null,
    adresse: null,
    message: MESSAGES.indisponible,
  };
}

/**
 * Interroge VIES.
 *
 * `fetchImpl` est injectable pour les tests, sur le modèle du reste du serveur.
 *
 * PAS DE NOUVELLE TENTATIVE, et c'est une divergence assumée avec `bodacc.ts`
 * qui réessaie après cinq secondes. Ici l'appel est déclenché par un clic et
 * l'utilisateur attend ; or `MS_MAX_CONCURRENT_REQ` signifie que le service est
 * saturé — réessayer aggrave la saturation. Un « indisponible » rendu tout de
 * suite, avec un bouton « Réessayer », est plus honnête que quarante secondes
 * d'attente.
 */
export async function verifier(
  numero: string,
  fetchImpl: typeof fetch = fetch
): Promise<Verdict> {
  const propre = normaliser(numero);
  const m = FORMAT.exec(propre);

  // Format invalide : AUCUN appel réseau. Inutile de déranger VIES pour lui
  // faire dire ce qu'une expression régulière sait déjà.
  if (!m) {
    return {
      statut: 'invalide',
      code: 'FORMAT',
      nom: null,
      adresse: null,
      message: MESSAGES.format,
    };
  }

  const [, pays, reste] = m;
  const controleur = new AbortController();
  const minuteur = setTimeout(() => controleur.abort(), DELAI_MS);

  try {
    const rep = await fetchImpl(`${BASE}/ms/${pays}/vat/${reste}`, {
      headers: { Accept: 'application/json' },
      signal: controleur.signal,
    });

    if (rep.status !== 200) return interpreter(rep.status, null);
    return interpreter(200, await rep.json());
  } catch (e) {
    const abandon = e instanceof Error && e.name === 'AbortError';
    return {
      statut: 'indisponible',
      code: abandon ? 'DELAI' : 'RESEAU',
      nom: null,
      adresse: null,
      message: MESSAGES.indisponible,
    };
  } finally {
    clearTimeout(minuteur);
  }
}

export interface EtatVies {
  disponible: boolean;
  /** Disponibilité annoncée pour la France, si elle figure dans la réponse. */
  france: string | null;
}

/**
 * État annoncé du service. Sert à griser le bouton plutôt qu'à proposer une
 * action dont on sait qu'elle échouera.
 *
 * Une panne de CE contrôle ne doit pas empêcher de tenter la vérification : on
 * rend « disponible » par défaut, l'appel réel tranchera.
 */
export async function etatService(fetchImpl: typeof fetch = fetch): Promise<EtatVies> {
  const controleur = new AbortController();
  const minuteur = setTimeout(() => controleur.abort(), 8_000);
  try {
    const rep = await fetchImpl(`${BASE}/check-status`, {
      headers: { Accept: 'application/json' },
      signal: controleur.signal,
    });
    if (rep.status !== 200) return { disponible: true, france: null };

    const corps = (await rep.json()) as {
      vow?: { available?: boolean };
      countries?: { countryCode?: string; availability?: string }[];
    };
    const fr = corps.countries?.find((c) => c.countryCode === 'FR');
    return {
      disponible: corps.vow?.available !== false,
      france: fr?.availability ?? null,
    };
  } catch {
    return { disponible: true, france: null };
  } finally {
    clearTimeout(minuteur);
  }
}
