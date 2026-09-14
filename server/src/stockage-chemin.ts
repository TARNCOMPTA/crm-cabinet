/**
 * La seule règle qui dit où un fichier a le droit d'être.
 * ---------------------------------------------------------------------------
 * Cette résolution vivait dans `routes/storage.ts`, où elle ne gardait qu'une
 * porte : celle des requêtes HTTP. Elle en garde maintenant deux, et la seconde
 * est la vraie raison de ce module.
 *
 * ⚠️ UNE PIÈCE JOINTE DE COURRIEL EST UN CHEMIN LU EN BASE, PAS UNE SAISIE HTTP.
 * `email_queue.pieces_jointes` est du `jsonb` : une ligne de la file dit à
 * l'ouvrier d'envoi quel fichier attacher. Si quoi que ce soit y écrivait un
 * jour `../../../etc/passwd` — une route future mal gardée, un correctif à la
 * main en SQL, une restauration de sauvegarde bancale — l'ouvrier joindrait ce
 * fichier au courriel et l'expédierait à trois cents clients. La validation au
 * dépôt ne protège pas de ça : elle a eu lieu des jours plus tôt, sur une autre
 * valeur. Le chemin est donc REVALIDÉ au moment de lire le fichier, par cette
 * fonction-ci, dans les deux appelants.
 *
 * ⚠️ ON NE FILTRE PAS « .. », ON RÉSOUT. Interdire la chaîne « .. » se contourne
 * par les encodages (`%2e%2e`, `..%2f`, séparateurs mêlés) et laisse passer un
 * chemin absolu, qui n'en contient pas. Résoudre le chemin absolu puis vérifier
 * qu'il reste sous la racine ne dépend d'aucune de ces subtilités : c'est le
 * système de fichiers lui-même qui répond.
 */

import { resolve, sep } from 'node:path';

/**
 * Les buckets connus. Un bucket inconnu est refusé, jamais créé à la volée :
 * une faute de frappe dans un appel créerait sinon un répertoire orphelin que
 * personne ne purge.
 */
export const BUCKETS = new Set([
  'cabinet-logos',
  'task-attachments',
  'opportunity-attachments',
  'checklist-item-attachments',
  'bilan-checklist-attachments',
  'revenue-declaration-attachments',
  'tax-exemption-docs',
  // Les pièces jointes des campagnes. Elles survivent à la purge de
  // `email_queue` : l'historique d'une campagne doit pouvoir répondre « qu'est-ce
  // que je leur ai envoyé, au juste ? » bien après que la file a été vidée.
  'campagne-attachments',
]);

/**
 * Chemin absolu d'un fichier dans un bucket, ou `null` si la demande sort des
 * limites.
 *
 * ⚠️ `null` SIGNIFIE « REFUSÉ », PAS « ABSENT ». La fonction ne touche pas au
 * disque et ne dit rien de l'existence du fichier — seulement que le chemin
 * demandé est, ou n'est pas, dans le périmètre autorisé. Confondre les deux
 * ferait traiter une tentative de traversée comme un simple fichier manquant.
 */
export function cheminSur(racine: string, bucket: string, chemin: string): string | null {
  if (!BUCKETS.has(bucket)) return null;

  // Un octet nul tronque le nom côté appel système : « sain.pdf\0../../etc » se
  // résout ici en entier, puis serait ouvert jusqu'au nul seulement. Node le
  // refuse aujourd'hui, mais la garde ne coûte rien et ne dépend pas de lui.
  if (chemin.includes('\0') || bucket.includes('\0')) return null;

  const base = resolve(racine, bucket);
  const absolu = resolve(base, chemin);

  // Le séparateur final est ce qui empêche un bucket « photos » d'ouvrir la
  // porte de « photos-prives » : sans lui, le préfixe correspondrait.
  if (absolu !== base && !absolu.startsWith(base + sep)) return null;

  // La racine elle-même n'est pas un fichier. La rendre laisserait un appelant
  // tenter d'ouvrir un répertoire, ce qui échoue plus loin et plus obscurément.
  if (absolu === base) return null;

  return absolu;
}
