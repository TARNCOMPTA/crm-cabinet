/**
 * Envoi de courrier électronique par SMTP.
 * ---------------------------------------------------------------------------
 * Remplace Resend. Deux raisons de fond :
 *
 *   1. Un service tiers voit passer le contenu des mails — noms de clients,
 *      échéances, montants. Sur un produit auto-hébergé qui promet au cabinet
 *      qu'il garde ses données, imposer un intermédiaire américain serait
 *      contradictoire.
 *   2. Chaque cabinet a déjà un serveur SMTP (celui de son hébergeur, de son
 *      domaine). Le lui faire réutiliser évite un compte de plus à créer, et
 *      les mails partent de son propre domaine — donc ils arrivent.
 *
 * Deux sources de configuration, dans cet ordre :
 *
 *   - la table `cabinet_smtp_config`, modifiable depuis l'application. C'est la
 *     source qui gagne quand `is_enabled` est vrai, pour que l'administrateur
 *     puisse corriger ses réglages sans ouvrir de session SSH ;
 *   - le `.env`, écrit à l'installation. Sert de valeur de départ et de filet
 *     si la table est vide.
 *
 * Le transport est mis en cache et reconstruit quand la configuration change :
 * ouvrir une connexion SMTP par mail serait lent, et la garder indéfiniment
 * ignorerait les modifications faites dans l'interface.
 */

import nodemailer, { type Transporter } from 'nodemailer';
import { config } from './config.js';
import { requeteUne } from './db.js';
import { obtenirJeton, oublierJeton, type IdentitéAzure } from './oauth-microsoft.js';

/**
 * Comment on prouve au serveur qu'on a le droit d'envoyer.
 *
 * ⚠️ UNE UNION, ET NON UN BOOLÉEN AVEC DES CHAMPS OPTIONNELS. Les deux modes
 * n'ont aucun champ en commun : un mot de passe d'un côté, trois identifiants
 * Azure de l'autre. Les mêler dans un seul objet laisserait écrire un transport
 * avec un secret Azure et pas de locataire, que le compilateur accepterait.
 */
export type AuthSmtp =
  | { mode: 'motdepasse'; password: string }
  | { mode: 'oauth2'; azure: IdentitéAzure };

export interface ReglagesSmtp {
  host: string;
  port: number;
  secure: boolean;
  user: string;
  auth: AuthSmtp;
  from: string;
  /** D'où vient la configuration retenue. Sert aux messages de diagnostic. */
  origine: 'base' | 'env';
}

interface LigneSmtp {
  smtp_host: string;
  smtp_port: number;
  smtp_user: string;
  smtp_password: string;
  smtp_from_email: string;
  smtp_from_name: string | null;
  use_tls: boolean;
  is_enabled: boolean;
  auth_mode: string;
  oauth_tenant_id: string;
  oauth_client_id: string;
  oauth_client_secret: string;
}

/**
 * Réglages effectifs, base d'abord.
 *
 * `is_enabled` est le témoin que l'administrateur a bien terminé sa saisie : une
 * ligne à moitié remplie ne doit pas éclipser un `.env` qui, lui, fonctionne.
 */
export async function lireReglages(): Promise<ReglagesSmtp | null> {
  const ligne = await requeteUne<LigneSmtp>(
    `SELECT smtp_host, smtp_port, smtp_user, smtp_password,
            smtp_from_email, smtp_from_name, use_tls, is_enabled,
            auth_mode, oauth_tenant_id, oauth_client_id, oauth_client_secret
       FROM cabinet_smtp_config
      ORDER BY created_at
      LIMIT 1`
  ).catch(() => null);

  if (ligne?.is_enabled && ligne.smtp_host && ligne.smtp_from_email) {
    const nom = ligne.smtp_from_name?.trim();
    return {
      host: ligne.smtp_host,
      port: ligne.smtp_port,
      // `use_tls` distingue le TLS implicite (465) du STARTTLS (587) : à partir
      // de 587 nodemailer doit ouvrir en clair puis négocier, d'où `secure`
      // faux dans ce cas. Forcer `secure` sur 587 fait échouer la connexion.
      secure: ligne.use_tls && ligne.smtp_port === 465,
      user: ligne.smtp_user,
      auth:
        ligne.auth_mode === 'oauth2'
          ? {
              mode: 'oauth2',
              azure: {
                tenantId: ligne.oauth_tenant_id,
                clientId: ligne.oauth_client_id,
                clientSecret: ligne.oauth_client_secret,
              },
            }
          : { mode: 'motdepasse', password: ligne.smtp_password },
      from: nom ? `${nom} <${ligne.smtp_from_email}>` : ligne.smtp_from_email,
      origine: 'base',
    };
  }

  if (config.smtp.configure) {
    return {
      host: config.smtp.host,
      port: config.smtp.port,
      secure: config.smtp.secure,
      user: config.smtp.user,
      // Le `.env` ne porte pas OAuth : il sert de filet a l'installation, et
      // l'authentification moderne se regle dans l'ecran, jamais par fichier.
      auth: { mode: 'motdepasse', password: config.smtp.password },
      from: config.smtp.from,
      origine: 'env',
    };
  }

  return null;
}

