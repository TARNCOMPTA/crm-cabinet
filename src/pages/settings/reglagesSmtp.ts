/**
 * Ce qu'il faut avoir rempli pour activer l'envoi.
 * ---------------------------------------------------------------------------
 * ⚠️ LA LISTE DÉPEND DU MODE D'AUTHENTIFICATION, et c'est pour cela qu'elle
 * sort du composant. Le contrôle était une seule condition écrite en ligne :
 *
 *     !host || !user || !password || !from
 *
 * Avec deux modes, cette condition devient fausse dans les deux sens — elle
 * exigerait un mot de passe d'une configuration OAuth qui n'en a pas, et
 * laisserait activer une configuration OAuth sans locataire ni secret. Dans le
 * second cas, l'envoi échouerait à la première tâche, la nuit, avec un message
 * d'Azure que personne ne lirait avant des semaines. C'est exactement le défaut
 * qui a coûté vingt-quatre jours de silence à un cabinet.
 *
 * Sortie d'ici, la règle se lit et se prouve.
 */

export interface SaisieSmtp {
  smtp_host: string;
  smtp_user: string;
  smtp_password: string;
  smtp_from_email: string;
  auth_mode: 'motdepasse' | 'oauth2';
  oauth_tenant_id: string;
  oauth_client_id: string;
  oauth_client_secret: string;
}

/** Les libellés des champs manquants, dans l'ordre de l'écran. Vide = tout est là. */
export function champsManquants(f: SaisieSmtp): string[] {
  const manque: string[] = [];

  if (!f.smtp_host.trim()) manque.push('Serveur SMTP');
  // L'identifiant sert dans les DEUX modes : en OAuth, c'est la boîte au nom de
  // laquelle l'application envoie, et Exchange refuse sans lui.
  if (!f.smtp_user.trim()) manque.push('Identifiant SMTP');
  if (!f.smtp_from_email.trim()) manque.push("Adresse d'expédition");

  if (f.auth_mode === 'oauth2') {
    if (!f.oauth_tenant_id.trim()) manque.push('Identifiant de locataire (tenant)');
    if (!f.oauth_client_id.trim()) manque.push("Identifiant d'application (client)");
    if (!f.oauth_client_secret.trim()) manque.push("Secret d'application");
  } else if (!f.smtp_password) {
    // Pas de `.trim()` : un mot de passe peut légitimement commencer ou finir
    // par une espace, et le rogner ici ferait échouer une authentification que
    // l'utilisateur croirait bonne.
    manque.push('Mot de passe SMTP');
  }

  return manque;
}
