/**
 * Client de l'API du Registre National des Entreprises (INPI).
 * ---------------------------------------------------------------------------
 * Mutualise ce que `inpi-api` et `inpi-sync` faisaient chacune de leur côté :
 * authentification SSO, mise en cache du jeton, et un point d'entrée unique
 * pour les appels.
 *
 * Le cache de jeton mérite une explication. Dans les Edge Functions il vivait
 * dans une variable de module — donc il disparaissait à chaque hibernation du
 * runtime, ce qui multipliait les authentifications. Ici le processus est
 * persistant : un jeton obtenu à 9 h sert toute la journée. L'INPI limite les
 * connexions, et une synchronisation de 200 clients qui se réauthentifierait à
 * chaque client se ferait refuser.
 *
 * Les identifiants viennent du `.env` de l'instance. Ils n'atteignent jamais le
 * navigateur : c'est tout l'intérêt d'avoir un serveur plutôt que des appels
 * directs depuis le front.
 */

import { config } from '../config.js';

const BASE = 'https://registre-national-entreprises.inpi.fr';

/**
 * Durée de validité retenue pour le jeton.
 *
 * L'INPI ne documente pas d'expiration explicite et ne renvoie pas de `expires_in`.
 * Douze heures reprend la valeur qu'utilisaient les Edge Functions ; en cas
 * d'erreur 401, `appeler()` réauthentifie de toute façon.
 */
const VALIDITE_HEURES = 12;

let jeton: string | null = null;
let jetonExpireLe: number = 0;
/**
 * Authentification en cours, s'il y en a une.
 *
 * Sans cette promesse partagée, une synchronisation qui lance dix appels en
 * parallèle sur un cache vide déclencherait dix authentifications simultanées —
 * exactement ce que l'INPI compte comme abus.
 */
let authEnCours: Promise<string | null> | null = null;

export class ErreurInpi extends Error {
  constructor(
    message: string,
    readonly status: number
  ) {
    super(message);
    this.name = 'ErreurInpi';
  }
}

