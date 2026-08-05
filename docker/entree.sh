#!/bin/sh
# ============================================================================
# Point d'entrée du conteneur applicatif.
#
# Trois choses, dans cet ordre :
#   1. attendre que PostgreSQL réponde ;
#   2. appliquer le schéma s'il n'est pas déjà là ;
#   3. démarrer le serveur.
#
# L'étape 2 est idempotente : elle regarde si la table `profiles` existe et ne
# fait rien si c'est le cas. C'est ce qui permet de relancer le conteneur, ou de
# le mettre à jour, sans jamais toucher aux données.
# ============================================================================
set -e

: "${DATABASE_URL:?DATABASE_URL manquant}"

echo "[entree] attente de PostgreSQL..."
i=0
until psql "$DATABASE_URL" -c 'SELECT 1' >/dev/null 2>&1; do
  i=$((i + 1))
  if [ "$i" -gt 60 ]; then
    echo "[entree] PostgreSQL ne repond pas apres 2 minutes." >&2
    exit 1
  fi
  sleep 2
done
echo "[entree] PostgreSQL est la."

# `profiles` fait office de témoin : c'est la table des comptes, elle est créée
# par cible.sql et ne peut pas exister sans le reste du schéma.
DEJA=$(psql "$DATABASE_URL" -tAc \
  "SELECT to_regclass('public.profiles') IS NOT NULL")

if [ "$DEJA" != "t" ]; then
  echo "[entree] premiere initialisation : application du schema..."
  # ON_ERROR_STOP arrête psql à la première erreur — mais cela ne suffit PAS à
  # protéger la base : sans transaction, chaque instruction déjà passée est
  # validée, et il reste un schéma à moitié créé.
  #
  # C'est exactement ce qui s'est produit au premier démarrage sur le VPS : une
  # erreur en milieu de fichier a laissé les premières tables en place, et
  # chaque redémarrage retrébuchait sur « relation ago_avancement_statuses
  # already exists » — masquant l'erreur d'origine, la seule utile.
  #
  # --single-transaction rend l'opération atomique : ou tout le schéma est là,
  # ou la base est intacte et le journal montre la vraie cause.
  psql "$DATABASE_URL" --single-transaction -v ON_ERROR_STOP=1 -q -f /app/schema/cible.sql
  psql "$DATABASE_URL" --single-transaction -v ON_ERROR_STOP=1 -q -f /app/schema/auth-interne.sql
  echo "[entree] schema applique."
else
  # Les tables d'authentification sont appliquées séparément : elles peuvent
  # manquer sur une base restaurée depuis un export antérieur aux passkeys.
  AUTH=$(psql "$DATABASE_URL" -tAc \
    "SELECT to_regclass('public.passkeys') IS NOT NULL")
  if [ "$AUTH" != "t" ]; then
    echo "[entree] tables d'authentification absentes : application..."
    psql "$DATABASE_URL" --single-transaction -v ON_ERROR_STOP=1 -q -f /app/schema/auth-interne.sql
  fi
fi

# ---- Incréments de schéma ---------------------------------------------------
#
# Le schéma complet n'est appliqué qu'à la PREMIÈRE initialisation, et maj.sh ne
# fait que sauvegarder puis tirer l'image : une table ajoutée à cible.sql
# n'apparaîtrait donc jamais sur une instance déjà en service. Chaque fichier
# d'increments/ comble ce trou, dans sa propre transaction — même raisonnement
# que pour cible.sql : ou l'incrément passe en entier, ou la base reste intacte
# et le journal montre la vraie cause.
#
# CHAQUE INCRÉMENT N'EST JOUÉ QU'UNE FOIS, le registre crm_meta.schema_migrations
# retenant ce qui est passé. Ce n'était pas le cas au début : la boucle rejouait
# tout à chaque démarrage, en s'appuyant sur l'idempotence des fichiers. Cela
# suffisait pour créer des tables, cela ne suffit plus dès qu'un incrément
# TOUCHE AUX DONNÉES — un backfill rejoué à chaque redémarrage du conteneur
# écraserait les corrections faites à la main entre-temps.
#
# L'IDEMPOTENCE RESTE EXIGÉE de chaque fichier, et ce n'est pas redondant : le
# registre est l'économie, l'idempotence est la sécurité. Une instance qui a
# rejoué un incrément vingt fois avant ce mécanisme le verra marqué pour la
# première fois ici ; et si un fichier devait repasser par accident — registre
# effacé, base restaurée d'un instantané antérieur — rien ne doit casser.
#
# Ce n'est toujours PAS un système de migrations complet : pas de sens de
# marche, pas de retour arrière. Le point de retour est la sauvegarde que
# installation/maj.sh prend avant de reconstruire.
psql "$DATABASE_URL" -q -v ON_ERROR_STOP=1 <<'SQL'
CREATE SCHEMA IF NOT EXISTS crm_meta;
CREATE TABLE IF NOT EXISTS crm_meta.schema_migrations (
  "nom"         text NOT NULL,
  "applique_le" timestamptz NOT NULL DEFAULT now(),
  "empreinte"   text,
  "origine"     text NOT NULL DEFAULT 'increment',
  CONSTRAINT "schema_migrations_pkey" PRIMARY KEY (nom)
);
SQL

