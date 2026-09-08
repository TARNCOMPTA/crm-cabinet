/**
 * Le jeton d'accès Microsoft, pour authentifier SMTP sans mot de passe.
 * ---------------------------------------------------------------------------
 * Microsoft 365 coupe l'authentification par mot de passe sur SMTP
 * (« authentification de base ») : désactivée par défaut depuis 2023, retirée
 * progressivement. Un cabinet l'a découvert le 2026-09-08, après vingt-quatre
 * jours sans qu'un seul courriel parte :
 *
 *     535 5.7.139 Authentication unsuccessful, the user credentials were incorrect
 *
 * OAuth 2.0 est la voie qui reste. Ce module obtient le jeton ; `mail.ts` le
 * présente à SMTP par le mécanisme XOAUTH2.
 *
 * ⚠️ FLUX « CLIENT CREDENTIALS », ET NON LE FLUX DÉLÉGUÉ. Le flux délégué exige
 * qu'une personne ouvre un navigateur et consente, puis rend un jeton de
 * rafraîchissement qui expire — donc une panne différée, un dimanche, sans
 * personne pour la voir. Un serveur qui envoie des courriels la nuit ne peut
 * pas dépendre d'un geste humain périodique. L'application s'authentifie donc
 * seule, et rien n'expire qu'elle ne sache renouveler.
 *
 * ⚠️ LES PARTIES PURES SONT SÉPARÉES DE L'APPEL RÉSEAU, et c'est délibéré : le
 * mandataire de l'environnement de développement refuse `login.microsoftonline.com`,
 * donc l'appel lui-même n'est pas éprouvable ici. Ce qui est éprouvable —
 * l'URL, le corps de la demande, la lecture de la réponse, la péremption — l'est
 * entièrement, et c'est là que se logent les erreurs.
 */

/**
 * La ressource demandée. `.default` signifie « toutes les permissions
 * d'application déjà consenties à cette application », ce qui est la forme
 * imposée par le flux client_credentials — on ne peut pas y demander une portée
 * à la carte.
 */
export const PORTEE_SMTP = 'https://outlook.office365.com/.default';

/** Le point de terminaison de jeton du locataire. */
export function urlJeton(tenantId: string): string {
  return `https://login.microsoftonline.com/${encodeURIComponent(tenantId)}/oauth2/v2.0/token`;
}

/** Le corps de la demande, au format que le point de terminaison attend. */
export function corpsDemandeJeton(clientId: string, clientSecret: string): URLSearchParams {
  return new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    scope: PORTEE_SMTP,
    grant_type: 'client_credentials',
  });
}

export interface JetonSmtp {
  valeur: string;
  /** Instant de péremption, en millisecondes epoch. */
  expireLe: number;
}

/**
 * Marge de sécurité avant la péremption.
 *
 * Un jeton qui expire pendant l'envoi d'un lot fait échouer les courriels
 * restants. Soixante secondes couvrent largement un lot, et coûtent une
 * demande de jeton de plus par heure — le jeton Microsoft vit une heure.
 */
export const MARGE_PEREMPTION_MS = 60_000;

/** Vrai quand il faut redemander un jeton. `null` compte comme périmé. */
export function estPerime(jeton: JetonSmtp | null, maintenant: number): boolean {
  if (!jeton) return true;
  return maintenant >= jeton.expireLe - MARGE_PEREMPTION_MS;
}

/**
 * Lecture de la réponse du point de terminaison.
 *
 * ⚠️ ELLE LÈVE AVEC LE MESSAGE DE MICROSOFT, ET NON UN MESSAGE À NOUS. Azure
 * rend des diagnostics précis — `AADSTS7000215` pour un secret invalide,
 * `AADSTS700016` pour une application inconnue du locataire — et c'est ce que
 * l'administrateur doit lire dans l'écran des réglages. Les remplacer par
 * « échec de l'authentification » ferait perdre la seule information utile.
 */
