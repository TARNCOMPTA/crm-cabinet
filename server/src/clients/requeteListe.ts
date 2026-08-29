/**
 * La liste des clients, filtrée et triée PAR LA BASE.
 * ---------------------------------------------------------------------------
 * L'écran chargeait tout le portefeuille puis filtrait, triait et paginait en
 * JavaScript. Mesuré sur 403 dossiers : 538 Ko de JSON à chaque ouverture pour
 * n'en afficher que cinquante lignes — et le coût grandit linéairement. Une
 * page de cinquante tient dans 45 Ko.
 *
 * Ce module ne fait que CONSTRUIRE la requête. Il n'ouvre aucune connexion, ce
 * qui le rend exerçable sans base — même partage que `jedeclare/etat.ts` à côté
 * de `suivi.ts`. C'est délibéré : porter un filtrage en SQL, c'est réécrire des
 * règles qui marchaient, et la seule façon de ne pas les trahir est de pouvoir
 * les comparer une à une.
 *
 * ⚠️ LES RÈGLES REPRODUITES ICI VIENNENT DE `useClientFilters.ts`, ET LEURS
 * SUBTILITÉS COMPTENT :
 *
 *   — LES VALEURS VIDES SE TRIENT TOUJOURS EN DERNIER, dans les deux sens. Le
 *     tri JavaScript le fait explicitement (`if (!aVal) return 1`), avant même
 *     de regarder le sens demandé. D'où `NULLS LAST` partout, et le `NULLIF`
 *     qui range la chaîne vide avec le nul.
 *
 *   — LE TRI PAR COLLABORATEURS EST UN COMPTAGE, pas une colonne.
 *
 *   — LE FILTRE PAR COLLABORATEURS EXIGE TOUS CEUX DEMANDÉS (`.every` côté
 *     écran), là où un `IN` en donnerait n'importe lequel.
 *
 *   — LE FILTRE DE CLÔTURE PORTE SUR LE MOIS SEUL, toutes années confondues.
 */

/** Les colonnes sur lesquelles l'écran sait trier. Rien d'autre n'est accepté. */
export const CHAMPS_TRI = [
  'nom_entreprise',
  'dirigeant',
  'numero_dossier',
  'siren',
  'siret',
  'ville',
  'regime_fiscal',
  'date_cloture',
  'collaborators',
] as const;

export type ChampTri = (typeof CHAMPS_TRI)[number];

export const estChampTri = (v: unknown): v is ChampTri =>
  typeof v === 'string' && (CHAMPS_TRI as readonly string[]).includes(v);

export interface FiltresListe {
  recherche: string;
  /** `all` ou une valeur de `clients.statut`. */
  statut: string;
  /** `all` ou une valeur de `clients.regime_fiscal`. */
  regime: string;
  /** `all` ou un mois sur deux chiffres, `01` à `12`. */
  cloture: string;
  /** Le client doit porter TOUS ces collaborateurs. */
  collaborateurs: string[];
  /** Faux : les dossiers archivés sont écartés. */
  archives: boolean;
  /** Vrai : seuls les dossiers dont `utilisateurId` est collaborateur. */
  mesDossiers: boolean;
  utilisateurId: string | null;
  tri: ChampTri;
  sens: 'asc' | 'desc';
  limite: number;
  decalage: number;
}

export interface RequeteListe {
  /** Vide, ou `WHERE ...`. */
  where: string;
  /** `ORDER BY ...`, tiebreakers compris. */
  ordre: string;
  valeurs: unknown[];
}

/**
 * Neutralise les jokers de `LIKE` dans un terme saisi.
 *
 * ⚠️ SANS CELA, TAPER « % » REMONTE TOUT LE PORTEFEUILLE et « _ » remplace
 * n'importe quel caractère. Côté écran la recherche est un `includes` : ces
 * caractères y sont littéraux, et ils doivent le rester ici.
 */
export const echapperLike = (terme: string): string => terme.replace(/[\\%_]/g, '\\$&');