# ⚠️ LES VALEURS PASSENT PAR L'ENTRÉE STANDARD, PAS PAR `-c`.
#
# psql n'interpole PAS ses variables (`-v nom=…` puis `:'nom'`) dans une chaîne
# donnée à `-c` : elle part au serveur telle quelle, qui répond « syntax error
# at or near ":" ». L'interpolation n'a lieu que sur ce qui est lu depuis un
# fichier ou l'entrée standard — d'où `-f -`.
#
# C'est ce qui a été trouvé en rejouant l'incrément sur une sauvegarde du 2 août
# restaurée : le SELECT échouait en silence et rendait une chaîne vide, donc
# CHAQUE démarrage aurait rejoué tous les incréments — précisément ce que ce
# registre existe pour éviter. Ne pas « simplifier » en revenant à `-c`.
#
# `:'nom'` cite la valeur, ce qu'une substitution par le shell ne ferait pas.
for INCREMENT in /app/schema/increments/*.sql; do
  [ -e "$INCREMENT" ] || continue
  NOM=$(basename "$INCREMENT")
  EMPREINTE=$(sha256sum "$INCREMENT" | cut -d' ' -f1)

  CONNU=$(echo "SELECT coalesce(empreinte, '~') FROM crm_meta.schema_migrations WHERE nom = :'nom';" \
    | psql "$DATABASE_URL" -tA -v ON_ERROR_STOP=1 -v nom="$NOM" -f -)

  # `'~'` et non `''` : une ligne présente dont l'empreinte serait NULL rendrait
  # une chaîne vide, indistinguable de « pas de ligne » — et l'incrément serait
  # rejoué alors qu'il est déjà passé. Le sentinelle sépare les deux cas.
  if [ -n "$CONNU" ]; then
    # Déjà passé. On ne rejoue pas, et une empreinte différente ne bloque pas le
    # démarrage : éditer un incrément publié est une faute d'auteur, pas une
    # raison d'empêcher un cabinet de travailler. On le dit, c'est tout.
    if [ "$CONNU" != "$EMPREINTE" ] && [ "$CONNU" != "~" ]; then
      echo "[entree] ATTENTION : $NOM a change depuis son application." >&2
      echo "[entree] Le contenu deja applique et le fichier livre different." >&2
    fi
    continue
  fi

  MARQUER="INSERT INTO crm_meta.schema_migrations (nom, empreinte, origine)
           VALUES (:'nom', :'emp', :'src');"

  if [ "$DEJA" != "t" ]; then
    # Base neuve : cible.sql vient de tout créer, incréments compris. Les jouer
    # serait au mieux inutile, au pire destructeur pour ceux qui touchent aux
    # données. On les marque sans les jouer.
    echo "[entree] increment $NOM : deja couvert par cible.sql, marque sans etre joue"
    echo "$MARQUER" | psql "$DATABASE_URL" -q -v ON_ERROR_STOP=1 \
      -v nom="$NOM" -v emp="$EMPREINTE" -v src="cible.sql" -f -
    continue
  fi

  # L'incrément ET son enregistrement dans la MÊME transaction : sans cela, un
  # arrêt entre les deux laisse une migration appliquée mais non marquée, donc
  # rejouée au démarrage suivant. --single-transaction enveloppe les deux `-f`,
  # dans l'ordre où ils sont donnés, et annule tout à la moindre erreur.
  echo "[entree] increment : $NOM"
  if ! echo "$MARQUER" | psql "$DATABASE_URL" --single-transaction -v ON_ERROR_STOP=1 -q \
      -v nom="$NOM" -v emp="$EMPREINTE" -v src="increment" \
      -f "$INCREMENT" -f -; then
    echo "[entree] ECHEC de l'increment $NOM. La base n'a pas ete modifiee." >&2
    echo "[entree] Point de retour : la sauvegarde prise par installation/maj.sh" >&2
    echo "[entree] avant la reconstruction, dans data/sauvegardes/." >&2
    exit 1
  fi
done

mkdir -p "${STORAGE_DIR:-/app/data/storage}"

# ---- Forcer PostgREST à relire le schéma ------------------------------------
#
# PostgREST construit son cache de schéma à sa connexion. Il démarre en même
# temps que ce conteneur, donc il peut le construire AVANT que le schéma
# ci-dessus n'existe. Il ne connaît alors ni les clés étrangères, ni les
# fonctions : toute jointure imbriquée répond PGRST200 (« Could not find a
# relationship ») et tout appel RPC PGRST202, alors que la base, elle, est
# complète. Les requêtes simples passant très bien, le tableau de bord s'affiche
# vide sans la moindre erreur — c'est exactement ce qui s'est produit à la mise
# en production du 2026-07-31.
#
# NOTIFY sur le canal `pgrst` lui fait relire le schéma. Répété une minute
# durant : un NOTIFY émis avant que PostgREST n'écoute est perdu, et rien ne
# dit quand il se connecte. En arrière-plan, pour ne pas retarder le serveur.
(
  i=0
  while [ "$i" -lt 12 ]; do
    psql "$DATABASE_URL" -c "NOTIFY pgrst, 'reload schema'" >/dev/null 2>&1 || true
    i=$((i + 1))
    sleep 5
  done
) &

echo "[entree] demarrage du serveur."
exec node dist/index.js
