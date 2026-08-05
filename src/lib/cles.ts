/**
 * Clés de contrôle des identifiants d'entreprise.
 * ---------------------------------------------------------------------------
 * SIREN et SIRET portent une clé de Luhn : le dernier chiffre est calculé pour
 * que la somme pondérée du nombre entier soit un multiple de dix. Une faute de
 * frappe isolée, ou deux chiffres consécutifs échangés, la cassent — c'est tout
 * ce qu'on lui demande.
 *
 * POURQUOI CE MODULE EXISTE. `incompleteFieldsConfig.ts` portait DEUX corps
 * identiques au contrôle de longueur près, et aucun test. Ce n'est pas seulement
 * de la duplication : c'est le module que `src/lib/tva.ts` doit réutiliser pour
 * la clé du numéro intracommunautaire, et l'importer depuis
 * `incompleteFieldsConfig` créerait un cycle — celui-ci importe déjà les types
 * de la fiche client.
 *
 * ⚠️ UNE CLÉ INVALIDE N'EST PAS FORCÉMENT UNE FAUTE DE SAISIE. Voir le piège de
 * La Poste plus bas : c'est la raison pour laquelle `validateField` rend un
 * `warning` et non un `invalid` sur un SIRET, et personne ne doit « corriger »
 * cela sans lire ce commentaire.
 */

const CHIFFRES_SEULS = /^\d+$/;

/**
 * Clé de Luhn sur une chaîne de chiffres de longueur imposée.
 *
 * La longueur fait partie du contrôle : un SIREN à 8 chiffres dont la clé
 * « passe » par hasard n'est pas un SIREN.
 */
export function cleLuhn(chiffres: string, longueur: number): boolean {
  if (!CHIFFRES_SEULS.test(chiffres) || chiffres.length !== longueur) return false;

  let somme = 0;
  for (let i = 0; i < chiffres.length; i++) {
    let d = Number(chiffres[chiffres.length - 1 - i]);
    // Un chiffre sur deux en partant de la droite est doublé, et ramené à un
    // seul chiffre si le doublement dépasse 9 (18 → 1+8 = 9, soit −9).
    if (i % 2 === 1) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    somme += d;
  }
  return somme % 10 === 0;
}

/** SIREN : neuf chiffres. */
export function luhnLikeSirenChecksum(siren: string): boolean {
  return cleLuhn(siren, 9);
}

/**
 * SIRET : quatorze chiffres.
 *
 * ⚠️ LE PIÈGE DE LA POSTE, à ne jamais « corriger ».
 *
 * Les établissements de La Poste (SIREN 356 000 000) échappent à la règle : leur
 * clé se vérifie par la divisibilité par 5 de la somme des chiffres, pas par
 * Luhn. `35600000009075` est un SIRET parfaitement valide qui échoue ici.
 *
 * D'où le niveau `warning` et non `invalid` dans `validateField` : la clé ne
 * confirme pas, ce qui n'est pas la même chose qu'infirmer. Un cabinet qui a La
 * Poste parmi ses clients ne doit pas se voir refuser une saisie correcte.
 *
 * La règle alternative n'est pas implémentée à dessein : elle ne concerne qu'un
 * SIREN au monde, et un `warning` suffit à dire ce qu'il y a à dire.
 */
export function luhnLikeSiretChecksum(siret: string): boolean {
  return cleLuhn(siret, 14);
}
