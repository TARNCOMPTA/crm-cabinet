/**
 * Filtrer sur une liste d'identifiants sans faire exploser l'URL.
 * ---------------------------------------------------------------------------
 * PostgREST recoit ses filtres dans la chaine de requete. Un `.in('client_id',
 * [...])` sur les clients du cabinet produit donc une URL qui grandit avec eux :
 * 649 identifiants font **23 114 caracteres**, et Node refuse au-dela de 16 Ko.
 * La reponse est un HTTP 431, « Request Header Fields Too Large », que le front
 * affiche tel quel — « Exceeded maximum allowed HTTP header size ».
 *
 * Le defaut est insidieux parce qu'il depend du VOLUME : l'ecran fonctionne chez
 * un cabinet de cent clients et casse chez un cabinet de six cents. Il n'a
 * jamais pu se voir pendant la refonte, ou la base de developpement etait vide.
 *
 * Cent identifiants par lot font moins de 4 Ko, soit un quart du plafond le plus
 * bas. Les lots partent ensemble : ils ne dependent pas les uns des autres.
 *
 * ⚠️ Le tri global est perdu. Chaque lot est trie, mais leur concatenation ne
 * l'est pas. Quand l'appelant regroupe par client — le cas le plus frequent —
 * cela ne change rien, toutes les lignes d'un client etant dans le meme lot.
 * Quand il attend une liste triee, il doit retrier apres coup.
 */

/** Cent identifiants ≈ 3,9 Ko d'URL. Le plafond le plus bas rencontre est 16 Ko. */
export const TAILLE_LOT = 100;

export async function parLots<T>(
  ids: string[],
  requete: (lot: string[]) => PromiseLike<{ data: T[] | null; error: unknown }>
): Promise<T[]> {
  if (ids.length === 0) return [];

  const lots: string[][] = [];
  for (let i = 0; i < ids.length; i += TAILLE_LOT) {
    lots.push(ids.slice(i, i + TAILLE_LOT));
  }

  const reponses = await Promise.all(lots.map((lot) => requete(lot)));

  const tout: T[] = [];
  for (const { data, error } of reponses) {
    if (error) throw error;
    if (data?.length) tout.push(...data);
  }
  return tout;
}
