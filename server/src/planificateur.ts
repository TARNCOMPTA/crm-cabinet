/**
 * Ordonnanceur interne.
 * ---------------------------------------------------------------------------
 * Remplace les neuf tâches `pg_cron` de l'installation Supabase.
 *
 * Pourquoi ne pas garder pg_cron : les tâches n'appelaient pas du SQL, elles
 * faisaient des `net.http_post` vers des Edge Functions. Chaque exécution
 * traversait donc pg_net, HTTP, le runtime Deno, puis rouvrait une connexion à
 * la base — pour, au bout du compte, lire une table. Ici tout est dans le
 * processus qui a déjà le pool ouvert.
 *
 * Deuxième raison, décisive pour un produit distribué : pg_cron et pg_net sont
 * des extensions à installer et à configurer (dont l'URL de l'instance et un
 * secret stockés dans `vault`). Un cabinet qui installe le produit n'a pas à
 * savoir que ces extensions existent.
 *
 * Fonctionnement : un battement par minute, et chaque tâche déclare quand elle
 * est due. C'est grossier — la granularité est la minute — mais aucune de ces
 * tâches n'a besoin de mieux, et il n'y a pas d'analyseur d'expression cron à
 * écrire ni de dépendance à ajouter.
 */

import type { FastifyBaseLogger } from 'fastify';
import { requete } from './db.js';
import { viderFile } from './file-emails.js';
import { reglagesSynchro, synchroniserTousLesClients } from './routes/inpi.js';
import { synchroniserTous as synchroniserBodacc } from './bodacc.js';
import { analyserPeriode } from './jedeclare/suivi.js';
import { verifierLot } from './tva-verification.js';
import { config } from './config.js';

/** Une ligne de `taches_planifiees`, telle que la requête la demande. */
interface LigneSuivi {
  nom: string;
  derniere_execution: string;
  dernier_succes: string | null;
  duree_ms: number;
  statut: 'succes' | 'echec';
  detail: string | null;
}

/** Vrai quand la tâche est due à cette minute-là. */
type EstDue = (d: Date) => boolean;

interface Tache {
  nom: string;
  /** Décrit l'intention en clair : c'est ce que lit celui qui débogue. */
  quand: string;
  estDue: EstDue;
  /** Reçoit le journal du serveur : certaines tâches ont besoin de tracer. */
  executer: (journal: FastifyBaseLogger) => Promise<string | void>;
}

const chaqueMinutes = (n: number): EstDue => (d) => d.getMinutes() % n === 0;
const chaqueJourA = (heure: number, minute = 0): EstDue => (d) =>
  d.getHours() === heure && d.getMinutes() === minute;
const chaqueHeureA = (minute: number): EstDue => (d) => d.getMinutes() === minute;
/** Dimanche, pour les purges qui n'ont aucune raison de tourner en semaine. */
const chaqueDimancheA = (heure: number): EstDue => (d) =>
  d.getDay() === 0 && d.getHours() === heure && d.getMinutes() === 0;

/**
 * Les tâches, dans l'ordre où elles tournaient sous pg_cron.
 *
 * Les trois `trigger_*_sync` d'origine étaient des appels HTTP vers les Edge
 * Functions de synchronisation ; `synchro-inpi` les remplace en appelant
 * directement le module porté. Une différence à connaître : la tâche relit
 * `sync_settings` à chaque tour, donc activer ou couper la synchronisation
 * depuis l'interface prend effet sans redémarrage.
 *
 * Deux tâches ont disparu sans remplacement. `process_cabinet_lifecycle`
 * gérait les essais et les suspensions des cabinets clients du SaaS : une
 * instance est à un seul cabinet, qui n'a personne à qui payer un abonnement.
 * La purge de `chat_rate_limits` est partie avec la table, supprimée en même
 * temps que l'assistant IA.
 */
