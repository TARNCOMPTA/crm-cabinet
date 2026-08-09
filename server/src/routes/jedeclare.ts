/**
 * Routes du suivi des échéances.
 * ---------------------------------------------------------------------------
 * Deux natures d'opération, et il faut les distinguer avant de lire la suite :
 *
 *   · LIRE le suivi ne coûte rien. Le pivot se construit depuis le cache local
 *     (`jedeclare_teletransmissions`), sans jamais appeler jedeclare. Tout
 *     collaborateur y a droit.
 *
 *   · ANALYSER appelle jedeclare et MARQUE les accusés lus « récupérés ». Si le
 *     cabinet dépose ses flux avec un autre logiciel, celui-ci ne les verra plus
 *     comme nouveaux. Ce n'est pas une opération coûteuse, c'est une opération
 *     destructrice pour un tiers — d'où les six garanties posées plus bas.
 *
 * AUCUNE TÂCHE PLANIFIÉE, ET C'EST DÉLIBÉRÉ.
 * `planificateur.ts` n'a pas été touché. Une analyse nocturne marquerait des
 * accusés chaque nuit sans que personne ne l'ait décidé : c'est exactement le
 * risque, en automatique et sans témoin. Ce renoncement est écrit ici parce que
 * sans trace, quelqu'un rajoutera la tâche « par cohérence » avec synchro-inpi
 * et synchro-bodacc, qui n'ont pas cette conséquence.
 *
 * La seule vraie parade reste contractuelle : faire inscrire le couple
 * éditeur/logiciel sur la liste d'exclusion de marquage de jedeclare.
 */

import type { FastifyInstance, FastifyReply } from 'fastify';
import { config } from '../config.js';
import { requete } from '../db.js';
import { exigerAdmin, exigerSession } from '../gardes.js';
import { consommer } from '../limiteur.js';
import { TELEPROCEDURES, TYPES_PIECE, testerConnexion } from '../jedeclare/client.js';
import { analyserPeriode, compterTeletransmissions, construireSuivi } from '../jedeclare/suivi.js';
import {
  indexerClients,
  rapprocher,
  type ClientRapprochable,
  type NiveauRapprochement,
} from '../jedeclare/rapprochement.js';

/** Une analyse à la fois : deux administrateurs ne doivent pas marquer deux fois. */
let analyseEnCours = false;

const MOIS = /^\d{4}-(0[1-9]|1[0-2])$/;
const JOUR = /^\d{4}-\d{2}-\d{2}$/;
const STATUTS = new Set(['a_faire', 'en_cours', 'a_controler', 'valide', 'sans_objet']);

function indisponible(reply: FastifyReply): FastifyReply {
  return reply.code(503).send({
    message:
      'Suivi jedeclare non configure sur cette instance : renseignez JEDECLARE_LOGIN, ' +
      'JEDECLARE_MDP et JEDECLARE_EDITEUR dans le fichier .env.',
  });
}

function statutErreur(e: unknown): number {
  const brut = (e as { status?: number }).status;
  return typeof brut === 'number' && brut >= 400 && brut < 600 ? brut : 502;
}

interface LigneInterne {
  siren: string;
  type_declaration: string;
  mois: string;
  statut: string;
  commentaire: string | null;
  assignee_id: string | null;
  updated_at: string;
  client_id: string | null;
  rapprochement_manuel: boolean;
}

