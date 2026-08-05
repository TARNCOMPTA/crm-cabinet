/**
 * Codes d'enrôlement.
 * ---------------------------------------------------------------------------
 * Remplace le parcours « mot de passe oublié », qui n'a plus d'objet sans mot de
 * passe. Un administrateur — ou le script d'installation — génère un code à
 * durée de vie courte ; l'utilisateur le saisit une fois pour enrôler sa
 * première passkey.
 *
 * Le code est stocké HACHÉ. Un code d'enrôlement vaut une identité : le lire en
 * base ne doit pas suffire à prendre la main sur un compte.
 */

import { createHash, randomInt } from 'node:crypto';
import { requete, requeteUne } from '../db.js';

/** Sans I, O, 0 ni 1 : ces caractères se confondent à la lecture. */
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const LONGUEUR = 10;
const VALIDITE_MINUTES = 60;

function genererCode(): string {
  let code = '';
  for (let i = 0; i < LONGUEUR; i++) {
    // randomInt est cryptographiquement sûr, contrairement à Math.random.
    code += ALPHABET[randomInt(ALPHABET.length)];
  }
  // Groupé par 5 pour être dictable au téléphone.
  return `${code.slice(0, 5)}-${code.slice(5)}`;
}

function hacher(code: string): string {
  return createHash('sha256').update(code.replace(/-/g, '').toUpperCase()).digest('hex');
}

export interface CodeEnrolement {
  code: string;
  expireLe: Date;
}

/** Émet un code pour un utilisateur, en invalidant ceux déjà en attente. */
export async function emettreCode(userId: string): Promise<CodeEnrolement> {
  const code = genererCode();
  const expireLe = new Date(Date.now() + VALIDITE_MINUTES * 60_000);

  await requete('DELETE FROM enrolment_codes WHERE user_id = $1', [userId]);
  await requete(
    'INSERT INTO enrolment_codes (user_id, code_hash, expires_at) VALUES ($1, $2, $3)',
    [userId, hacher(code), expireLe.toISOString()]
  );
  return { code, expireLe };
}

export interface ProfilEnrolable {
  id: string;
  email: string;
  prenom: string | null;
  nom: string | null;
}

/**
 * Valide un code et rend le profil correspondant, sans le consommer : le code
 * n'est retiré qu'une fois la passkey effectivement enregistrée, sinon un
 * enrôlement interrompu brûlerait le code pour rien.
 */
export async function profilPourCode(code: string): Promise<ProfilEnrolable | null> {
  const ligne = await requeteUne<{ user_id: string }>(
    `SELECT user_id FROM enrolment_codes
      WHERE code_hash = $1 AND expires_at > now() AND used_at IS NULL`,
    [hacher(code)]
  );
  if (!ligne) return null;

  return requeteUne<ProfilEnrolable>(
    'SELECT id, email, prenom, nom FROM profiles WHERE id = $1 AND is_active',
    [ligne.user_id]
  );
}

export async function consommerCode(code: string): Promise<void> {
  await requete(
    'UPDATE enrolment_codes SET used_at = now() WHERE code_hash = $1',
    [hacher(code)]
  );
}

/** Purge des codes expirés ou consommés, appelée par l'ordonnanceur. */
export async function purgerCodes(): Promise<number> {
  const r = await requete(
    "DELETE FROM enrolment_codes WHERE expires_at < now() - interval '7 days' OR used_at IS NOT NULL"
  );
  return r.length;
}
