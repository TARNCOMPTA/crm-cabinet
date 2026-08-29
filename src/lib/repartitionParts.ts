/**
 * Répartition des parts : ce que la somme des lignes permet de dire — et
 * surtout ce qu'elle ne permet pas.
 * ---------------------------------------------------------------------------
 * `client_associes` porte ce que le cabinet a saisi. Ce module en tire l'état
 * de la répartition, et il n'a qu'un travail : EMPÊCHER QU'UNE SAISIE
 * INCOMPLÈTE PASSE POUR UNE RÉPARTITION COMPLÈTE.
 *
 * ⚠️ POURQUOI CE N'EST PAS UNE SIMPLE DIVISION. Le réflexe serait de calculer
 * chaque pourcentage sur la somme des parts saisies. Il tombe toujours juste —
 * et c'est exactement le défaut : une SCI de cinq associés dont deux seulement
 * sont saisis afficherait 60 % / 40 %, chiffres plausibles, faux, et que
 * personne ne va vérifier. Le dénominateur est donc le TOTAL DÉCLARÉ sur la
 * fiche (`clients.parts_totales`), jamais la somme ; l'écart entre les deux est
 * l'information la plus utile de ce module.
 *
 * La discipline est celle de `src/lib/statutsService.ts` : ne jamais confondre
 * « absent » et « on n'a pas pu savoir ». D'où cinq états et non deux, et un
 * `null` partout où le calcul n'est pas possible.
 *
 * Fonctions PURES : ni réseau, ni base, ni React. C'est ce qui les rend
 * testables, et c'est la raison de ce fichier.
 */

/** Une ligne de `client_associes`, réduite à ce qui compte pour le calcul. */
export interface LigneParts {
  nb_parts: number;
  /** `pleine-propriete`, `nue-propriete` ou `usufruit`. */
  demembrement: string;
}

/**
 * L'usufruit ne compte PAS dans le capital, et l'oublier fausse tout.
 *
 * ⚠️ LE CAPITAL SE PARTAGE ENTRE PROPRIÉTAIRES : pleine propriété et
 * nue-propriété, et rien d'autre. L'usufruit n'est pas une part du capital,
 * c'est un DROIT SUR des parts dont quelqu'un d'autre est nu-propriétaire —
 * les mêmes parts, comptées une seconde fois.
 *
 * Le cas est celui de toutes les SCI familiales apres donation : le pere donne
 * la nue-propriete de 250 parts a son fils et garde l'usufruit. Les sommer
 * donnerait 250 + 250 = 500 pour 250 parts reelles, et une repartition
 * parfaitement reguliere s'annoncerait « incoherente ». L'avertissement perdrait
 * tout credit exactement sur les dossiers ou il compte.
 *
 * L'usufruit reste affiche, et il doit l'etre : une attestation qui dit
 * « M. X detient 250 parts » sans preciser « en usufruit » est fausse. Il ne
 * participe simplement pas au total.
 */
export function compteDansLeCapital(ligne: LigneParts): boolean {
  return ligne.demembrement !== 'usufruit';
}

/**
 * `somme` est TOUJOURS la somme des seules lignes qui composent le capital —
 * l'usufruit en est exclu, voir `compteDansLeCapital`.
 */
export type EtatRepartition =
  /** Aucune ligne. ⚠️ « Pas saisie », et surtout pas « pas d'associés ». */
  | { etat: 'non-saisie' }
  /** Des lignes, mais la fiche ne dit pas le total : rien n'est calculable. */
  | { etat: 'total-inconnu'; somme: number }
  | { etat: 'incomplete'; somme: number; total: number; manquant: number }
  | { etat: 'complete'; somme: number; total: number }
  /** La somme dépasse le total déclaré : une des deux valeurs est fausse. */
  | { etat: 'incoherente'; somme: number; total: number; excedent: number };

/**
 * La tolérance de comparaison, en parts.
 *
 * `nb_parts` est un `numeric` PostgreSQL, rendu en JavaScript par un `number` :
 * une répartition en parts décimales — rare, mais les statuts en produisent —
 * traverserait le flottant et 999.9999999999999 ne vaudrait pas 1000. Un
 * millième de part est bien en deçà de toute saisie réelle et bien au-delà de
 * l'erreur d'arrondi accumulée sur quelques dizaines de lignes.
 */
const TOLERANCE = 1e-6;

