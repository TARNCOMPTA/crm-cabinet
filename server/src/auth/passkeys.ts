/**
 * Authentification par passkey (WebAuthn).
 * ---------------------------------------------------------------------------
 * Remplace Supabase Auth. Il n'y a plus de mot de passe, donc plus de parcours
 * « mot de passe oublié » : à la place, un code d'enrôlement à durée de vie
 * courte, généré en ligne de commande sur le serveur.
 *
 * Deux garde-fous appris de la conception :
 *   - le RP ID est lié au domaine. Le changer invalide TOUTES les passkeys
 *     enrôlées et verrouille les utilisateurs dehors.
 *   - sans mot de passe de secours, un administrateur seul avec une unique
 *     passkey perd l'accès définitivement en cas de perte d'appareil. D'où
 *     l'avertissement à l'enrôlement du premier administrateur.
 */

import {
  generateRegistrationOptions,
  verifyRegistrationResponse,
  generateAuthenticationOptions,
  verifyAuthenticationResponse,
} from '@simplewebauthn/server';
import type {
  AuthenticationResponseJSON,
  RegistrationResponseJSON,
} from '@simplewebauthn/server';
import { config } from '../config.js';
import { requete, requeteUne } from '../db.js';

export interface Passkey {
  id: string;
  user_id: string;
  credential_id: string;
  public_key: string;
  compteur: number;
  transports: string | null;
  libelle: string | null;
  created_at: string;
  last_used_at: string | null;
}

/**
 * Défis en attente, gardés en mémoire.
 *
 * Un défi vit quelques secondes entre deux requêtes du même navigateur ; le
 * stocker en base ajouterait deux allers-retours pour rien. Conséquence assumée :
 * un redémarrage du serveur invalide les enrôlements en cours, ce qui n'a aucune
 * portée pratique — l'utilisateur relance l'opération.
 */
const defis = new Map<string, { defi: string; expire: number }>();
const DEFI_TTL_MS = 120_000;

function poserDefi(cle: string, defi: string): void {
  defis.set(cle, { defi, expire: Date.now() + DEFI_TTL_MS });
}

function consommerDefi(cle: string): string | null {
  const entree = defis.get(cle);
  defis.delete(cle);
  if (!entree || entree.expire < Date.now()) return null;
  return entree.defi;
}

/** Purge périodique : la Map ne doit pas croître indéfiniment. */
setInterval(() => {
  const maintenant = Date.now();
  for (const [cle, v] of defis) if (v.expire < maintenant) defis.delete(cle);
}, 60_000).unref();

// ---------------------------------------------------------------------------
// Enrôlement d'une nouvelle passkey
// ---------------------------------------------------------------------------

export async function optionsEnrolement(profil: {
  id: string;
  email: string;
  prenom: string | null;
  nom: string | null;
}) {
  const existantes = await requete<Pick<Passkey, 'credential_id' | 'transports'>>(
    'SELECT credential_id, transports FROM passkeys WHERE user_id = $1',
    [profil.id]
  );

  const options = await generateRegistrationOptions({
    rpName: config.webauthn.rpName,
    rpID: config.webauthn.rpId,
    userID: Buffer.from(profil.id),
    userName: profil.email,
    userDisplayName: [profil.prenom, profil.nom].filter(Boolean).join(' ') || profil.email,
    attestationType: 'none',
    // Empêche d'enrôler deux fois le même appareil pour le même compte.
    excludeCredentials: existantes.map((p) => ({
      id: p.credential_id,
      transports: p.transports ? (JSON.parse(p.transports) as never) : undefined,
    })),
    authenticatorSelection: {
      residentKey: 'preferred',
      userVerification: 'preferred',
    },
  });

  poserDefi(`enrolement:${profil.id}`, options.challenge);
  return options;
}