export function analyserReponseJeton(charge: unknown, maintenant: number): JetonSmtp {
  if (typeof charge !== 'object' || charge === null) {
    throw new Error('Reponse inattendue du service de jetons Microsoft.');
  }
  const c = charge as Record<string, unknown>;

  if (typeof c.error === 'string') {
    const detail = typeof c.error_description === 'string' ? c.error_description : c.error;
    throw new Error(`Microsoft refuse la demande de jeton : ${detail}`);
  }

  const valeur = c.access_token;
  if (typeof valeur !== 'string' || valeur === '') {
    throw new Error('Le service de jetons Microsoft n a pas rendu de jeton.');
  }

  // `expires_in` est en SECONDES. Une instance qui le prendrait pour des
  // millisecondes redemanderait un jeton à chaque envoi — coûteux et bruyant —
  // et l'inverse ferait présenter un jeton mort pendant cinquante-neuf minutes.
  const duree = typeof c.expires_in === 'number' ? c.expires_in : 3600;
  return { valeur, expireLe: maintenant + duree * 1000 };
}

/** Ce qu'il faut pour demander un jeton. */
export interface IdentitéAzure {
  tenantId: string;
  clientId: string;
  clientSecret: string;
}

/**
 * Le jeton en cours, gardé en mémoire.
 *
 * Microsoft limite le nombre de demandes de jeton, et un jeton vit une heure :
 * en redemander un par courriel serait à la fois lent et malpoli. Le cache est
 * indexé par identité — changer d'application dans les réglages doit invalider
 * le jeton précédent, sinon l'ancien continuerait de servir jusqu'à sa
 * péremption.
 */
let cache: { cle: string; jeton: JetonSmtp } | null = null;

function cleCache(a: IdentitéAzure): string {
  return [a.tenantId, a.clientId, a.clientSecret].join('|');
}

/** Oublie le jeton courant. Appelé à l'arrêt et par les tests. */
export function oublierJeton(): void {
  cache = null;
}

/**
 * Obtient un jeton valide, du cache ou de Microsoft.
 *
 * ⚠️ NON ÉPROUVÉ CONTRE MICROSOFT depuis cet environnement : le mandataire y
 * refuse `login.microsoftonline.com`. Tout ce qui pouvait l'être l'a été dans
 * les fonctions pures ci-dessus ; ce qui reste ici est l'appel lui-même, sa
 * limite de temps et le cache.
 */
export async function obtenirJeton(
  identite: IdentitéAzure,
  maintenant: number = Date.now()
): Promise<JetonSmtp> {
  const cle = cleCache(identite);
  if (cache && cache.cle === cle && !estPerime(cache.jeton, maintenant)) return cache.jeton;

  if (!identite.tenantId || !identite.clientId || !identite.clientSecret) {
    throw new Error(
      "Authentification moderne incomplete : renseignez le locataire, l'identifiant d'application et le secret dans Parametres → Emails."
    );
  }

  // Une limite de temps explicite : sans elle, un point de terminaison muet
  // bloquerait l'ordonnanceur, qui n'a qu'une minute entre deux battements.
  const arret = AbortSignal.timeout(15_000);
  let reponse: Response;
  try {
    reponse = await fetch(urlJeton(identite.tenantId), {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: corpsDemandeJeton(identite.clientId, identite.clientSecret),
      signal: arret,
    });
  } catch (e) {
    const m = e instanceof Error ? e.message : String(e);
    throw new Error(`Service de jetons Microsoft injoignable : ${m}`);
  }

  // On lit le corps MÊME sur un code d'erreur : c'est là qu'Azure met son
  // diagnostic (`AADSTS…`), et le code HTTP seul ne dit que « refusé ».
  const charge = await reponse.json().catch(() => null);
  const jeton = analyserReponseJeton(charge, maintenant);
  cache = { cle, jeton };
  return jeton;
}
