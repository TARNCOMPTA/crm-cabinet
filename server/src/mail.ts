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

export interface ReglagesSmtp {
  host: string;
  port: number;
  secure: boolean;
  user: string;
  password: string;
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
            smtp_from_email, smtp_from_name, use_tls, is_enabled
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
      password: ligne.smtp_password,
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
      password: config.smtp.password,
      from: config.smtp.from,
      origine: 'env',
    };
  }

  return null;
}

let transport: Transporter | null = null;
let empreinteTransport = '';

function empreinte(r: ReglagesSmtp): string {
  // Le mot de passe entre dans l'empreinte : le changer doit rouvrir la
  // connexion, sinon l'ancien identifiant resterait utilisé.
  return [r.host, r.port, r.secure, r.user, r.password, r.from].join('|');
}

async function obtenirTransport(): Promise<{ transport: Transporter; reglages: ReglagesSmtp } | null> {
  const reglages = await lireReglages();
  if (!reglages) return null;

  const e = empreinte(reglages);
  if (!transport || e !== empreinteTransport) {
    if (transport) transport.close();
    transport = nodemailer.createTransport({
      host: reglages.host,
      port: reglages.port,
      secure: reglages.secure,
      auth: reglages.user ? { user: reglages.user, pass: reglages.password } : undefined,
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
  | { ok: false; raison: string; definitif: boolean };

/**
 * Envoie un mail.
 *
 * `definitif` distingue ce qui ne marchera jamais (adresse rejetée, SMTP non
 * configuré) de ce qui peut marcher plus tard (relais injoignable). L'appelant
 * s'en sert pour décider entre réessayer et abandonner — sans cette distinction,
 * une adresse invalide occuperait la file jusqu'à épuisement des tentatives.
 */
export async function envoyer(courrier: Courrier): Promise<ResultatEnvoi> {
  const t = await obtenirTransport();
  if (!t) {
    return {
      ok: false,
      raison: "SMTP non configure : renseigne les reglages dans Parametres, ou SMTP_HOST et SMTP_FROM dans le .env.",
      definitif: true,
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
    return { ok: false, raison: message, definitif: typeof code === 'number' && code >= 500 };
  }
}

/**
 * Vérifie les réglages sans envoyer de mail réel, et consigne le résultat dans
 * `cabinet_smtp_config` pour que l'interface puisse l'afficher.
 */
export async function tester(): Promise<{ ok: boolean; message: string }> {
  const t = await obtenirTransport();
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
  if (transport) {
    transport.close();
    transport = null;
    empreinteTransport = '';
  }
}