const TACHES: Tache[] = [
  {
    nom: 'emails-en-attente',
    quand: 'toutes les 2 minutes',
    estDue: chaqueMinutes(2),
    executer: async () => {
      const b = await viderFile();
      // Silence quand il n'y a rien à faire : 720 lignes de journal par jour
      // pour dire « file vide » noieraient le reste.
      if (b.total === 0) return;
      return `${b.envoyes} envoye(s), ${b.echecs} echec(s)`;
    },
  },
  {
    nom: 'digests-email',
    quand: 'tous les jours a 6h',
    estDue: chaqueJourA(6),
    executer: async () => {
      // L'URL publique est passee en parametre, et non ecrite dans la fonction
      // SQL : PostgreSQL ne peut pas la deviner, et un courriel n'a pas
      // d'origine — ses liens doivent etre absolus. Elle etait figee sur le
      // domaine de l'ancienne plateforme, donc chaque digest partait avec des
      // liens morts (voir schema/increments/004-liens-absolus-des-emails.sql).
      await requete('SELECT process_email_digest($1)', [config.publicUrl]);
    },
  },
  {
    nom: 'archivage-taches-terminees',
    quand: 'tous les jours a 2h',
    estDue: chaqueJourA(2),
    executer: async () => {
      await requete('SELECT auto_archive_done_tasks()');
    },
  },
  {
    nom: 'synchro-inpi',
    quand: 'toutes les heures a :45, si activee dans les parametres',
    estDue: chaqueHeureA(45),
    executer: async (journal) => {
      // Le réglage est lu à chaque tour, pas au démarrage : l'administrateur
      // peut activer ou couper la synchronisation depuis l'interface sans
      // redémarrer l'instance.
      const r = await reglagesSynchro();
      if (!r?.actif) return;

      // `frequency` et `sync_hour` viennent de l'écran de paramètres. En
      // quotidien on ne tourne qu'à l'heure choisie ; l'appel horaire sert au
      // rattrapage d'une instance qui aurait été éteinte.
      const maintenant = new Date();
      if (r.frequence === 'daily' && maintenant.getHours() !== r.heure) return;
      if (r.frequence === 'weekly' && (maintenant.getDay() !== 1 || maintenant.getHours() !== r.heure)) return;
      if (r.frequence === 'monthly' && (maintenant.getDate() !== 1 || maintenant.getHours() !== r.heure)) return;

      const b = await synchroniserTousLesClients(journal);
      return b.message;
    },
  },
  {
    /**
     * Suivi des échéances : les accusés de la veille.
     *
     * ⚠️ CETTE TÂCHE A D'ABORD ÉTÉ REFUSÉE, ET IL FAUT SAVOIR POURQUOI ELLE
     * EXISTE MAINTENANT.
     *
     * Lire un accusé le MARQUE « récupéré » chez jedeclare : le logiciel avec
     * lequel le cabinet dépose ses flux peut alors ne plus le voir comme
     * nouveau. Une tâche nocturne prenait ce risque chaque nuit sans que
     * personne ne l'ait décidé — c'est exactement ce qu'on refusait.
     *
     * CE QUI A CHANGÉ : le mode PRUDENT, ici non débrayable, ne lit que les
     * accusés DÉJÀ marqués récupérés. Leur lecture ne change donc plus rien, et
     * le logiciel de production garde la main : il consomme, puis nous
     * recopions. Mesuré sur le compte réel le 2026-08-03 — 2 165 accusés sur un
     * an, tous déjà récupérés, aucun en attente.
     *
     * ⚠️ LA SEULE EXCEPTION VAUT ICI AUSSI, et il faut le savoir avant de la
     * poser : un compte dont le `.env` lève la prudence
     * (`JEDECLARE_MARQUAGE_AUTORISE{suffixe}`) verra ses accusés lus — donc
     * marqués — par CETTE tâche, chaque matin, sans que personne ne clique. Ce
     * n'est pas un oubli : le réglage n'existe que pour un compte qu'aucun
     * logiciel ne relève, où le marquage ne prive personne de rien. Mais celui
     * qui l'active doit savoir qu'il l'active aussi pour la nuit.
     *
     * Conséquence à accepter : un accusé arrivé cette nuit n'entre au cache que
     * lorsque le logiciel de production l'a consommé. Le suivi accuse donc un
     * retard d'un jour ou deux sur les toutes dernières déclarations. C'est le
     * prix de la sûreté, et c'est le bon prix.
     *
     * LA FENÊTRE REMONTE À SEPT JOURS, pas seulement à la veille — et elle y
     * reste alors même que le cabinet a demandé « les accusés de la veille ».
     * La veille est évidemment couverte ; ce sont les six jours d'avant qui
     * comptent. Un accusé n'entre au cache que lorsque le logiciel de production
     * l'a consommé, et rien ne garantit qu'il le fasse le jour même : celui
     * consommé le mardi pour une déclaration de vendredi ne serait jamais vu par
     * une fenêtre d'un jour. Manqué une fois, manqué pour toujours.
     *
     * Le surcoût est nul : le cache est incrémental, repasser sur une semaine ne
     * coûte qu'une liste — les pièces déjà connues ne sont jamais relues, donc
     * jamais remarquées.
     *
     * ---------------------------------------------------------------------------
     * 2H DU MATIN, ET C'EST BIEN 2H EN FRANCE
     *
     * `estDue` compare l'heure LOCALE du conteneur. L'image Alpine tourne en UTC
     * par défaut, ce qui décalait tous les libellés de une à deux heures selon la
     * saison. Le Dockerfile pose donc `TZ=Europe/Paris` et installe `tzdata`,
     * sans lequel la variable serait ignorée en silence.
     */
    nom: 'suivi-echeances-jedeclare',
    quand: 'tous les jours a 2h',
    estDue: chaqueJourA(2),
    executer: async (journal) => {
      if (!config.jedeclare.configure) return;

      const jour = (decalage: number): string =>
        new Date(Date.now() - decalage * 86_400_000).toISOString().slice(0, 10);

      const b = await analyserPeriode({
        debut: jour(7),
        fin: jour(0),
        // `prudent` FORCÉ : c'est toute la raison pour laquelle cette tâche est
        // acceptable. Ne pas le rendre configurable — la seule dérogation, par
        // compte, se lit dans le `.env` du serveur (voir ci-dessus).
        prudent: true,
        limite: 400,
      });

      journal.info(
        { ...b },
        `[jedeclare] ${b.analysees} accuse(s) analyse(s), ${b.declarationsEnregistrees} declaration(s)`
      );

      if (b.restantes > 0) {
        // Le plafond a mordu : le prochain passage prendra la suite, mais on le
        // dit — un retard qui s'installe doit se voir.
        journal.warn(`[jedeclare] ${b.restantes} accuse(s) restant(s) : la limite de 400 a ete atteinte.`);
      }

      return `${b.analysees} accuse(s), ${b.declarationsEnregistrees} declaration(s)` +
        (b.ecarteesPrudence > 0 ? `, ${b.ecarteesPrudence} ecarte(s) par prudence` : '') +
        (b.illisibles > 0 ? `, ${b.illisibles} illisible(s)` : '');
    },
  },
  {
    /**
     * Vérification périodique des numéros de TVA intracommunautaire.
     *
     * ⚠️ CETTE TÂCHE A ÉTÉ REFUSÉE PAR ÉCRIT AVANT D'ÊTRE ÉCRITE, et il faut
     * savoir pourquoi elle existe. `routes/tva.ts` portait : « ne pas ajouter de
     * tâche pour tenir les statuts à jour — un statut périmé est visible et sans
     * conséquence, un appel sortant que personne n'a demandé ne l'est pas ».
     *
     * CE QUI A CHANGÉ : l'argument du cabinet, qui est meilleur. Un numéro
     * intracommunautaire se DÉSACTIVE sans prévenir personne — radiation,
     * changement de régime, passage en franchise. Facturer sans TVA sur un
     * numéro devenu inactif se paie au contrôle, et le statut périmé n'est
     * « visible » que si quelqu'un ouvre la fiche : donc jamais, sur les dossiers
     * qu'on ne touche pas. C'est exactement là que le risque se loge.
     *
     * TROIS PRUDENCES, dont deux gouvernées par `tva-lot.ts` :
     *
     *   · UN LOT PAR JOUR, dimensionné pour couvrir tout le portefeuille en
     *     trente jours — et plafonné, quitte à ne pas tenir le mois sur un
     *     très gros cabinet. La tâche le dit alors dans son compte rendu.
     *   · CINQ SECONDES ENTRE DEUX APPELS. On n'est jamais le client bruyant
     *     d'un service que la Commission offre gratuitement.
     *   · ARRÊT AUTOMATIQUE après cinq indisponibilités d'affilée : le service
     *     est en panne, ou c'est nous qu'il refuse. Dérouler le lot dans ce cas
     *     est précisément ce qui fait passer d'une saturation à un blocage.
     *
     * 3H DU MATIN, après `suivi-echeances-jedeclare` (2h) : les deux sont
     * longues, et les enchaîner vaut mieux que les croiser. L'heure est LOCALE
     * (`TZ=Europe/Paris` dans le Dockerfile).
     */
    nom: 'verification-tva-vies',
    quand: 'tous les jours a 3h, un lot espace, sauf si VIES_PERIODIQUE_DISABLED',
    estDue: chaqueJourA(3),
    executer: async (journal) => {
      if (config.vies.desactivee) return 'VIES desactive sur cette instance';
      if (config.vies.periodiqueDesactivee) return 'verification periodique desactivee';

      const b = await verifierLot(journal);
      if (b.examines === 0) return 'aucune fiche a verifier';

      if (!b.cycleTenu) {
        // Le plafond mord : le portefeuille ne sera pas couvert en trente jours.
        // Un retard qui s'installe doit se voir, pas se deviner.
        journal.warn(
          `[tva] ${b.eligibles} fiches eligibles : le plafond de lot ne permet pas ` +
            'de toutes les verifier en trente jours.'
        );
      }

      return `${b.examines} numero(s) : ${b.valides} valide(s), ${b.invalides} non actif(s), ` +
        `${b.indisponibles} indisponible(s)` + (b.interrompu ? ', lot interrompu' : '');
    },
  },
  {
    nom: 'synchro-bodacc',
    quand: 'le dimanche a 5h',
    estDue: chaqueDimancheA(5),
    executer: async (journal) => {
      // Hebdomadaire et non horaire : les dépôts de comptes au BODACC sont
      // annuels par nature. L'original tournait toutes les heures, ce qui
      // interrogeait l'API des milliers de fois par an pour trouver, au mieux,
      // une nouveauté par client et par an.
      const b = await synchroniserBodacc(journal);
      return `${b.traites}/${b.total} client(s), ${b.nouveaux} nouveau(x) depot(s)` +
        (b.erreurs > 0 ? `, ${b.erreurs} erreur(s)` : '');
    },
  },
  {
    nom: 'purge-file-emails',
    quand: 'le dimanche a 4h',
    estDue: chaqueDimancheA(4),
    executer: async () => {
      // On ne purge que ce qui est traité. Les 'pending' restent, même vieux :
      // ils signalent un SMTP en panne, et les effacer masquerait le problème.
      const r = await requete<{ n: string }>(
        `WITH s AS (
           DELETE FROM email_queue
            WHERE status IN ('sent', 'error')
              AND created_at < now() - interval '30 days'
           RETURNING 1
         )
         SELECT count(*)::text AS n FROM s`
      );
      const n = Number(r[0]?.n ?? 0);
      if (n === 0) return;
      return `${n} ligne(s) purgee(s)`;
    },
  },
  {
    /**
     * Ramasse les synchronisations mortes.
     *
     * LE CYCLE DE VIE D'UNE TÂCHE APPARTIENT AU NAVIGATEUR : c'est lui qui
     * insère la ligne (`startJob`), puis qui la clôt depuis une promesse
     * détachée — voir `INPISyncButton`, `SyncSettingsPanel` et `Legal.tsx`.
     * Fermer l'onglet, recharger la page ou perdre le réseau au milieu suffit
     * donc à laisser une ligne en « running » que PLUS RIEN ne clôturera.
     *
     * `purge-taches-de-synchro`, juste en dessous, ne ramasse que les tâches
     * TERMINÉES : une tâche morte y échappait, et restait en base à vie. Comme
     * l'indicateur de l'en-tête tourne tant qu'il reste une tâche active, une
     * seule ligne oubliée faisait tourner la roue indéfiniment, pour tout le
     * monde, à chaque chargement de page.
     *
     * Deux heures : une synchronisation INPI de tout le portefeuille est longue,
     * et déclarer morte une tâche encore vivante réécrirait un état faux. Le
     * seuil se compte depuis `updated_at`, pas depuis `created_at` : une tâche
     * qui progresse encore touche cette colonne.
     */
    nom: 'ramasse-taches-de-synchro-mortes',
    quand: 'toutes les 10 minutes',
    estDue: chaqueMinutes(10),
    executer: async () => {
      const r = await requete<{ n: string }>(
        `WITH s AS (
           UPDATE sync_jobs
              SET status = 'error',
                  message = 'Interrompue : le navigateur qui la pilotait ne repond plus.',
                  finished_at = now(),
                  updated_at = now()
            WHERE status IN ('pending', 'running')
              AND updated_at < now() - interval '2 hours'
           RETURNING 1
         )
         SELECT count(*)::text AS n FROM s`
      );
      const n = Number(r[0]?.n ?? 0);
      if (n === 0) return;
      return `${n} tache(s) morte(s) close(s)`;
    },
  },
  {
    nom: 'purge-taches-de-synchro',
    quand: 'le dimanche a 4h',
    estDue: chaqueDimancheA(4),
    executer: async () => {
      const r = await requete<{ n: string }>(
        `WITH s AS (
           DELETE FROM sync_jobs
            WHERE status IN ('success', 'partial', 'error')
              AND finished_at < now() - interval '30 days'
           RETURNING 1
         )
         SELECT count(*)::text AS n FROM s`
      );
      const n = Number(r[0]?.n ?? 0);
      if (n === 0) return;
      return `${n} tache(s) purgee(s)`;
    },
  },
];