let transport: Transporter | null = null;
let empreinteTransport = '';

/**
 * Nos réglages, dans la forme que nodemailer attend.
 *
 * `type: 'OAuth2'` avec un `accessToken` déjà obtenu — et non un `refreshToken`
 * que nodemailer renouvellerait lui-même. Le renouvellement vit dans
 * `oauth-microsoft.ts`, avec son cache et ses tests ; le confier à nodemailer
 * le rendrait invisible et inéprouvable.
 */
function authNodemailer(r: ReglagesSmtp, jeton: string) {
  if (r.auth.mode === 'oauth2') {
    return { type: 'OAuth2' as const, user: r.user, accessToken: jeton };
  }
  return r.user ? { user: r.user, pass: r.auth.password } : undefined;
}

function empreinte(r: ReglagesSmtp, jeton: string): string {
  // Le secret entre dans l'empreinte : le changer doit rouvrir la connexion,
  // sinon l'ancien identifiant resterait utilisé.
  //
  // ⚠️ LE JETON AUSSI, et c'est ce qui rend OAuth utilisable ici : il expire au
  // bout d'une heure. Sans lui dans l'empreinte, le transport mis en cache
  // continuerait de présenter un jeton mort, et les envois échoueraient une
  // heure après chaque démarrage — une panne qui ne se reproduit jamais quand
  // on la cherche.
  const secret = r.auth.mode === 'motdepasse' ? r.auth.password : r.auth.azure.clientId;
  return [r.host, r.port, r.secure, r.user, secret, jeton, r.from].join('|');
}

async function obtenirTransport(): Promise<{ transport: Transporter; reglages: ReglagesSmtp } | null> {
  const reglages = await lireReglages();
  if (!reglages) return null;

  // Le jeton s'obtient AVANT de construire le transport : sa demande peut
  // échouer, et cet échec doit remonter tel quel — c'est le diagnostic d'Azure
  // qui dit à l'administrateur quoi corriger.
  const jeton =
    reglages.auth.mode === 'oauth2' ? (await obtenirJeton(reglages.auth.azure)).valeur : '';

  const e = empreinte(reglages, jeton);
  if (!transport || e !== empreinteTransport) {
    if (transport) transport.close();
    transport = nodemailer.createTransport({
      host: reglages.host,
      port: reglages.port,
      secure: reglages.secure,
      auth: authNodemailer(reglages, jeton),
      // Un relais lent ne doit pas bloquer l'ordonnanceur : au-delà de dix
      // secondes on abandonne, le mail repassera au tour suivant.
      connectionTimeout: 10_000,
      greetingTimeout: 10_000,
      socketTimeout: 20_000,
    });
    empreinteTransport = e;
  }

  return { transport, reglages };
}

export interface Courrier {
  destinataire: string;
  sujet: string;
  html: string;
}

export type ResultatEnvoi =
  | { ok: true }
  | { ok: false; raison: string; definitif: boolean; authentification: boolean };

/**
 * Le serveur a-t-il refusé nos IDENTIFIANTS, plutôt que ce message-ci ?
 *
 * ⚠️ CETTE DISTINCTION PROTÈGE LA BOÎTE DU CABINET. Un refus d'identifiants ne
 * se répare pas en réessayant : chaque tentative est un échec d'authentification
 * de plus, et les fournisseurs — Microsoft 365 le premier — verrouillent le
 * compte au bout de quelques-uns. Un lot de cinquante courriels en attente
 * produirait cinquante échecs d'affilée, c'est-à-dire exactement le geste qui
 * ferme la boîte. Vu en production : « 535 5.7.139 Authentication unsuccessful,
 * account locked. Contact your administrator. »
 *
 * ⚠️ ON LIT LE CODE, PAS LE TEXTE. `code === 'EAUTH'` est posé par nodemailer, et
 * 530/534/535 sont les codes SMTP du refus d'authentification. Le message, lui,
 * change avec le fournisseur, sa langue et sa version — le comparer serait une
 * garde qui se périme sans prévenir.
 */