async function authentifier(): Promise<string | null> {
  if (!config.inpi.configure) return null;

  const rep = await fetch(`${BASE}/api/sso/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      username: config.inpi.username,
      password: config.inpi.password,
    }),
  });

  if (!rep.ok) {
    throw new ErreurInpi(
      `Identifiants INPI refuses (${rep.status}). Verifie INPI_USERNAME et INPI_PASSWORD.`,
      rep.status
    );
  }

  const data = (await rep.json()) as { token?: string };
  if (!data.token) {
    throw new ErreurInpi("Reponse INPI sans jeton d'acces.", 502);
  }

  jeton = data.token;
  jetonExpireLe = Date.now() + VALIDITE_HEURES * 3600_000;
  return jeton;
}

async function obtenirJeton(forcer = false): Promise<string | null> {
  if (forcer) {
    jeton = null;
    jetonExpireLe = 0;
  }
  if (jeton && Date.now() < jetonExpireLe) return jeton;

  authEnCours ??= authentifier().finally(() => {
    authEnCours = null;
  });
  return authEnCours;
}

export interface OptionsAppel {
  /** Millisecondes avant abandon. L'INPI est parfois très lent sur les actes. */
  delaiMs?: number;
  /** Réponse binaire attendue (téléchargement de PDF). */
  binaire?: boolean;
}

/**
 * Appelle une route de l'API INPI, jeton compris.
 *
 * Le 401 est traité ici, une fois pour toutes : le jeton est réémis et l'appel
 * rejoué. Les Edge Functions dupliquaient cette logique à chaque appelant, avec
 * des variantes — c'est de là que venait la plomberie de retry côté front.
 */
export async function appeler<T = unknown>(
  chemin: string,
  options: OptionsAppel = {}
): Promise<T> {
  const { delaiMs = 30_000, binaire = false } = options;

  const executer = async (jetonUtilise: string): Promise<Response> => {
    const controleur = new AbortController();
    const minuteur = setTimeout(() => controleur.abort(), delaiMs);
    try {
      return await fetch(`${BASE}${chemin}`, {
        headers: {
          Authorization: `Bearer ${jetonUtilise}`,
          Accept: binaire ? 'application/pdf, application/octet-stream' : 'application/json',
        },
        signal: controleur.signal,
      });
    } finally {
      clearTimeout(minuteur);
    }
  };

  let j = await obtenirJeton();
  if (!j) {
    throw new ErreurInpi(
      "INPI non configure : renseigne INPI_USERNAME et INPI_PASSWORD dans le .env de l'instance.",
      503
    );
  }

  let rep: Response;
  try {
    rep = await executer(j);
  } catch (e) {
    if (e instanceof Error && e.name === 'AbortError') {
      throw new ErreurInpi(`L'INPI n'a pas repondu en ${delaiMs / 1000} s.`, 504);
    }
    throw new ErreurInpi(e instanceof Error ? e.message : 'INPI injoignable.', 502);
  }

  // Jeton périmé côté INPI avant notre échéance : on réauthentifie et on rejoue.
  if (rep.status === 401) {
    j = await obtenirJeton(true);
    if (!j) throw new ErreurInpi('Reauthentification INPI impossible.', 503);
    rep = await executer(j);
  }

  if (!rep.ok) {
    throw new ErreurInpi(messagePourStatut(rep.status, chemin), rep.status);
  }

  if (binaire) {
    return (await rep.arrayBuffer()) as T;
  }
  return (await rep.json()) as T;
}

/**
 * Appel brut, réponse rendue telle quelle.
 *
 * Sert au téléchargement de pièces, où il faut inspecter le `Content-Type` et le
 * `Content-Length` pour décider si la réponse est bien un PDF — l'INPI répond
 * parfois 200 avec un JSON d'erreur. `appeler()` ne convient pas là : il jette
 * sur statut non-ok et parse d'office.
 *
 * `url` peut être absolue (l'INPI renvoie parfois des liens complets) ou
 * relative à la base.
 */
export async function appelerBrut(
  url: string,
  options: { delaiMs?: number } = {}
): Promise<Response | null> {
  const { delaiMs = 25_000 } = options;
  const j = await obtenirJeton();
  if (!j) return null;

  const complete = url.startsWith('http') ? url : `${BASE}${url}`;
  const controleur = new AbortController();
  const minuteur = setTimeout(() => controleur.abort(), delaiMs);
  try {
    return await fetch(complete, {
      headers: {
        Authorization: `Bearer ${j}`,
        Accept: 'application/pdf, application/octet-stream, */*',
      },
      redirect: 'follow',
      signal: controleur.signal,
    });
  } catch {
    // Un chemin qui échoue n'est pas une erreur : l'appelant en essaie plusieurs.
    return null;
  } finally {
    clearTimeout(minuteur);
  }
}

/** Adresse de la fiche publique, proposée en repli quand le PDF est indisponible. */
export function urlPortail(siren: string): string {
  return `${BASE}/entreprise/s/${siren}`;
}

/**
 * Messages calqués sur ce que l'utilisateur peut en faire.
 *
 * Un « Erreur 404 » brut envoie chercher un bug ; « pas immatriculée au RNE »
 * dit quoi vérifier. Ces cas sont fréquents : beaucoup de clients d'un cabinet
 * sont des entreprises individuelles ou des associations absentes du registre.
 */
function messagePourStatut(status: number, chemin: string): string {
  switch (status) {
    case 404:
      return "Introuvable au registre national des entreprises. L'entreprise n'y est peut-etre pas immatriculee (entreprise individuelle, association).";
    case 403:
      return "Acces refuse par l'INPI. Le compte n'a peut-etre pas les droits sur cette ressource.";
    case 429:
      return "Trop d'appels a l'INPI. Attends quelques minutes avant de relancer.";
    case 500:
    case 502:
    case 503:
      return `L'INPI est indisponible (${status}). A retenter plus tard.`;
    default:
      return `Erreur INPI ${status} sur ${chemin}.`;
  }
}

/** Vérifie les identifiants sans rien récupérer. Sert au bouton « Tester ». */
export async function tester(): Promise<{ ok: boolean; message: string }> {
  if (!config.inpi.configure) {
    return { ok: false, message: 'INPI non configure (INPI_USERNAME, INPI_PASSWORD).' };
  }
  try {
    await obtenirJeton(true);
    return { ok: true, message: `Connexion INPI etablie pour ${config.inpi.username}.` };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : 'Echec.' };
  }
}

/** Oublie le jeton. Utile après un changement d'identifiants. */
export function reinitialiser(): void {
  jeton = null;
  jetonExpireLe = 0;
}
