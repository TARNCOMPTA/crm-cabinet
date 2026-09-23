/**
 * Ce qu'un accès du connecteur MCP peut modifier quand on l'y autorise.
 * ---------------------------------------------------------------------------
 * ⚠️ L'ÉCRAN DU CONNECTEUR A DEUX FOIS SOUS-ESTIMÉ CE DROIT. Il disait « seule
 * la répartition des parts peut être écrite » alors que le connecteur écrivait
 * déjà l'adresse de facturation électronique, puis la fiche client entière.
 * L'en-tête du fichier le notait pourtant : une promesse périmée sur un écran
 * de sécurité vaut moins que pas de promesse du tout — c'est elle qui fait
 * cocher « autoriser l'écriture » à la légère. Constaté le 2026-09-23.
 *
 * Les phrases de l'écran dérivent donc de cette liste, et cette liste est tenue
 * avec les outils du serveur par `tests/portee-connecteur-jumelle.test.ts` : un
 * outil d'écriture ajouté côté serveur fait tomber le test tant qu'il n'est pas
 * nommé ici.
 */

export const ECRITURES_CONNECTEUR = [
  { outil: 'set_client_fiche', libelle: 'la fiche client' },
  { outil: 'set_client_repartition', libelle: 'la répartition des parts' },
  { outil: 'set_client_facturation_electronique', libelle: 'l’adresse de facturation électronique' },
] as const;

/** « la fiche client, la répartition des parts et l’adresse … » */
export const PORTEE_ECRITURE = (() => {
  const l = ECRITURES_CONNECTEUR.map((e) => e.libelle);
  return l.length < 2 ? l.join('') : `${l.slice(0, -1).join(', ')} et ${l[l.length - 1]}`;
})();