/**
 * L'état d'une répartition.
 *
 * ⚠️ LA COMPARAISON PORTE SUR LES PARTS, JAMAIS SUR LES POURCENTAGES ARRONDIS.
 * Trois associés à un tiers chacun font 33,33 % + 33,33 % + 33,33 % = 99,99 % :
 * une répartition parfaitement juste s'annoncerait incomplète, et le cabinet
 * apprendrait à ignorer l'avertissement. Ce sont les parts qui se somment.
 */
export function etatRepartition(
  lignes: readonly LigneParts[],
  partsTotales: number | null | undefined
): EtatRepartition {
  if (lignes.length === 0) return { etat: 'non-saisie' };

  // Seules les lignes qui composent le capital : l'usufruit porte SUR des parts
  // deja comptees en nue-propriete, l'ajouter les compterait deux fois.
  const somme = lignes
    .filter(compteDansLeCapital)
    .reduce((acc, l) => acc + l.nb_parts, 0);

  // `0` est écarté au même titre que `null` : un total de zéro part ne veut rien
  // dire et ferait diviser par zéro. Il ne peut venir que d'une saisie erronée.
  if (partsTotales === null || partsTotales === undefined || !(partsTotales > 0)) {
    return { etat: 'total-inconnu', somme };
  }

  const ecart = somme - partsTotales;
  if (Math.abs(ecart) <= TOLERANCE) return { etat: 'complete', somme, total: partsTotales };
  if (ecart < 0) {
    return { etat: 'incomplete', somme, total: partsTotales, manquant: -ecart };
  }
  return { etat: 'incoherente', somme, total: partsTotales, excedent: ecart };
}

/**
 * Le pourcentage de détention, ou `null` quand il n'est pas calculable.
 *
 * `null` et non `0` : un associé dont on ne peut pas calculer la part n'en
 * détient pas zéro. Affiché, un « 0 % » se lirait comme un fait.
 */
export function pourcentage(nbParts: number, total: number | null | undefined): number | null {
  if (total === null || total === undefined || !(total > 0)) return null;
  if (!Number.isFinite(nbParts)) return null;
  return (nbParts / total) * 100;
}

/**
 * La valeur nominale d'une part : le capital divisé par le nombre de titres.
 *
 * Déduite et jamais stockée — une valeur rangée à côté de ses deux termes finit
 * toujours par les contredire. `null` dès qu'un des deux manque.
 */
export function valeurNominale(
  capitalSocial: number | null | undefined,
  partsTotales: number | null | undefined
): number | null {
  if (capitalSocial === null || capitalSocial === undefined) return null;
  if (partsTotales === null || partsTotales === undefined || !(partsTotales > 0)) return null;
  if (!Number.isFinite(capitalSocial)) return null;
  return capitalSocial / partsTotales;
}

/**
 * « parts » ou « actions », selon la forme juridique.
 *
 * Ce n'est pas de la cosmétique : une attestation qui parle de « parts
 * sociales » pour une SAS emploie un terme que le droit réserve aux sociétés de
 * personnes. Dans le doute — forme absente de la fiche — on dit « parts », le
 * terme générique du cabinet.
 *
 * ⚠️ CE BLOC VIVAIT DANS `ClientPartsTab`, ET C'EST POUR CA QU'IL N'AVAIT PAS DE
 * TEST. Il est descendu ici, au milieu du reste du calcul, le jour ou l'ecran a
 * affiche « Nombre total de actions » : un vocabulaire qui doit etre juste
 * jusque dans son elision merite d'etre verifie ailleurs qu'a l'oeil.
 */
export interface MotsParts {
  singulier: string;
  pluriel: string;
  /**
   * ⚠️ « de parts » MAIS « d'actions », ET L'ECRAN ECRIVAIT « de actions ».
   *
   * La forme elidée est portée ici plutôt que recomposée sur chaque libellé :
   * il y en a quatre, et le premier oublié se lit dans l'en-tête de la fiche
   * d'une SAS — « Nombre total de actions », en gras, au-dessus du capital.
   * Constaté à l'écran sur une SAS.
   */
  de: string;
}

export function motTitre(formeJuridique: string | null): MotsParts {
  const f = (formeJuridique || '').toUpperCase();
  const parActions = /\bSAS\b|\bSASU\b|\bSA\b|SOCIETE ANONYME|ACTIONS SIMPLIFIEE/.test(f);
  return parActions
    ? { singulier: 'action', pluriel: 'actions', de: "d'actions" }
    : { singulier: 'part', pluriel: 'parts', de: 'de parts' };
}
