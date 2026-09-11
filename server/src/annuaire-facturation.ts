/**
 * L'annuaire de la facturation électronique — recherche d'une adresse.
 * ---------------------------------------------------------------------------
 * La réforme impose que chaque entreprise soit joignable à une adresse par
 * laquelle ses fournisseurs lui adressent leurs factures. Cette adresse est
 * publiée dans un annuaire ; ce module va l'y chercher à partir du SIREN, pour
 * que le cabinet n'ait pas à la recopier d'un courrier.
 *
 *   GET https://api.superpdp.tech/v1.beta/french_directory/entries?number={siren}
 *
 * Le point d'accès est OUVERT — le contrat OpenAPI de SUPER PDP porte
 * `"security": []` sur cette route, comme sur `french_directory/companies`, et
 * une réponse obtenue depuis un simple navigateur le 2026-09-11 le confirme en
 * pratique. Pas de clé, pas de compte : calqué sur `vies.ts` et `bodacc.ts`
 * pour cette raison, aucun identifiant à protéger ici.
 *
 * Cette réponse réelle est figée en fixture dans le test, et elle confirme le
 * contrat champ pour champ :
 *
 *   {"data":[{"company":{"address":"11 RUE AMPERE","city":"PONT-DE-L'ISERE",
 *     "country":"FR","formal_name":"SODIMAS","number":"303265045",
 *     "postcode":"26600"},"identifier":"0225:303265045","is_active":true}]}
 *
 * CE QUI SORT DU CABINET : un SIREN, qui est une donnée publique. Rien du
 * dossier, pas le nom du client tel que nous l'écrivons, aucun montant.
 *
 * ---------------------------------------------------------------------------
 * ⚠️ LA RÈGLE QUI TIENT TOUT LE MODULE : UNE LISTE VIDE N'EST PAS UNE PANNE,
 * ET UNE PANNE N'EST PAS UNE LISTE VIDE.
 *
 * En 2026 la réforme monte en charge : beaucoup d'entreprises parfaitement en
 * règle ne sont PAS encore inscrites. « Aucune adresse » est donc un résultat
 * NORMAL et fréquent, qui ne doit surtout pas se lire comme une faute de
 * saisie — c'est le piège que `vies.ts` documente déjà pour la franchise en
 * base de TVA, et il se rejoue ici à l'identique.
 *
 * Symétriquement, un service injoignable ne doit JAMAIS se présenter comme
 * « pas d'adresse » : le cabinet en conclurait que le client n'est pas inscrit
 * et saisirait une adresse à la main par-dessus celle qui existe. Défaut sûr :
 * `indisponible`.
 *
 * ---------------------------------------------------------------------------
 * ⚠️ PLUSIEURS ADRESSES ACTIVES, C'EST LE CAS À NE PAS ARBITRER TOUT SEUL.
 * Une entité peut publier plusieurs entrées — un établissement, un service, une
 * plateforme différente par activité. En choisir une au hasard ferait partir
 * les factures au mauvais endroit sans que personne ne le voie avant une
 * relance. Le module rend la liste ; l'écran fait choisir.
 *
 * TOUT LE RÉSEAU DANS UNE FONCTION, TOUT LE JUGEMENT DANS UNE AUTRE, comme
 * pour VIES : `interpreter()` est pure et c'est elle que les tests exercent.
 */

/**
 * L'adresse du service, en constante comme dans `bodacc.ts` et `inpi/client.ts`.
 *
 * ⚠️ LA VARIABLE D'ENVIRONNEMENT SE LIT ICI ET NON DANS `config.ts`, pour que
 * ce module n'importe RIEN : `config.ts` exige `DATABASE_URL` au chargement, et
 * un module qui l'importe devient intestable sans base — alors que tout ce
 * fichier est de la décision pure autour d'un `fetch`. C'est la raison pour
 * laquelle `vies.ts` n'importe pas `config` non plus.
 *
 * L'interrupteur `ANNUAIRE_FACTURATION_DISABLED`, lui, vit bien dans
 * `config.ts` : il est lu par la route, pas par ce module.
 */
