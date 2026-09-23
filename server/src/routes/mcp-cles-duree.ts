/*
 * Sans dependance, pour etre teste sans `.env` : `config.ts` leve a l'import
 * quand il manque, et une regle qu'on ne peut pas tester n'est pas verifiee.
 */

/**
 * Les durées de validité proposées à la création et au renouvellement.
 *
 * ⚠️ UNE LISTE FERMÉE, ET PAS DE « JAMAIS ». Une clé statique n'expirait pas
 * (incrément 022) : réouvrir cette possibilité par un choix d'écran referait le
 * défaut à la demande. Douze mois au plus — une échéance qu'on voit venir, et
 * qu'on prolonge d'un geste depuis le même écran.
 */
export const DUREES_MOIS = [3, 6, 12] as const;

/** La durée demandée, 12 par défaut, ou `null` si elle n'est pas admise. */
export function dureeMois(brute: unknown): number | null {
  if (brute === undefined || brute === null) return 12;
  return (DUREES_MOIS as readonly unknown[]).includes(brute) ? (brute as number) : null;
}