export async function verifierEnrolement(
  userId: string,
  reponse: RegistrationResponseJSON,
  libelle: string | null
): Promise<boolean> {
  const defi = consommerDefi(`enrolement:${userId}`);
  if (!defi) return false;

  const verif = await verifyRegistrationResponse({
    response: reponse,
    expectedChallenge: defi,
    expectedOrigin: config.webauthn.origine,
    expectedRPID: config.webauthn.rpId,
    requireUserVerification: false,
  });
  if (!verif.verified || !verif.registrationInfo) return false;

  const { credential } = verif.registrationInfo;
  await requete(
    `INSERT INTO passkeys (user_id, credential_id, public_key, compteur, transports, libelle)
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (credential_id) DO NOTHING`,
    [
      userId,
      credential.id,
      Buffer.from(credential.publicKey).toString('base64url'),
      credential.counter,
      credential.transports ? JSON.stringify(credential.transports) : null,
      libelle,
    ]
  );
  return true;
}

// ---------------------------------------------------------------------------
// Connexion
// ---------------------------------------------------------------------------

/**
 * Options de connexion. On ne restreint pas la liste des identifiants : cela
 * permet une connexion sans saisir d'email (le navigateur propose les passkeys
 * qu'il connaît pour ce domaine) et évite de révéler quels comptes existent.
 */
export async function optionsConnexion(cleDefi: string) {
  const options = await generateAuthenticationOptions({
    rpID: config.webauthn.rpId,
    userVerification: 'preferred',
  });
  poserDefi(`connexion:${cleDefi}`, options.challenge);
  return options;
}

export interface ProfilConnecte {
  id: string;
  email: string;
  role: string;
  prenom: string | null;
  nom: string | null;
  is_active: boolean;
}

export async function verifierConnexion(
  cleDefi: string,
  reponse: AuthenticationResponseJSON
): Promise<ProfilConnecte | null> {
  const defi = consommerDefi(`connexion:${cleDefi}`);
  if (!defi) return null;

  const passkey = await requeteUne<Passkey>(
    'SELECT * FROM passkeys WHERE credential_id = $1',
    [reponse.id]
  );
  if (!passkey) return null;

  const verif = await verifyAuthenticationResponse({
    response: reponse,
    expectedChallenge: defi,
    expectedOrigin: config.webauthn.origine,
    expectedRPID: config.webauthn.rpId,
    credential: {
      id: passkey.credential_id,
      publicKey: Buffer.from(passkey.public_key, 'base64url'),
      counter: passkey.compteur,
      transports: passkey.transports ? (JSON.parse(passkey.transports) as never) : undefined,
    },
    requireUserVerification: false,
  });
  if (!verif.verified) return null;

  // Le compteur monotone détecte le clonage d'un authentificateur : on le
  // remonte à chaque connexion réussie.
  await requete(
    'UPDATE passkeys SET compteur = $1, last_used_at = now() WHERE id = $2',
    [verif.authenticationInfo.newCounter, passkey.id]
  );

  const profil = await requeteUne<ProfilConnecte>(
    'SELECT id, email, role, prenom, nom, is_active FROM profiles WHERE id = $1',
    [passkey.user_id]
  );
  if (!profil || !profil.is_active) return null;
  return profil;
}

export async function listerPasskeys(userId: string) {
  return requete<Pick<Passkey, 'id' | 'libelle' | 'created_at' | 'last_used_at'>>(
    'SELECT id, libelle, created_at, last_used_at FROM passkeys WHERE user_id = $1 ORDER BY created_at',
    [userId]
  );
}

/**
 * Supprime une passkey, en refusant de retirer la dernière : sans mot de passe
 * de secours, ce serait un verrouillage définitif.
 */
export async function supprimerPasskey(userId: string, passkeyId: string): Promise<
  { ok: true } | { ok: false; raison: string }
> {
  const restantes = await requeteUne<{ n: string }>(
    'SELECT count(*) AS n FROM passkeys WHERE user_id = $1',
    [userId]
  );
  if (Number(restantes?.n ?? 0) <= 1) {
    return {
      ok: false,
      raison:
        "Impossible de supprimer la derniere passkey : sans mot de passe de secours, " +
        "vous perdriez definitivement l'acces. Enrolez-en une autre d'abord.",
    };
  }
  await requete('DELETE FROM passkeys WHERE id = $1 AND user_id = $2', [passkeyId, userId]);
  return { ok: true };
}
