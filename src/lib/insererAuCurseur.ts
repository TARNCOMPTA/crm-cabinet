/**
 * Insère un texte à l'endroit du curseur — ou à la place de la sélection.
 * ---------------------------------------------------------------------------
 * Les boutons de variables d'une campagne AJOUTAIENT le marqueur en fin de
 * corps, quel que soit l'endroit où l'on écrivait. Pour « Bonjour {{prenom}}, »
 * en tête de message, il fallait donc cliquer, puis couper, puis coller — et le
 * sujet n'en recevait jamais.
 *
 * Pure et sans DOM, pour être testée sans navigateur : l'appelant lit
 * `selectionStart` / `selectionEnd` et replace le curseur à la position rendue.
 *
 * ⚠️ DES BORNES HORS DU TEXTE SONT RAMENÉES DANS LE TEXTE. Un champ qui n'a
 * jamais eu le focus peut rendre `null`, et un texte raccourci entre deux
 * rendus peut laisser une position au-delà de sa longueur. Dans les deux cas,
 * on insère en fin plutôt que de lever ou de perdre la saisie.
 */
export function insererAuCurseur(
  texte: string,
  debut: number | null | undefined,
  fin: number | null | undefined,
  insertion: string
): { texte: string; curseur: number } {
  const borne = (n: number | null | undefined) =>
    typeof n === 'number' && Number.isFinite(n) ? Math.min(Math.max(n, 0), texte.length) : texte.length;
  let a = borne(debut);
  let b = borne(fin);
  if (b < a) [a, b] = [b, a];
  return {
    texte: texte.slice(0, a) + insertion + texte.slice(b),
    curseur: a + insertion.length,
  };
}
