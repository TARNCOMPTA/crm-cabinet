/**
 * Échappement HTML — une seule implémentation, pour tout le serveur.
 * ---------------------------------------------------------------------------
 * Cette fonction vivait dans `mcp/oauth-regles.ts`, où elle protégeait l'écran de
 * consentement. Les campagnes en ont le même besoin, sur des données encore plus
 * exposées : le nom d'un client, saisi à la main, part dans un courriel.
 *
 * La dupliquer aurait été la faute la plus banale du genre — deux copies d'une
 * fonction de sécurité divergent, et c'est toujours la copie oubliée qui sert.
 *
 * Aucune dépendance : ce fichier doit rester importable par du code testé sans
 * `.env` ni base.
 */

/**
 * L'esperluette D'ABORD.
 *
 * Dans l'autre ordre, les entités produites par les remplacements suivants
 * seraient elles-mêmes réécrites : `<` deviendrait `&lt;` puis `&amp;lt;`, et le
 * lecteur verrait le code au lieu du texte.
 */
export function echapperHtml(v: string): string {
  return v
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