const BASE = (process.env.ANNUAIRE_FACTURATION_URL || 'https://api.superpdp.tech').replace(
  /\/+$/,
  ''
);

/** L'annuaire répond vite ; au-delà, l'écran attend pour rien. */
const DELAI_MS = 15_000;

export type EtatAnnuaire =
  /** Une seule adresse active : la seule situation où l'on peut proposer un remplissage direct. */
  | 'une-adresse'
  /** Plusieurs adresses actives : le cabinet tranche, jamais nous. */
  | 'plusieurs'
  /** Des entrées existent mais aucune n'est active : y envoyer une facture échouerait. */
  | 'inactives'
  /** L'entité n'est pas dans l'annuaire. Résultat normal, pas une erreur. */
  | 'aucune'
  /** On n'a pas pu savoir. Ne jamais confondre avec `aucune`. */
  | 'indisponible';

export interface AdresseAnnuaire {
  /** Adresse Peppol, de forme `0225:{siren}` éventuellement suivie d'un code de routage. */
  identifiant: string;
  actif: boolean;
  /** Dénomination telle que l'annuaire la porte — sert à voir qu'on a la bonne entité. */
  nom: string | null;
  /** SIREN tel que l'annuaire le rend, qui peut différer de celui qu'on a demandé. */
  siren: string | null;
  ville: string | null;
}

export interface ResultatAnnuaire {
  etat: EtatAnnuaire;
  /** Les actives d'abord : l'écran affiche dans cet ordre et ne trie pas lui-même. */
  adresses: AdresseAnnuaire[];
  code: string;
  message: string;
}

const MESSAGES = {
  /**
   * Le libellé le plus important du module, pour la même raison que dans
   * `vies.ts` : le cas le plus fréquent est une entreprise en règle qui n'est
   * pas encore inscrite. Il ne doit pas donner à croire à une erreur de saisie.
   */
  aucune:
    "Cette entreprise n’a pas d’adresse publiée dans l’annuaire de la facturation " +
    "électronique. Ce n’est pas une anomalie : l’inscription se fait progressivement, " +
    'et beaucoup d’entreprises en règle n’y figurent pas encore.',
  inactives:
    "L’annuaire ne porte que des adresses désactivées pour cette entreprise. Une " +
    'facture envoyée à une adresse désactivée n’arriverait pas.',
  plusieurs:
    "Plusieurs adresses actives sont publiées pour cette entreprise. Choisissez celle " +
    'que le client vous a indiquée : nous ne pouvons pas deviner laquelle reçoit vos factures.',
  une: 'Une adresse active trouvée dans l’annuaire.',
  indisponible:
    "L’annuaire n’a pas pu être interrogé pour le moment. Aucune conclusion n’est tirée : " +
    'l’adresse déjà saisie, s’il y en a une, reste en place.',
  sirenAbsent:
    'Le SIREN de la fiche est vide : l’annuaire se cherche par SIREN, il n’y a rien à demander.',
  sirenFormat:
    'Le SIREN de la fiche ne fait pas neuf chiffres. L’annuaire ne peut pas être interrogé avec cette valeur.',
} as const;

/** Le SIREN, débarrassé de la ponctuation de saisie. */
export function normaliserSiren(valeur: string | null | undefined): string {
  return (valeur ?? '').replace(/[^0-9]/g, '');
}

/** Neuf chiffres, ni plus ni moins. Un SIRET (14) n'est pas accepté : la route attend un SIREN. */
export function sirenValide(siren: string): boolean {
  return /^\d{9}$/.test(siren);
}

function refus(code: string, message: string): ResultatAnnuaire {
  return { etat: 'indisponible', adresses: [], code, message };
}

/**
 * Traduit une réponse de l'annuaire en résultat exploitable.
 * FONCTION PURE — aucun réseau, aucune horloge.
 */