/**
 * Tâches en cours, par nom.
 *
 * Une synchronisation INPI peut dépasser l'heure ; sans ce garde-fou le
 * battement suivant en lancerait une deuxième en parallèle, et les deux
 * écriraient dans les mêmes lignes.
 */
const enCours = new Set<string>();

let battement: NodeJS.Timeout | null = null;
/** Minute déjà traitée, pour ne pas rejouer une tâche si un battement dérive. */
let derniereMinute = '';

/**
 * Consigne ce qu'a donné un tour, dans `taches_planifiees`.
 *
 * POURQUOI EN BASE PLUTÔT QU'EN MÉMOIRE : chaque mise à jour recrée le
 * conteneur, et un suivi gardé dans le processus repartirait de zéro à chaque
 * déploiement — précisément au moment où l'on veut vérifier que la nuit s'est
 * bien passée.
 *
 * ⚠️ CETTE ÉCRITURE NE DOIT JAMAIS FAIRE ÉCHOUER LA TÂCHE QU'ELLE OBSERVE. Une
 * base momentanément indisponible ferait alors passer pour rate un travail qui a
 * abouti — et, pour `emails-en-attente`, ferait croire que les courriels ne
 * partent pas. L'échec est donc journalisé, pas propagé.
 *
 * `dernier_succes` n'est écrasé que par un succès : `COALESCE` garde le
 * précédent quand ce tour-ci a échoué. C'est ce qui permet de lire « échec ce
 * matin, mais ça marchait hier » au lieu de perdre la seule information utile.
 */
