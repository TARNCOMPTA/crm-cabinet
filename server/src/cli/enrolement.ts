#!/usr/bin/env tsx
/**
 * Génère un code d'enrôlement de passkey, en ligne de commande sur le serveur.
 *
 *   npm run enrolement -- prenom.nom@moncabinet.fr
 *   npm run enrolement -- --creer prenom.nom@moncabinet.fr "Prenom" "NOM" admin
 *
 * C'est le remplaçant du mot de passe administrateur que demandait
 * l'installateur : rien à saisir au terminal, rien à transmettre en clair, et le
 * code expire au bout d'une heure.
 */

import { emettreCode } from '../auth/enrolement.js';
import { pool, requeteUne } from '../db.js';

async function main() {
  const args = process.argv.slice(2);
  const creer = args.includes('--creer');
  const positionnels = args.filter((a) => !a.startsWith('--'));
  const email = positionnels[0];

  if (!email) {
    console.error('Usage : npm run enrolement -- <email>');
    console.error('        npm run enrolement -- --creer <email> [prenom] [nom] [admin|user]');
    process.exit(1);
  }

  let profil = await requeteUne<{ id: string; email: string; is_active: boolean }>(
    'SELECT id, email, is_active FROM profiles WHERE lower(email) = lower($1)',
    [email]
  );

  if (!profil && creer) {
    const prenom = positionnels[1] ?? null;
    const nom = positionnels[2] ?? null;
    const role = positionnels[3] === 'admin' ? 'admin' : 'user';
    profil = await requeteUne<{ id: string; email: string; is_active: boolean }>(
      `INSERT INTO profiles (email, prenom, nom, role, is_active)
       VALUES ($1, $2, $3, $4, true)
       RETURNING id, email, is_active`,
      [email, prenom, nom, role]
    );
    console.log(`Compte cree : ${email} (${role})`);
  }

  if (!profil) {
    console.error(`Aucun compte pour « ${email} ». Ajoute --creer pour le creer.`);
    process.exit(1);
  }
  if (!profil.is_active) {
    console.error(`Le compte « ${email} » est desactive.`);
    process.exit(1);
  }

  const { code, expireLe } = await emettreCode(profil.id);

  const nb = await requeteUne<{ n: string }>(
    'SELECT count(*) AS n FROM passkeys WHERE user_id = $1',
    [profil.id]
  );

  // La bordure se calcule sur le code plutot que d'etre codee en dur : un cadre
  // plus large que son contenu se lit comme un texte tronque, et c'est
  // exactement ce qui s'est produit — le code affiche a ete cru incomplet.
  const bordure = '─'.repeat(code.length + 6);
  console.log('');
  console.log(`  ┌${bordure}┐`);
  console.log(`  │   ${code}   │`);
  console.log(`  └${bordure}┘`);
  console.log('');
  console.log(`  Compte  : ${profil.email}`);
  console.log(`  Valide  : jusqu'a ${expireLe.toLocaleTimeString('fr-FR')} (1 heure)`);
  console.log('');

  if (Number(nb?.n ?? 0) === 0) {
    console.log("  A saisir sur la page de connexion pour enroler une passkey.");
    console.log('');
    console.log('  ⚠️  Pense a enroler DEUX passkeys sur ce compte (par exemple');
    console.log('      l\'ordinateur et le telephone). Sans mot de passe de secours,');
    console.log("      la perte d'un appareil unique verrouille l'acces definitivement.");
  } else {
    console.log(`  Ce compte a deja ${nb?.n} passkey(s) enrolee(s).`);
  }
  console.log('');

  await pool.end();
}

main().catch((e) => {
  console.error('Echec :', e instanceof Error ? e.message : e);
  process.exit(1);
});