export function estRefusAuthentification(e: unknown): boolean {
  // ⚠️ `catch (e)` DONNE `unknown`, ET C'EST LA VERITE : ce qui est lance peut
  // etre une Error, un objet nu, une chaine, `null`. Lire `.code` sans verifier
  // plantait sur `null` — trouve par le test, pas par la relecture.
  if (typeof e !== 'object' || e === null) return false;
  const err = e as { code?: unknown; responseCode?: unknown };
  if (err.code === 'EAUTH') return true;
  return err.responseCode === 530 || err.responseCode === 534 || err.responseCode === 535;
}

/**
 * Envoie un mail.
 *
 * `definitif` distingue ce qui ne marchera jamais (adresse rejetée, SMTP non
 * configuré) de ce qui peut marcher plus tard (relais injoignable). L'appelant
 * s'en sert pour décider entre réessayer et abandonner — sans cette distinction,
 * une adresse invalide occuperait la file jusqu'à épuisement des tentatives.
 */
export async function envoyer(courrier: Courrier): Promise<ResultatEnvoi> {
  let t: Awaited<ReturnType<typeof obtenirTransport>>;
  try {
    t = await obtenirTransport();
  } catch (e) {
    /*
     * La demande de jeton a echoue — application inconnue, secret perime,
     * consentement retire, ou Azure injoignable.
     *
     * ⚠️ `authentification: true`, ET C'EST DELIBERE : cela ARRETE LE LOT. Un
     * jeton refuse le sera pour les quarante-neuf courriels suivants, et
     * insister ferait quarante-neuf demandes de jeton refusees a Azure, qui
     * limite les siennes. Meme raisonnement que pour un refus SMTP.
     */
    return {
      ok: false,
      raison: e instanceof Error ? e.message : String(e),
      definitif: true,
      authentification: true,
    };
  }
  if (!t) {
    return {
      ok: false,
      raison: "SMTP non configure : renseigne les reglages dans Parametres, ou SMTP_HOST et SMTP_FROM dans le .env.",
      definitif: true,
      authentification: false,
    };
  }

  try {
    await t.transport.sendMail({
      from: t.reglages.from,
      to: courrier.destinataire,
      subject: courrier.sujet,
      html: courrier.html,
    });
    return { ok: true };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    // Les codes 5xx du SMTP signalent un refus permanent ; les 4xx un incident
    // temporaire. `responseCode` est posé par nodemailer quand le serveur a
    // répondu ; son absence signifie qu'on n'a même pas pu le joindre.
    const code = (e as { responseCode?: number }).responseCode;
    return {
      ok: false,
      raison: message,
      definitif: typeof code === 'number' && code >= 500,
      authentification: estRefusAuthentification(e),
    };
  }
}

/**
 * Vérifie les réglages sans envoyer de mail réel, et consigne le résultat dans
 * `cabinet_smtp_config` pour que l'interface puisse l'afficher.
 */
export async function tester(): Promise<{ ok: boolean; message: string }> {
  let t: Awaited<ReturnType<typeof obtenirTransport>>;
  try {
    t = await obtenirTransport();
  } catch (e) {
    // Le diagnostic d'Azure (« AADSTS7000215 : secret invalide ») est ce que
    // l'administrateur doit lire : il nomme exactement ce qu'il doit corriger.
    const message = e instanceof Error ? e.message : String(e);
    await consignerTest(`erreur: ${message.slice(0, 200)}`);
    return { ok: false, message };
  }
  if (!t) {
    return { ok: false, message: 'SMTP non configure.' };
  }

  try {
    await t.transport.verify();
    await consignerTest('ok');
    return { ok: true, message: `Connexion etablie (${t.reglages.host}:${t.reglages.port}).` };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    await consignerTest(`erreur: ${message.slice(0, 200)}`);
    return { ok: false, message };
  }
}

async function consignerTest(statut: string): Promise<void> {
  await requeteUne(
    `UPDATE cabinet_smtp_config
        SET last_test_at = now(), last_test_status = $1, updated_at = now()
      WHERE id = (SELECT id FROM cabinet_smtp_config ORDER BY created_at LIMIT 1)`,
    [statut]
  ).catch(() => null);
}

/** Ferme la connexion SMTP. Appelé à l'arrêt du serveur. */
export function fermer(): void {
  // Le jeton part avec la connexion : le garder en memoire apres l'arret ne
  // servirait a rien, et un secret qui traine n'a jamais d'utilite.
  oublierJeton();
  if (transport) {
    transport.close();
    transport = null;
    empreinteTransport = '';
  }
}
