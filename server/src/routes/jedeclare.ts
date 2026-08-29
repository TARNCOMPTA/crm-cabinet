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
 * UNE TÂCHE PLANIFIÉE EXISTE — `suivi-echeances-jedeclare`, chaque nuit à 2h.
 *
 * Ce commentaire a longtemps dit l'inverse, et affirmait que `planificateur.ts`
 * n'avait pas été touché. C'était vrai, et ce ne l'est plus : le raisonnement
 * est écrit en entier au-dessus de la tâche elle-même, et c'est là qu'il faut le
 * lire avant d'y toucher.
 *
 * Ce qui a rendu la tâche acceptable, en un mot : elle force le mode PRUDENT,
 * qui ne lit que les accusés DÉJÀ marqués récupérés. Leur lecture ne retire donc
 * rien au logiciel de production du cabinet — il consomme, puis nous recopions.
 * Le prix à payer est un retard d'un jour ou deux sur les toutes dernières
 * déclarations, et c'est le bon prix.
 *
 * ⚠️ L'EXCEPTION VAUT POUR LA NUIT AUSSI. Un compte dont le `.env` lève la
 * prudence (`JEDECLARE_MARQUAGE_AUTORISE{suffixe}`) verra ses accusés marqués
 * par cette tâche, sans que personne ne clique. Le réglage n'existe que pour un
 * compte qu'aucun logiciel ne relève, où le marquage ne prive personne — mais
 * qui l'active l'active aussi pour 2h du matin.
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
  estHorsPortefeuille,
  indexerClients,
  rapprocher,
  type ClientRapprochable,
  type NiveauRapprochement,
} from '../jedeclare/rapprochement.js';
import { echeanceTva, type ClientEcheance } from '../jedeclare/echeance.js';

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
    // Plus de `procedure` ici : le suivi ne se filtre plus par téléprocédure.
    // L'ANALYSE garde la sienne (voir plus bas) et c'est une autre affaire —
    // elle borne ce qu'on va CHERCHER chez jedeclare, donc ce qu'on va marquer,
    // là où celle-ci ne bornait qu'un affichage.
    Querystring: { debut?: string; fin?: string; axe?: string };
  }>('/api/jedeclare/suivi', async (request, reply) => {
    const session = await exigerSession(request, reply);
    if (!session) return;

    const { debut, fin, axe } = request.query;
    const axeChoisi = axe === 'depot' ? 'depot' : 'periode';

    // ⚠️ LE PORTEFEUILLE SE LIT AVANT LE PIVOT, et non plus apres. C'est lui qui
    // dit quels dossiers ont quitte le cabinet, et cette exclusion doit
    // s'appliquer a la source pour que les totaux ne comptent pas ce que la
    // grille n'affiche pas.
    //
    // La meme lecture sert trois besoins : rapprocher les societes, calculer leur
    // jour d'echeance TVA, et reperer les dossiers partis. Le portefeuille tient
    // en une passe plutot qu'en trois requetes.
    const clients = await requete<
      ClientRapprochable & ClientEcheance & { id: string; date_sortie_cabinet: string | null }
    >(
      `SELECT id, siren, siret, numero_dossier, statut, nom_entreprise,
              type_personne, forme_juridique, nom, tva_jour_echeance,
              date_sortie_cabinet
         FROM clients`
    );
    const index = indexerClients(clients);
    const parId = new Map(clients.map((c) => [c.id, c]));

    /**
     * Les fiches qui ne sont plus du travail a faire : sorties, archivees ou
     * inactives. La regle et ses raisons sont dans `estHorsPortefeuille`
     * (jedeclare/rapprochement.ts), partagee avec l'outil MCP pour que l'ecran
     * et l'assistant ne lisent jamais deux portefeuilles differents.
     */
    const horsPortefeuille = new Set(clients.filter(estHorsPortefeuille).map((c) => c.id));

    /** Rattachements decides a la main, indexes par societe × type. */
    const manuels = new Map<string, string>();
    const internes = new Map<string, LigneInterne>();
    for (const l of await requete<LigneInterne>(
      `SELECT siren, type_declaration, mois, statut, commentaire, assignee_id,
              updated_at, client_id, rapprochement_manuel
         FROM jedeclare_suivi_interne WHERE axe = $1`,
      [axeChoisi]
    )) {
      internes.set(`${l.siren}|${l.type_declaration}|${l.mois}`, l);
      if (l.rapprochement_manuel && l.client_id) {
        manuels.set(`${l.siren}|${l.type_declaration}`, l.client_id);
      }
    }

    /**
     * La fiche a laquelle une societe se rattache, rattachement manuel compris.
     *
     * Ecrite une fois et memorisee : elle sert au filtrage ligne a ligne, donc
     * potentiellement des milliers de fois, la ou le nombre de societes
     * distinctes se compte en centaines.
     */
    const cacheClient = new Map<string, string | null>();
    const clientDe = (s: { siren: string; siret: string; dossier: string }, type: string) => {
      const cle = `${s.siren}|${s.siret}|${s.dossier}|${type}`;
      if (!cacheClient.has(cle)) {
        cacheClient.set(cle, manuels.get(`${s.siren}|${type}`) ?? rapprocher(s, index).clientId);
      }
      return cacheClient.get(cle)!;
    };

    const pivot = await construireSuivi({
      debut: debut && JOUR.test(debut) ? debut : undefined,
      fin: fin && JOUR.test(fin) ? fin : undefined,
      axe: axeChoisi,
      // Une societe non rapprochee n'est JAMAIS ecartee : on ne sait pas si elle
      // est sortie, et c'est precisement le signal que cet ecran doit montrer —
      // elle teledeclare sans exister au portefeuille.
      exclure: (l) => {
        const id = clientDe(l, l.type_declaration || '(type non précisé)');
        return id !== null && horsPortefeuille.has(id);
      },
    });

    // Les dossiers du collaborateur, pour le filtre « mes dossiers ».
    const miens = new Set(
      (
        await requete<{ client_id: string }>(
          'SELECT client_id FROM client_collaborators WHERE user_id = $1',
          [session.sub]
        )
      ).map((l) => l.client_id)
    );

    // `internes` et `manuels` sont lus plus haut : l'exclusion des dossiers
    // sortis en a besoin AVANT le pivot, un rattachement fait a la main pouvant
    // designer une fiche sortie que le rapprochement automatique ignorerait.

    let sansClient = 0;
    const tables = pivot.tables.map((table) => ({
      // ⚠️ `famille` ET `cle` FONT PARTIE DES CHAMPS À RECOPIER, au même titre
      // que les deux signalés plus bas. `famille` désigne l'ONGLET — TVA, Bilan,
      // Autres —, `cle` la PASTILLE à l'intérieur, depuis que la TVA se divise
      // en trois tableaux partageant un même `typeDeclaration`. Sans l'une ou
      // sans l'autre, le front n'a plus rien de sélectionnable et la page reste
      // vide.
      //
      // C'est la TROISIÈME fois que cette projection oublie un champ. La cause
      // n'a pas changé et est expliquée plus bas : elle ne garde que ce qu'elle
      // nomme, et rien — surtout pas `tsc` — ne l'y oblige.
      famille: table.famille,
      cle: table.cle,
      typeDeclaration: table.typeDeclaration,
      estTva: table.estTva,
      periodicite: table.periodicite,
      // ⚠️ `decoupage` EST DU MÊME LOT, et son oubli est le plus sournois de
      // tous : le front retomberait sur « mois » sans rien casser, et l'écran
      // afficherait de nouveau douze colonnes vides pour une liasse annuelle.
      // Aucune erreur, aucune page blanche — juste la grille d'avant, revenue
      // en silence. C'est pourquoi le type du front le déclare OBLIGATOIRE :
      // c'est le seul endroit où l'oubli redevient visible.
      decoupage: table.decoupage,
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
          // Le jour du calendrier CA3, ou l'aveu qu'on ne le sait pas. Calculé
          // par société et non par cellule : il ne dépend pas du mois. `null`
          // hors TVA — une liasse fiscale n'a pas d'échéance mensuelle, et un
          // tiret sur chacune de ses lignes ne serait que du bruit.
          echeance: table.estTva
            ? echeanceTva(clientId ? (parId.get(clientId) ?? null) : null, table.periodicite ?? null)
            : null,
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

  /**
   * La surcharge du jour d'échéance TVA, posée ou retirée sur une fiche client.
   *
   * Écrit dans `clients` et non dans `jedeclare_suivi_interne` : le jour est un
   * attribut du redevable, pas d'une cellule du suivi. Le ranger par mois
   * obligerait à le ressaisir à chaque période, et le suivi interne se purge
   * avec la fenêtre affichée alors que cet arbitrage doit survivre.
   *
   * `jour: null` REMET LA RÈGLE EN VIGUEUR — il fallait pouvoir défaire un
   * arbitrage sans passer par la base, sinon une valeur posée par erreur reste
   * pour toujours.
   */
  app.put<{ Body: { clientId?: string; jour?: number | null } }>(
    '/api/jedeclare/jour-echeance',
    async (request, reply) => {
      const session = await exigerSession(request, reply);
      if (!session) return;

      const b = request.body ?? {};
      const clientId = String(b.clientId ?? '').trim();
      if (!/^[0-9a-f-]{36}$/i.test(clientId)) {
        return reply.code(400).send({ message: 'clientId attendu.' });
      }

      const brut = b.jour;
      // `null` et `undefined` disent la même chose — retirer la surcharge — et
      // le front n'a pas à choisir lequel envoyer pour un champ vidé.
      const jour = brut == null ? null : Number(brut);
      if (jour !== null && (!Number.isInteger(jour) || jour < 1 || jour > 31)) {
        return reply.code(400).send({ message: 'jour attendu entre 1 et 31, ou null.' });
      }

      const lignes = await requete<{ id: string }>(
        'UPDATE clients SET tva_jour_echeance = $1 WHERE id = $2 RETURNING id',
        [jour, clientId]
      );
      if (!lignes.length) return reply.code(404).send({ message: 'Fiche client introuvable.' });
      return reply.code(204).send();
    }
  );

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
