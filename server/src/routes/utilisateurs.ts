/**
 * Création de comptes collaborateurs.
 * ---------------------------------------------------------------------------
 * Reprend l'Edge Function `create-user`. Ce qui change, et pourquoi.
 *
 * Elle appelait `auth.admin.inviteUserByEmail()` : GoTrue créait l'utilisateur,
 * envoyait un lien de définition de mot de passe, et un déclencheur SQL créait
 * le profil au premier accès. Trois pièces pour un compte.
 *
 * Sans GoTrue, `profiles` EST la table des comptes : créer un collaborateur,
 * c'est insérer une ligne. Le lien de mot de passe est remplacé par un code
 * d'enrôlement de passkey, remis à l'intéressé — par mail si le SMTP est
 * configuré, affiché à l'écran sinon. Cette dernière possibilité n'est pas un
 * repli de dépannage : sur une instance fraîchement installée, le SMTP n'est
 * souvent pas encore réglé, et il faut bien pouvoir créer le deuxième compte.
 *
 * Le contrôle `cabinet_id` de l'original disparaît avec le multi-cabinet : il
 * n'y a plus qu'un cabinet, donc plus de cabinet d'autrui dans lequel inviter.
 */

import type { FastifyInstance } from 'fastify';
import { requeteUne } from '../db.js';
import { exigerAdmin } from '../gardes.js';
import { emettreCode } from '../auth/enrolement.js';
import { envoyer } from '../mail.js';
import { config } from '../config.js';

interface CorpsCreation {
  email?: string;
  prenom?: string;
  nom?: string;
  role?: string;
  job_role?: string;
}

const ROLES_VALIDES = new Set(['admin', 'user']);

function htmlInvitation(prenom: string, code: string, expireLe: Date): string {
  const url = config.publicUrl;
  const expiration = expireLe.toLocaleString('fr-FR', {
    dateStyle: 'short',
    timeStyle: 'short',
  });
  return `<!doctype html>
<html lang="fr"><body style="font-family:system-ui,sans-serif;color:#111;line-height:1.5">
  <p>Bonjour ${prenom},</p>
  <p>Un accès au CRM du cabinet vous a été ouvert.</p>
  <p>Rendez-vous sur <a href="${url}">${url}</a>, cliquez sur
     « Premier appareil ou nouvel appareil ? » et saisissez ce code :</p>
  <p style="font-size:22px;font-weight:700;letter-spacing:2px;margin:24px 0">${code}</p>
  <p>Votre appareil vous demandera alors votre empreinte, votre visage ou votre
     code : c'est ce qui remplace le mot de passe. Rien à retenir, rien à saisir
     les fois suivantes.</p>
  <p style="color:#666;font-size:14px">Ce code est valable une seule fois,
     jusqu'au ${expiration}. Passé ce délai, demandez-en un nouveau à
     l'administrateur.</p>
</body></html>`;
}

export function enregistrerRoutesUtilisateurs(app: FastifyInstance): void {
  app.post<{ Body: CorpsCreation }>('/api/create-user', async (request, reply) => {
    const session = await exigerAdmin(request, reply);
    if (!session) return;

    const { email, prenom, nom, role, job_role } = request.body ?? {};
    if (!email || !prenom || !nom || !role) {
      return reply.code(400).send({ error: 'Parametres manquants : email, prenom, nom, role.' });
    }
    if (!ROLES_VALIDES.has(role)) {
      return reply.code(400).send({ error: `Role inconnu : ${role}.` });
    }

    const normalise = email.trim().toLowerCase();

    const existant = await requeteUne<{ id: string; is_active: boolean }>(
      'SELECT id, is_active FROM profiles WHERE lower(email) = $1',
      [normalise]
    );
    if (existant) {
      // Un compte désactivé n'est pas une erreur de saisie : on dit lequel des
      // deux cas s'applique, sinon l'administrateur ne sait pas s'il doit
      // corriger l'adresse ou réactiver le compte.
      return reply.code(409).send({
        error: existant.is_active
          ? 'Cet email est deja utilise.'
          : 'Un compte desactive existe pour cet email : reactive-le plutot que d\'en creer un autre.',
      });
    }

    const profil = await requeteUne<{ id: string; email: string }>(
      `INSERT INTO profiles (email, prenom, nom, role, job_role, is_active)
       VALUES ($1, $2, $3, $4, $5, true)
       RETURNING id, email`,
      [normalise, prenom.trim(), nom.trim(), role, job_role ?? null]
    );
    if (!profil) {
      return reply.code(500).send({ error: 'Creation du profil impossible.' });
    }

    const { code, expireLe } = await emettreCode(profil.id);

    const envoi = await envoyer({
      destinataire: profil.email,
      sujet: 'Votre acces au CRM du cabinet',
      html: htmlInvitation(prenom.trim(), code, expireLe),
    });

    // Le code est rendu à l'administrateur quand le mail n'est pas parti : sans
    // cela, le compte serait créé et inaccessible, sans moyen de rattrapage.
    return {
      success: true,
      user: { id: profil.id, email: profil.email },
      codeEnvoye: envoi.ok,
      code: envoi.ok ? undefined : code,
      expireLe: expireLe.toISOString(),
      message: envoi.ok
        ? `Invitation envoyee a ${profil.email}.`
        : `Compte cree, mais l'email n'est pas parti (${envoi.raison}). Transmets ce code d'enrolement : ${code}`,
    };
  });

  /**
   * Nouveau code pour un compte existant. Remplace « mot de passe oublié » :
   * c'est la voie de rattrapage quand un collaborateur a perdu l'appareil qui
   * portait sa seule passkey.
   */
  app.post<{ Body: { userId?: string } }>(
    '/api/utilisateurs/code-enrolement',
    async (request, reply) => {
      const session = await exigerAdmin(request, reply);
      if (!session) return;

      const userId = request.body?.userId;
      if (!userId) return reply.code(400).send({ error: 'userId manquant.' });

      const profil = await requeteUne<{ id: string; email: string; prenom: string | null }>(
        'SELECT id, email, prenom FROM profiles WHERE id = $1 AND is_active',
        [userId]
      );
      if (!profil) return reply.code(404).send({ error: 'Compte introuvable ou desactive.' });

      const { code, expireLe } = await emettreCode(profil.id);
      const envoi = await envoyer({
        destinataire: profil.email,
        sujet: 'Nouveau code d\'acces au CRM du cabinet',
        html: htmlInvitation(profil.prenom ?? '', code, expireLe),
      });

      return {
        success: true,
        codeEnvoye: envoi.ok,
        code: envoi.ok ? undefined : code,
        expireLe: expireLe.toISOString(),
      };
    }
  );
}
