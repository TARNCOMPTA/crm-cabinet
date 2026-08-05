/**
 * Dates de l'INPI.
 * ---------------------------------------------------------------------------
 * Porté depuis `src/lib/inpiService.ts` : c'était l'une des trois choses que le
 * front savait faire et que le serveur ignorait, et c'est ce qui obligeait à
 * une seconde écriture depuis le navigateur après celle du serveur.
 */

/**
 * « JJMM » → « AAAA-MM-JJ », l'année étant l'année courante.
 *
 * L'INPI publie la date de clôture d'exercice sous la forme « 3112 » : un jour
 * et un mois, sans année — c'est une date ANNIVERSAIRE, pas un évènement. Le
 * produit la stocke pourtant dans une colonne `date`, d'où cette conversion.
 *
 * ⚠️ L'ANNÉE COURANTE EST UNE CONVENTION, pas une information. `date_cloture`
 * ne doit se lire que par son jour et son mois — `formatFiscalClosingMonth` de
 * la fiche client ne regarde d'ailleurs que les deux caractères du mois.
 *
 * Le contrôle de validité écarte les impossibles : « 3002 » (30 février) rend
 * `null` plutôt qu'une date décalée au 2 mars, ce que ferait `new Date` seul.
 */
export function convertirJJMMEnDate(jjmm: string | null | undefined): string | null {
  if (!jjmm || jjmm.length !== 4) return null;

  const jour = jjmm.substring(0, 2);
  const mois = jjmm.substring(2, 4);
  const annee = new Date().getFullYear();
  const chaine = `${annee}-${mois}-${jour}`;

  const analysee = new Date(chaine);
  if (Number.isNaN(analysee.getTime())) return null;

  // `new Date('2026-02-30')` ne lève pas : elle glisse au 2 mars. On confronte
  // donc le résultat à l'entrée pour refuser les dates qui n'existent pas.
  if (analysee.toISOString().slice(0, 10) !== chaine) return null;

  return chaine;
}