async function consignerExecution(
  nom: string,
  reussi: boolean,
  dureeMs: number,
  detail: string | null,
  log: FastifyBaseLogger
): Promise<void> {
  try {
    await requete(
      `INSERT INTO taches_planifiees (nom, derniere_execution, dernier_succes, duree_ms, statut, detail)
       VALUES ($1, now(), CASE WHEN $2 THEN now() ELSE NULL END, $3, $4, $5)
       ON CONFLICT (nom) DO UPDATE SET
         derniere_execution = now(),
         dernier_succes = CASE WHEN $2 THEN now() ELSE taches_planifiees.dernier_succes END,
         duree_ms = EXCLUDED.duree_ms,
         statut = EXCLUDED.statut,
         detail = EXCLUDED.detail`,
      [nom, reussi, dureeMs, reussi ? 'succes' : 'echec', detail]
    );
  } catch (e) {
    log.error(`[cron] ${nom} : suivi non enregistre — ${e instanceof Error ? e.message : String(e)}`);
  }
}

async function executerTache(t: Tache, log: FastifyBaseLogger): Promise<void> {
  if (enCours.has(t.nom)) {
    log.warn(`[cron] ${t.nom} : execution precedente encore en cours, tour passe`);
    return;
  }
  enCours.add(t.nom);
  const debut = Date.now();
  let reussi = true;
  let compteRendu: string | null = null;
  try {
    const detail = await t.executer(log);
    compteRendu = detail || null;
    if (detail) {
      log.info(`[cron] ${t.nom} : ${detail} (${Date.now() - debut} ms)`);
    }
  } catch (e) {
    // Une tâche qui échoue ne doit jamais arrêter l'ordonnanceur : le processus
    // sert aussi l'application.
    reussi = false;
    compteRendu = e instanceof Error ? e.message : String(e);
    log.error(`[cron] ${t.nom} : ${compteRendu}`);
  } finally {
    enCours.delete(t.nom);
    await consignerExecution(t.nom, reussi, Date.now() - debut, compteRendu, log);
  }
}

