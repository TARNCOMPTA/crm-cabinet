-- Suivi de la dernière exécution des tâches planifiées.
-- ===========================================================================
-- L'ordonnanceur (`server/src/planificateur.ts`) fait tourner neuf tâches, dont
-- la récupération jedeclare de 2 h et les digests de 6 h. Jusqu'ici son seul
-- témoignage était le journal du serveur : pour savoir si la tâche de la nuit
-- avait fonctionné, il fallait ouvrir un terminal sur le serveur et lire des
-- lignes noyées dans le reste.
--
-- ---------------------------------------------------------------------------
-- POURQUOI EN BASE, ET PAS EN MÉMOIRE
--
-- Garder l'information dans le processus aurait évité cette table. Mais CHAQUE
-- MISE À JOUR RECRÉE LE CONTENEUR (`docker compose up -d --build`) : le suivi
-- serait reparti à zéro à chaque déploiement — et c'est précisément après un
-- déploiement qu'on veut vérifier que la nuit s'est bien passée. Un suivi qui
-- s'efface au moment où l'on en a besoin n'en est pas un.
--
-- ---------------------------------------------------------------------------
-- UNE LIGNE PAR TÂCHE, PAS UN JOURNAL
--
-- La clé est le NOM de la tâche. La question à laquelle cette table répond est
-- « la tâche de 2 h a-t-elle tourné cette nuit, et bien ? ». Un historique
-- complet demanderait une purge — `emails-en-attente` tourne 720 fois par jour
-- — et personne ne relit sa 400e exécution.
--
-- `dernier_succes` est distinct de `derniere_execution` À DESSEIN : pour une
-- tâche nocturne, savoir QUAND elle a fonctionné pour la dernière fois vaut
-- souvent plus que de savoir qu'elle vient d'échouer. Les confondre effacerait
-- le dernier succès au premier échec.
--
-- Idempotent : ce fichier est rejoué à chaque démarrage.

CREATE TABLE IF NOT EXISTS "taches_planifiees" (
  "nom" text NOT NULL,
  "derniere_execution" timestamp with time zone NOT NULL,
  "dernier_succes" timestamp with time zone,
  "duree_ms" integer NOT NULL,
  "statut" text NOT NULL,
  "detail" text,
  CONSTRAINT "taches_planifiees_pkey" PRIMARY KEY (nom),
  CONSTRAINT "taches_planifiees_statut_check" CHECK ((statut = ANY (ARRAY['succes'::text, 'echec'::text])))
);

-- Les droits, comme pour les autres tables : `authenticated` peut lire et
-- écrire, et c'est `rest-droits.ts` qui décide qui a le droit de quoi. La table
-- n'est de toute façon jamais atteinte par le proxy PostgREST — l'ordonnanceur
-- écrit avec la connexion du serveur, et l'écran passe par `/api/taches`.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "taches_planifiees" TO authenticated;
  END IF;
END $$;