export function interpreter(httpStatus: number, corps: unknown): ResultatAnnuaire {
  if (httpStatus !== 200) return refus(`HTTP_${httpStatus}`, MESSAGES.indisponible);

  // ⚠️ On n'accepte QUE la forme documentée. Un corps inattendu — page d'erreur
  // HTML d'un intermédiaire, réponse tronquée, champ renommé — donnerait, si on
  // le laissait couler, un tableau vide, donc « pas d'adresse » : la conclusion
  // exactement inverse de la vérité.
  if (typeof corps !== 'object' || corps === null) return refus('REPONSE_INATTENDUE', MESSAGES.indisponible);
  const data = (corps as { data?: unknown }).data;
  if (!Array.isArray(data)) return refus('REPONSE_INATTENDUE', MESSAGES.indisponible);

  const adresses: AdresseAnnuaire[] = [];
  for (const brut of data) {
    if (typeof brut !== 'object' || brut === null) continue;
    const e = brut as { identifier?: unknown; is_active?: unknown; company?: unknown };
    const identifiant = typeof e.identifier === 'string' ? e.identifier.trim() : '';
    // Une entrée sans identifiant n'est pas une adresse : elle ne sert à rien
    // ici, et l'afficher ferait cliquer sur du vide.
    if (!identifiant) continue;
    const c = (typeof e.company === 'object' && e.company !== null ? e.company : {}) as {
      formal_name?: unknown;
      number?: unknown;
      city?: unknown;
    };
    const texte = (v: unknown): string | null => {
      const t = typeof v === 'string' ? v.trim() : '';
      return t === '' ? null : t;
    };
    adresses.push({
      identifiant,
      // Absence de `is_active` traitée comme INACTIF : proposer une adresse
      // dont on ignore l'état ferait envoyer une facture dans le vide.
      actif: e.is_active === true,
      nom: texte(c.formal_name),
      siren: texte(c.number),
      ville: texte(c.city),
    });
  }

  const actives = adresses.filter((a) => a.actif);
  const triees = [...actives, ...adresses.filter((a) => !a.actif)];

  if (actives.length === 1) return { etat: 'une-adresse', adresses: triees, code: 'OK', message: MESSAGES.une };
  if (actives.length > 1) return { etat: 'plusieurs', adresses: triees, code: 'OK', message: MESSAGES.plusieurs };
  if (adresses.length > 0) return { etat: 'inactives', adresses: triees, code: 'OK', message: MESSAGES.inactives };
  return { etat: 'aucune', adresses: [], code: 'OK', message: MESSAGES.aucune };
}

/**
 * Interroge l'annuaire pour un SIREN.
 *
 * `fetchImpl` est injectable pour les tests, sur le modèle du reste du serveur.
 */
export async function rechercher(
  sirenBrut: string,
  fetchImpl: typeof fetch = fetch
): Promise<ResultatAnnuaire> {
  const siren = normaliserSiren(sirenBrut);
  if (!siren) return refus('SIREN_ABSENT', MESSAGES.sirenAbsent);
  if (!sirenValide(siren)) return refus('SIREN_FORMAT', MESSAGES.sirenFormat);

  const url = `${BASE}/v1.beta/french_directory/entries?number=${siren}`;
  const minuteur = AbortSignal.timeout(DELAI_MS);

  try {
    const reponse = await fetchImpl(url, { signal: minuteur, headers: { accept: 'application/json' } });
    // Le corps est lu même sur un statut d'échec : `interpreter` n'en fera rien,
    // mais une lecture qui jette ici masquerait le vrai statut HTTP.
    const corps = await reponse.json().catch(() => null);
    return interpreter(reponse.status, corps);
  } catch (e) {
    const nom = e instanceof Error ? e.name : '';
    return refus(nom === 'TimeoutError' || nom === 'AbortError' ? 'DELAI' : 'RESEAU', MESSAGES.indisponible);
  }
}