function battre(log: FastifyBaseLogger): void {
  const maintenant = new Date();
  const cle = `${maintenant.getHours()}:${maintenant.getMinutes()}`;
  if (cle === derniereMinute) return;
  derniereMinute = cle;

  for (const t of TACHES) {
    if (t.estDue(maintenant)) void executerTache(t, log);
  }
}

export function demarrerPlanificateur(log: FastifyBaseLogger): void {
  if (battement) return;

  // Battement à 20 s : plus court que la minute, pour qu'une dérive de la
  // boucle d'événements ne fasse pas sauter une minute entière. `derniereMinute`
  // évite les doubles exécutions que cela impliquerait.
  battement = setInterval(() => battre(log), 20_000);
  battement.unref?.();

  log.info(`[cron] ordonnanceur demarre, ${TACHES.length} taches :`);
  for (const t of TACHES) log.info(`[cron]   ${t.nom} — ${t.quand}`);
}

export function arreterPlanificateur(): void {
  if (battement) {
    clearInterval(battement);
    battement = null;
  }
}

export interface EtatTache {
  nom: string;
  quand: string;
  enCours: boolean;
  derniereExecution: string | null;
  dernierSucces: string | null;
  dureeMs: number | null;
  statut: 'succes' | 'echec' | null;
  detail: string | null;
}