export function enregistrerRoutesJedeclare(app: FastifyInstance): void {
  /**
   * Le suivi, enrichi.
   *
   * Le pivot brut vient de `construireSuivi()` ; on y ajoute ici ce que
   * jedeclare ne peut pas savoir : le rattachement au portefeuille et le suivi
   * propre au cabinet. Les deux états restent dans des clés SÉPARÉES —
   * `jedeclare` et `interne` — pour que le contrat dise de lui-même ce qui est
   * en lecture seule et ce qui ne l'est pas.
   */
  app.get<{
    Querystring: { debut?: string; fin?: string; procedure?: string; axe?: string };
  }>('/api/jedeclare/suivi', async (request, reply) => {
    const session = await exigerSession(request, reply);
    if (!session) return;

    const { debut, fin, procedure, axe } = request.query;
    const pivot = await construireSuivi({
      debut: debut && JOUR.test(debut) ? debut : undefined,
      fin: fin && JOUR.test(fin) ? fin : undefined,
      procedure: procedure && procedure !== 'TOUTES' ? procedure : undefined,
      axe: axe === 'depot' ? 'depot' : 'periode',
    });

    const index = indexerClients(
      await requete<ClientRapprochable>(
        'SELECT id, siren, siret, numero_dossier, statut, nom_entreprise FROM clients'
      )
    );

    // Les dossiers du collaborateur, pour le filtre « mes dossiers ».
    const miens = new Set(
      (
        await requete<{ client_id: string }>(
          'SELECT client_id FROM client_collaborators WHERE user_id = $1',
          [session.sub]
        )
      ).map((l) => l.client_id)
    );

    const internes = new Map<string, LigneInterne>();
    /** Rattachements décidés à la main, indexés par société × type. */
    const manuels = new Map<string, string>();
    for (const l of await requete<LigneInterne>(
      `SELECT siren, type_declaration, mois, statut, commentaire, assignee_id,
              updated_at, client_id, rapprochement_manuel
         FROM jedeclare_suivi_interne WHERE axe = $1`,
      [pivot.axe]
    )) {
      internes.set(`${l.siren}|${l.type_declaration}|${l.mois}`, l);
      if (l.rapprochement_manuel && l.client_id) {
        manuels.set(`${l.siren}|${l.type_declaration}`, l.client_id);
      }
    }

    let sansClient = 0;
    const tables = pivot.tables.map((table) => ({
      typeDeclaration: table.typeDeclaration,
      libelle: table.libelle,
      // ⚠️ RECOPIER `nbLignes` ET `destinataires`, sous peine d'ecran blanc.
      //
      // Cette projection ne garde que ce qu'elle nomme. Les deux champs y
      // manquaient, alors que le front les declare OBLIGATOIRES dans son propre
      // type `TableSuivi` : `MatriceSuivi` faisait `liste.length` sur un
      // `destinataires` absent, levait un TypeError, et l'ecran de suivi
      // s'affichait en « Une erreur est survenue » — pour une reponse HTTP 200.
      //
      // Rien ne l'a rattrape : le type du front et celui du serveur sont
      // declares separement, et cette route ne declare pas son type de retour.
      // tsc validait donc les deux cotes d'un contrat qu'aucun des deux ne
      // faisait respecter. Constate en production le 2026-08-05.
      nbLignes: table.nbLignes,
      destinataires: table.destinataires,
      societes: table.societes.map((s) => {
        const auto = rapprocher(s, index);
        // Un rattachement fait à la main l'emporte sur la règle automatique :
        // quelqu'un a tranché, on ne le contredit pas à chaque lecture.
        const manuel = manuels.get(`${s.siren}|${table.typeDeclaration}`) ?? null;
        const clientId = manuel ?? auto.clientId;
        const rapprochement: NiveauRapprochement = manuel ? 'manuel' : auto.niveau;
        if (!clientId) sansClient += 1;

        return {
          societe: s.societe,
          siren: s.siren,
          siret: s.siret,
          dossier: s.dossier,
          clientId,
          clientNom: manuel ? null : auto.clientNom,
          rapprochement,
          monDossier: clientId ? miens.has(clientId) : false,
          cellules: Object.fromEntries(
            Object.entries(s.cellules).map(([mois, jedeclare]) => {
              const interne = internes.get(`${s.siren}|${table.typeDeclaration}|${mois}`);
              return [
                mois,
                {
                  jedeclare,
                  interne: interne
                    ? {
                        statut: interne.statut,
                        commentaire: interne.commentaire ?? '',
                        assigneeId: interne.assignee_id,
                        majLe: interne.updated_at,
                      }
                    : null,
                },
              ];
            })
          ),
        };
      }),
    }));

    return {
      axe: pivot.axe,
      mois: pivot.mois,
      nbDeclarations: pivot.nbDeclarations,
      nbEnCache: await compterTeletransmissions(),
      sansClient,
      configure: config.jedeclare.configure,
      tables,
    };
  });

  /** Ce que l'interface propose dans ses filtres. Aucun appel sortant. */
  app.get('/api/jedeclare/catalogue', async (request, reply) => {
    const session = await exigerSession(request, reply);
    if (!session) return;
    return {
      teleprocedures: TELEPROCEDURES,
      typesPiece: TYPES_PIECE,
      configure: config.jedeclare.configure,
    };
  });

  /**
   * Écriture d'une cellule de suivi interne.
   *
   * La clé est normalisée ICI, jamais reprise telle quelle du navigateur : une
   * seule implémentation, donc aucune dérive possible entre ce que l'écran
   * affiche et ce que la base garde.
   */
  app.put<{
    Body: {
      siren?: string;
      typeDeclaration?: string;
      mois?: string;
      axe?: string;
      statut?: string;
      commentaire?: string;
      societe?: string;
      siret?: string;
      dossier?: string;
      clientId?: string | null;
      rapprochementManuel?: boolean;
    };
  }>('/api/jedeclare/suivi-interne', async (request, reply) => {
    const session = await exigerSession(request, reply);
    if (!session) return;

    const b = request.body ?? {};
    const siren = String(b.siren ?? '').replace(/\D/g, '').slice(0, 9);
    const typeDeclaration = String(b.typeDeclaration ?? '').trim();
    const mois = String(b.mois ?? '').trim();
    const axe = b.axe === 'depot' ? 'depot' : 'periode';
    const statut = String(b.statut ?? '').trim();

    if (siren.length !== 9) {
      return reply.code(400).send({ message: 'SIREN attendu sur neuf chiffres.' });
    }
    if (!typeDeclaration) return reply.code(400).send({ message: 'typeDeclaration manquant.' });
    if (!MOIS.test(mois)) return reply.code(400).send({ message: 'mois attendu au format AAAA-MM.' });
    if (!STATUTS.has(statut)) return reply.code(400).send({ message: `statut inconnu : ${statut}.` });

    await requete(
      `INSERT INTO jedeclare_suivi_interne
         (siren, type_declaration, mois, axe, statut, commentaire, societe, siret, dossier,
          client_id, rapprochement_manuel, updated_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
       ON CONFLICT (siren, type_declaration, mois, axe) DO UPDATE SET
         statut = EXCLUDED.statut,
         commentaire = EXCLUDED.commentaire,
         societe = EXCLUDED.societe,
         client_id = COALESCE(EXCLUDED.client_id, jedeclare_suivi_interne.client_id),
         rapprochement_manuel =
           jedeclare_suivi_interne.rapprochement_manuel OR EXCLUDED.rapprochement_manuel,
         updated_by = EXCLUDED.updated_by`,
      [
        siren,
        typeDeclaration,
        mois,
        axe,
        statut,
        String(b.commentaire ?? ''),
        String(b.societe ?? ''),
        b.siret ?? null,
        b.dossier ?? null,
        b.clientId ?? null,
        b.rapprochementManuel === true,
        session.sub,
      ]
    );
    return reply.code(204).send();
  });

  /** Vérifie les identifiants sans rien marquer : lister ne marque pas. */
  app.post('/api/jedeclare/tester', async (request, reply) => {
    const session = await exigerAdmin(request, reply);
    if (!session) return;
    if (!config.jedeclare.configure) return indisponible(reply);
    try {
      return await testerConnexion();
    } catch (e) {
      return reply
        .code(statutErreur(e))
        .send({ message: e instanceof Error ? e.message : 'echec du test jedeclare' });
    }
  });

  /**
   * Alimente le cache.
   *
   * Les six garanties, dans l'ordre où elles s'appliquent :
   *   1. `exigerAdmin` — un bouton masqué dans l'interface n'en est pas une ;
   *   2. limitation de débit, trois par heure ;
   *   3. bornes obligatoires sur la période et sur le nombre de pièces ;
   *   4. verrou d'exécution unique ;
   *   5. journal d'audit écrit AVANT l'appel ;
   *   6. mode prudent FORCÉ, non débrayable depuis le CRM — sa seule exception
   *      se déclare compte par compte dans le `.env` du serveur, et l'audit du
   *      point 5 la nomme.
   */
  app.post<{
    Body: { debut?: string; fin?: string; procedure?: string; limite?: number };
  }>('/api/jedeclare/analyser', async (request, reply) => {
    const session = await exigerAdmin(request, reply);
    if (!session) return;
    if (!config.jedeclare.configure) return indisponible(reply);

    if (!consommer(`jedeclare.analyse:${request.ip}`, { max: 3, fenetreMs: 3_600_000 })) {
      return reply.code(429).header('retry-after', '3600').send({
        message: 'Trois analyses par heure au maximum : chacune marque des accuses chez jedeclare.',
      });
    }

    const b = request.body ?? {};
    const debut = String(b.debut ?? '');
    const fin = String(b.fin ?? '');
    if (!JOUR.test(debut) || !JOUR.test(fin)) {
      return reply.code(400).send({ message: 'debut et fin sont requis, au format AAAA-MM-JJ.' });
    }
    const etendue = Date.parse(`${fin}T00:00:00Z`) - Date.parse(`${debut}T00:00:00Z`);
    if (!Number.isFinite(etendue) || etendue < 0) {
      return reply.code(400).send({ message: 'Periode invalide.' });
    }
    if (etendue > 730 * 86_400_000) {
      return reply.code(400).send({ message: 'Periode limitee a deux ans.' });
    }

    if (analyseEnCours) {
      return reply.code(409).send({ message: 'Une analyse est deja en cours.' });
    }

    const limite = Math.min(Math.max(Math.trunc(Number(b.limite)) || 150, 1), 500);
    const procedure = b.procedure && b.procedure !== 'TOUTES' ? b.procedure : undefined;

    /**
     * L'audit est écrit AVANT l'appel, et c'est le point qui compte : si le
     * processus tombe ou si l'appel expire, le marquage a QUAND MÊME eu lieu
     * chez jedeclare. Une trace écrite après ne serait jamais écrite dans le
     * seul cas où elle sert à quelque chose.
     *
     * ⚠️ `prudent: true` NE SUFFIT PLUS À DÉCRIRE CE QUI SE PASSE : le `.env`
     * peut lever la prudence sur un compte que rien ne relève, et les accusés de
     * ce compte-là sont alors bel et bien marqués. La trace nomme donc les
     * comptes concernés — sans quoi l'audit d'une opération destructrice
     * affirmerait qu'elle ne l'était pas.
     */
    const marquageOuvertSur = config.jedeclare.comptes
      .filter((c) => c.marquageAutorise)
      .map((c) => c.login);
    await requete(
      'INSERT INTO audit_logs (user_id, action, entity_type, details) VALUES ($1, $2, $3, $4)',
      [
        session.sub,
        'jedeclare.analyse',
        'jedeclare',
        JSON.stringify({
          debut,
          fin,
          procedure: procedure ?? 'TOUTES',
          limite,
          prudent: true,
          marquageOuvertSur,
        }),
      ]
    );

    analyseEnCours = true;
    try {
      // `prudent: true` en dur, pas depuis le corps de la requête : le mode
      // approfondi lit des accusés que le logiciel de production du cabinet n'a
      // pas encore vus. Il reste accessible en ligne de commande, à qui sait ce
      // qu'il fait.
      return await analyserPeriode({ debut, fin, procedure, limite, prudent: true });
    } catch (e) {
      return reply
        .code(statutErreur(e))
        .send({ message: e instanceof Error ? e.message : 'echec de l analyse jedeclare' });
    } finally {
      analyseEnCours = false;
    }
  });
}
