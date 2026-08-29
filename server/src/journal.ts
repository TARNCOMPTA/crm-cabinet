/**
 * Ce qu'on écrit dans les journaux, et ce qu'on n'y écrit pas.
 * ---------------------------------------------------------------------------
 * ⚠️ LES JOURNAUX DE L'APPLICATION CONTENAIENT LES DONNÉES DES CLIENTS DU
 * CABINET. Fastify journalise chaque requête avec son URL COMPLÈTE, et le front
 * parle à PostgREST par l'URL : filtres, tris et sélections y sont écrits en
 * clair. Une recherche de client produisait donc, dans le journal du
 * conteneur :
 *
 *     /rest/v1/clients?email=eq.jean.dupont%40exemple.fr&select=*
 *     /rest/v1/company_officers?last_name=eq.DUPONT&first_name=eq.Jean
 *     /api/storage/pieces/2026/bilan-DUPONT-2025.pdf?signature=...
 *
 * — c'est-à-dire des noms, des adresses, le lien entre une personne et un
 * dossier comptable, et jusqu'à la signature d'une URL de téléchargement, qui
 * est un secret d'accès. Le tout dans un fichier que le pilote `json-file` de
 * Docker conservait sans limite de taille ni de durée.
 *
 * ⚠️ ON GARDE LES NOMS DE PARAMÈTRES, ON JETTE LEURS VALEURS. Supprimer la
 * requête entière rendrait les journaux inutilisables pour diagnostiquer —
 * c'est par eux qu'on a trouvé les 400 sur les `DELETE` de PostgREST le
 * 2026-08-01. Savoir QUELS filtres ont été employés suffit à comprendre la
 * requête ; leurs valeurs n'y ajoutent rien qu'un risque.
 *
 * La politique est celle que le `Caddyfile` applique déjà à son propre journal
 * d'accès, où les adresses IP et les en-têtes sont supprimés. Elle est reprise
 * ici parce qu'un journal sur deux ne protège rien.
 */

/** Ce qui remplace un segment de chemin porteur de données. */
const MASQUE = '(masque)';

/**
 * Chemins dont la FIN est une donnée, et non une route.
 *
 * `/api/storage/:bucket/*` : la partie `*` est le chemin du fichier déposé, et
 * un nom de fichier comptable porte presque toujours celui du client.
 */
const PREFIXES_A_MASQUER = ['/api/storage/'];

/**
 * L'URL telle qu'on accepte de la conserver : le chemin, les NOMS des
 * paramètres, rien de leurs valeurs.
 *
 * Rend l'entrée inchangée si elle ne ressemble à rien d'analysable — un journal
 * n'est pas l'endroit où lever une exception.
 */
export function cheminJournalisable(url: string): string {
  if (typeof url !== 'string' || url === '') return url;

  const coupe = url.indexOf('?');
  const chemin = coupe === -1 ? url : url.slice(0, coupe);
  const requete = coupe === -1 ? '' : url.slice(coupe + 1);

  let cheminPropre = chemin;
  for (const prefixe of PREFIXES_A_MASQUER) {
    if (!chemin.startsWith(prefixe)) continue;
    // Le premier segment après le préfixe est conservé — c'est le bucket, une
    // valeur fermée (`pieces`, `avatars`) qui ne désigne personne. Ce qui suit
    // est masqué d'un bloc.
    const reste = chemin.slice(prefixe.length);
    const barre = reste.indexOf('/');
    cheminPropre =
      barre === -1 ? chemin : `${prefixe}${reste.slice(0, barre)}/${MASQUE}`;
    break;
  }

  if (requete === '') return cheminPropre;

  // Les noms seuls, dans l'ordre, doublons compris : `&a=1&a=2` devient `?a&a`,
  // ce qui reste fidèle à la requête reçue.
  const noms = requete
    .split('&')
    .filter((p) => p !== '')
    .map((p) => p.split('=')[0]);

  return noms.length === 0 ? cheminPropre : `${cheminPropre}?${noms.join('&')}`;
}

/**
 * Le sérialiseur de requêtes de pino.
 *
 * ⚠️ L'ADRESSE IP N'Y EST PAS, et c'est un choix, pas un oubli. Le `Caddyfile`
 * supprime déjà `remote_ip` et `client_ip` de son journal d'accès, avec ce
 * motif : « Les adresses IP sont des données personnelles : on ne les conserve
 * pas dans les journaux d'accès d'un outil interne, où elles n'apportent
 * rien. » Les garder ici viderait cette décision de son sens — un cabinet de
 * huit personnes derrière une seule adresse publique n'apprend rien d'une IP.
 * La contrepartie est réelle : une tentative d'énumération ne laisse plus de
 * trace d'origine. Elle laisse toujours son URL, son code de réponse et son
 * horodatage.
 */
export function serialiserRequete(requete: {
  method?: string;
  url?: string;
  raw?: { method?: string; url?: string };
}): { method: string; url: string } {
  return {
    method: requete.method ?? requete.raw?.method ?? '?',
    url: cheminJournalisable(requete.url ?? requete.raw?.url ?? ''),
  };
}