/** Les colonnes que la recherche balaie, dans l'ordre de `useClientFilters`. */
const COLONNES_RECHERCHE = [
  'nom_entreprise',
  'siret',
  'numero_dossier',
  'contact_principal',
  'dirigeant',
  'ville',
] as const;

/** Le comptage des collaborateurs d'un client, employé au tri comme au filtre. */
const NB_COLLABORATEURS =
  '(SELECT count(*) FROM client_collaborators cc WHERE cc.client_id = c.id)';

/**
 * Construit le `WHERE` et le `ORDER BY` de la liste.
 *
 * `collation` vaut le nom d'une collation ICU, ou `null`. Elle n'est PAS
 * supposée présente : l'appelant la détecte dans la base et passe `null` si
 * elle manque — voir l'en-tête de la route. Sans elle, PostgreSQL trie par
 * octets et rangerait « avoine » après « Zèbre », là où l'écran, qui emploie
 * `localeCompare('fr')`, le range en tête.
 */
export function construireRequeteListe(
  f: FiltresListe,
  collation: string | null
): RequeteListe {
  const valeurs: unknown[] = [];
  const conditions: string[] = [];
  const parametre = (v: unknown): string => {
    valeurs.push(v);
    return `$${valeurs.length}`;
  };

  const terme = f.recherche.trim();
  if (terme) {
    const p = parametre(`%${echapperLike(terme)}%`);
    conditions.push(
      `(${COLONNES_RECHERCHE.map((col) => `c.${col} ILIKE ${p}`).join(' OR ')})`
    );
  }

  if (f.statut !== 'all') conditions.push(`c.statut = ${parametre(f.statut)}`);
  if (f.regime !== 'all') conditions.push(`c.regime_fiscal = ${parametre(f.regime)}`);

  // `IS DISTINCT FROM` et non `<>` : un statut nul doit rester visible, comme
  // le fait `client.statut !== 'archive'` côté écran.
  if (!f.archives) conditions.push(`c.statut IS DISTINCT FROM 'archive'`);

  if (f.cloture !== 'all') {
    conditions.push(`to_char(c.date_cloture, 'MM') = ${parametre(f.cloture)}`);
  }

  if (f.mesDossiers && f.utilisateurId) {
    conditions.push(
      `EXISTS (SELECT 1 FROM client_collaborators cc
                WHERE cc.client_id = c.id AND cc.user_id = ${parametre(f.utilisateurId)})`
    );
  }

  if (f.collaborateurs.length > 0) {
    // TOUS les collaborateurs demandés, pas n'importe lequel : on compte les
    // distincts rencontrés et on exige le compte complet.
    const liste = parametre(f.collaborateurs);
    const attendu = parametre(f.collaborateurs.length);
    conditions.push(
      `(SELECT count(DISTINCT cc.user_id) FROM client_collaborators cc
         WHERE cc.client_id = c.id AND cc.user_id = ANY(${liste}::uuid[])) = ${attendu}`
    );
  }

  const sens = f.sens === 'desc' ? 'DESC' : 'ASC';
  const col = (() => {
    if (f.tri === 'collaborators') return `${NB_COLLABORATEURS} ${sens}`;
    if (f.tri === 'date_cloture') return `c.date_cloture ${sens} NULLS LAST`;
    const avecCollation = collation ? ` COLLATE "${collation}"` : '';
    return `NULLIF(c.${f.tri}, '')${avecCollation} ${sens} NULLS LAST`;
  })();

  /**
   * ⚠️ LES DÉPARTAGES NE SONT PAS DÉCORATIFS : SANS EUX LA PAGINATION MENT.
   * Deux clients de même nom se rangent dans un ordre que PostgreSQL ne
   * garantit pas d'une requête à l'autre — le même dossier peut alors paraître
   * sur deux pages, et un autre sur aucune. `id` clôt le départage, puisqu'il
   * est unique.
   */
  const ordre = `ORDER BY ${col}, c.created_at DESC, c.id`;

  return {
    where: conditions.length ? `WHERE ${conditions.join(' AND ')}` : '',
    ordre,
    valeurs,
  };
}
