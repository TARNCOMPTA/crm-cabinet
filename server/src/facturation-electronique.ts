/**
 * L'adresse de facturation électronique, côté serveur.
 * ---------------------------------------------------------------------------
 * ⚠️ CE FICHIER EST LA JUMELLE DE `src/lib/facturationElectronique.ts`, ET IL
 * FAUT SAVOIR POURQUOI AVANT DE VOULOIR LE SUPPRIMER.
 *
 * Le serveur ne peut pas importer du front : son `tsconfig.json` pose
 * `rootDir: "src"` et n'inclut que `src/**` — une frontière délibérée, qui
 * empêche du code de navigateur de se retrouver dans le processus qui parle à
 * la base. La normalisation doit pourtant être LA MÊME des deux côtés : l'écran
 * et le connecteur MCP écrivent dans la même colonne, et deux règles
 * donneraient deux valeurs différentes pour la même saisie selon la porte
 * d'entrée — « 303 265 045 00069 » par le connecteur, « 30326504500069 » par
 * l'écran, et une recherche qui ne retrouve plus rien.
 *
 * Les deux sont donc tenues ensemble par `tests/facturation-jumelles.test.ts`,
 * qui les éprouve sur la même table de cas et tombe dès qu'elles divergent.
 * C'est le motif déjà employé pour la liste des outils MCP.
 *
 * SEULE LA NORMALISATION EST JUMELÉE. Le contrôle consultatif — celui qui
 * signale un SIRET étranger à la fiche — reste côté écran : il sert à afficher
 * un message à un humain, et le dupliquer élargirait la surface à maintenir
 * sans rien apporter au connecteur.
 */

/**
 * L'adresse, débarrassée de ce qui n'en fait pas partie.
 *
 * Les espaces disparaissent SEULEMENT quand ce qui reste est entièrement
 * numérique : « 123 456 789 00012 » est un SIRET recopié depuis un courrier.
 * Ailleurs — identifiant de plateforme, adresse avec code de routage — une
 * espace peut être signifiante, et la retirer changerait la valeur.
 */
export function normaliserAdresseFacturation(valeur: string | null | undefined): string {
  const brut = (valeur ?? '').trim();
  if (!brut) return '';
  const sansEspaces = brut.replace(/\s+/g, '');
  return /^\d+$/.test(sansEspaces) ? sansEspaces : brut;
}