/**
 * L'état des tâches pour l'écran d'administration : ce qu'elles sont, et ce
 * qu'a donné leur dernier tour.
 *
 * `enCours` VIENT DE LA MÉMOIRE, le reste de la base, et ce mélange est voulu.
 * « En cours » ne vaut que pour CE processus — après un redémarrage, une tâche
 * qui tournait n'est plus en cours nulle part, et la lire en base ferait croire
 * l'inverse indéfiniment.
 *
 * Une tâche sans ligne (jamais lancée depuis la mise en place du suivi, ou
 * jamais due) rend des `null` : l'écran distingue ainsi « pas encore tournée »
 * de « tournée sans rien à dire ».
 */
export async function listerTaches(): Promise<EtatTache[]> {
  let suivi = new Map<string, LigneSuivi>();
  try {
    const lignes = await requete<LigneSuivi>(
      `SELECT nom, derniere_execution, dernier_succes, duree_ms, statut, detail
         FROM taches_planifiees`
    );
    suivi = new Map(lignes.map((l) => [l.nom, l]));
  } catch {
    // L'écran doit rester consultable meme si le suivi est illisible : sans
    // cela, une table absente rendrait la page entiere inutilisable alors
    // qu'elle sait deja dire ce que sont les taches et lesquelles tournent.
  }

  return TACHES.map((t) => {
    const l = suivi.get(t.nom);
    return {
      nom: t.nom,
      quand: t.quand,
      enCours: enCours.has(t.nom),
      derniereExecution: l?.derniere_execution ?? null,
      dernierSucces: l?.dernier_succes ?? null,
      dureeMs: l?.duree_ms ?? null,
      statut: l?.statut ?? null,
      detail: l?.detail ?? null,
    };
  });
}

/** Déclenche une tâche à la demande, depuis l'interface d'administration. */
export async function declencher(nom: string, log: FastifyBaseLogger): Promise<boolean> {
  const t = TACHES.find((x) => x.nom === nom);
  if (!t) return false;
  await executerTache(t, log);
  return true;
}
