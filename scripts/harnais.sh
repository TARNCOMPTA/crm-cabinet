#!/bin/sh
# ============================================================================
# Une instance complete, en local, en une commande.
#
#   sh scripts/harnais.sh            demarre (ou reprend) l'instance
#   sh scripts/harnais.sh arreter    arrete tout, garde la base
#   sh scripts/harnais.sh etat       dit ce qui tourne
#   sh scripts/harnais.sh code       delivre un nouveau code d'enrolement
#   sh scripts/harnais.sh raser      supprime la base et les binaires
#
# ⚠️ POURQUOI CE SCRIPT EXISTE : 110 TESTS SUR 753 NE S'EXECUTENT JAMAIS.
#
# `tests/schema.test.ts`, `tests/mcp-sql.test.ts` et `tests/e2e.test.ts`
# s'ignorent d'elles-memes en l'absence de `DATABASE_URL_TEST` et de
# `E2E_BASE_URL`. `npm test` affiche alors « 643 passed » — et ce chiffre se lit
# comme un feu vert alors que la couche base de donnees et la couche navigateur
# n'ont pas ete exercees du tout.
#
# Elles s'ignorent parce que les monter a la main demande PostgreSQL, PostgREST,
# le serveur et le front. Personne ne le fait deux fois. Ce script le fait.
#
# Le 2026-08-29, une regression est passee en CI pour cette raison exacte : un
# test e2e cherchait « repartition » quand le produit ecrivait « répartition ».
# Une instance tournait a portee de main ; la suite qui l'aurait vue etait la
# seule qu'on n'avait pas lancee.
#
# ⚠️ DEUX BASES, ET CE N'EST PAS DU CONFORT. `schema.test.ts` et
# `mcp-sql.test.ts` commencent par `DROP SCHEMA public CASCADE`. Les faire
# pointer sur la base de l'instance detruirait les donnees de demonstration a
# chaque execution de la suite. La base d'essai est donc separee, et jetable.
# ============================================================================
set -e

RACINE=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
BASE_DIR="$RACINE/.harnais"
PORT_PG=${HARNAIS_PORT_PG:-5433}
PORT_REST=${HARNAIS_PORT_REST:-3001}
PORT_APP=${HARNAIS_PORT_APP:-3100}
DB_APP=crmcabinet
DB_TEST=crmcabinet_test
# Secret d'essai, jamais celui d'une instance. Le serveur ET PostgREST le
# partagent : c'est ce qui rend le jeton de session valide des deux cotes.
SECRET=${HARNAIS_SECRET:-harnais-local-sans-valeur-hors-de-ce-poste}
MAIL_ADMIN=${HARNAIS_ADMIN:-expert@cabinet-demo.invalid}

mkdir -p "$BASE_DIR/bin" "$BASE_DIR/journaux" "$BASE_DIR/stockage"

# ⚠️ LA VERSION DE POSTGREST SE LIT DANS `docker-compose.yml`, ELLE NE SE
# RECOPIE PAS ICI. Elle figure deja a trois endroits que `tests/postgrest.test.ts`
# tient ensemble ; une quatrieme copie derivait en silence, et ce script
# validerait alors le produit contre un PostgREST que personne n'installe.
VERSION_REST=$(sed -n 's|.*image: postgrest/postgrest:v\([0-9.]*\).*|\1|p' "$RACINE/docker-compose.yml" | head -1)
IMAGE_PG=$(sed -n 's|.*image: \(postgres:[^ ]*\).*|\1|p' "$RACINE/docker-compose.yml" | head -1)
[ -n "$VERSION_REST" ] || { echo "Version de PostgREST introuvable dans docker-compose.yml." >&2; exit 1; }
[ -n "$IMAGE_PG" ] || IMAGE_PG=postgres:17-alpine

DATABASE_URL_APP="postgresql://postgres@127.0.0.1:$PORT_PG/$DB_APP"
DATABASE_URL_TEST="postgresql://postgres@127.0.0.1:$PORT_PG/$DB_TEST"

# --------------------------------------------------------------- PostgreSQL --
# Deux chemins : le conteneur (comme en production et en CI) ou un cluster
# natif. Le conteneur est prefere — c'est la meme image que celle qu'un cabinet
# installe — mais un poste sans demon Docker doit pouvoir travailler quand meme.
mode_pg() {
  if [ -f "$BASE_DIR/mode-pg" ]; then cat "$BASE_DIR/mode-pg"; return; fi
  if docker info >/dev/null 2>&1; then echo docker; else echo natif; fi
}

pg_repond() { psql "postgresql://postgres@127.0.0.1:$PORT_PG/postgres" -tAc 'SELECT 1' >/dev/null 2>&1; }

demarrer_pg() {
  if pg_repond; then echo "  PostgreSQL repond deja sur $PORT_PG."; return; fi
  MODE=$(mode_pg); echo "$MODE" > "$BASE_DIR/mode-pg"
  if [ "$MODE" = docker ]; then
    echo "  PostgreSQL ($IMAGE_PG) dans un conteneur..."
    docker rm -f crm-harnais-pg >/dev/null 2>&1 || true
    docker run -d --name crm-harnais-pg \
      -e POSTGRES_USER=postgres -e POSTGRES_HOST_AUTH_METHOD=trust \
      -p "$PORT_PG:5432" -v "$BASE_DIR/pgdata:/var/lib/postgresql/data" \
      "$IMAGE_PG" >/dev/null
  else
    command -v initdb >/dev/null 2>&1 || INITDB=$(ls /usr/lib/postgresql/*/bin/initdb 2>/dev/null | tail -1)
    INITDB=${INITDB:-initdb}
    PGCTL=$(dirname "$INITDB")/pg_ctl
    [ -x "$INITDB" ] || command -v initdb >/dev/null 2>&1 || {
      echo "Ni demon Docker, ni PostgreSQL local. Installez l'un des deux." >&2; exit 1; }
    echo "  PostgreSQL natif dans .harnais/pgdata..."
    if [ ! -d "$BASE_DIR/pgdata/base" ]; then
      mkdir -p "$BASE_DIR/pgdata"
      # initdb refuse de tourner en root : on delegue au compte postgres quand
      # c'est le cas, et on lui donne le repertoire.
      if [ "$(id -u)" = 0 ] && id postgres >/dev/null 2>&1; then
        chown -R postgres:postgres "$BASE_DIR/pgdata" "$BASE_DIR/journaux"
        su postgres -c "$INITDB -D $BASE_DIR/pgdata -U postgres --auth=trust -E UTF8" >"$BASE_DIR/journaux/initdb.log" 2>&1
      else
        "$INITDB" -D "$BASE_DIR/pgdata" -U postgres --auth=trust -E UTF8 >"$BASE_DIR/journaux/initdb.log" 2>&1
      fi
    fi
    OPTS="-p $PORT_PG -c listen_addresses=127.0.0.1"
    if [ "$(id -u)" = 0 ] && id postgres >/dev/null 2>&1; then
      chown -R postgres:postgres "$BASE_DIR/pgdata" "$BASE_DIR/journaux"
      su postgres -c "$PGCTL -D $BASE_DIR/pgdata -l $BASE_DIR/journaux/pg.log -o '$OPTS' start" >/dev/null
    else
      "$PGCTL" -D "$BASE_DIR/pgdata" -l "$BASE_DIR/journaux/pg.log" -o "$OPTS" start >/dev/null
    fi
  fi
  i=0
  until pg_repond; do
    i=$((i + 1)); [ "$i" -gt 60 ] && { echo "PostgreSQL ne repond pas." >&2; exit 1; }
    sleep 1
  done
  echo "  PostgreSQL est la."
}

# ------------------------------------------------------------------ le schema --
appliquer_schema() {
  for BASE in "$DB_APP" "$DB_TEST"; do
    psql "postgresql://postgres@127.0.0.1:$PORT_PG/postgres" -tAc \
      "SELECT 1 FROM pg_database WHERE datname='$BASE'" | grep -q 1 || \
      psql "postgresql://postgres@127.0.0.1:$PORT_PG/postgres" -q -c "CREATE DATABASE $BASE"
  done
  # Meme temoin que `docker/entree.sh` : `profiles` ne peut pas exister sans le
  # reste du schema.
  DEJA=$(psql "$DATABASE_URL_APP" -tAc "SELECT to_regclass('public.profiles') IS NOT NULL")
  if [ "$DEJA" != "t" ]; then
    echo "  Application du schema..."
    psql "$DATABASE_URL_APP" --single-transaction -v ON_ERROR_STOP=1 -q -f "$RACINE/schema/cible.sql"
    psql "$DATABASE_URL_APP" --single-transaction -v ON_ERROR_STOP=1 -q -f "$RACINE/schema/auth-interne.sql"
    echo "  Donnees de demonstration (societes et dirigeants fictifs)..."
    psql "$DATABASE_URL_APP" --single-transaction -v ON_ERROR_STOP=1 -q -f "$RACINE/scripts/donnees-demonstration.sql"
  else
    echo "  Schema deja en place (la base est conservee)."
  fi
}

# -------------------------------------------------------------- PostgREST --
binaire_rest() {
  BIN="$BASE_DIR/bin/postgrest"
  [ -x "$BIN" ] && [ "$("$BIN" --version 2>/dev/null | grep -o "$VERSION_REST")" = "$VERSION_REST" ] && return
  echo "  Telechargement de PostgREST v$VERSION_REST..."
  # ⚠️ LE NOM DE L'ARCHIVE A CHANGE ENTRE LES VERSIONS : la v12 publie
  # `-linux-static-x64`, la v14 `-linux-static-x86-64`. Recopier un numero sans
  # relire le nom donne un 404. On essaie les deux plutot que d'echouer sur une
  # convention.
  for SUFFIXE in linux-static-x64 linux-static-x86-64; do
    URL="https://github.com/PostgREST/postgrest/releases/download/v$VERSION_REST/postgrest-v$VERSION_REST-$SUFFIXE.tar.xz"
    if curl -fsSL --max-time 300 -o "$BASE_DIR/bin/pgrst.tar.xz" "$URL" 2>/dev/null; then
      tar -xJf "$BASE_DIR/bin/pgrst.tar.xz" -C "$BASE_DIR/bin" && rm -f "$BASE_DIR/bin/pgrst.tar.xz"
      chmod +x "$BIN"; return
    fi
  done
  echo "PostgREST v$VERSION_REST introuvable en telechargement." >&2; exit 1
}

en_ecoute() { curl -s -o /dev/null -w '%{http_code}' "http://127.0.0.1:$1/" 2>/dev/null | grep -qE '200|401|404'; }

demarrer_rest() {
  if en_ecoute "$PORT_REST"; then echo "  PostgREST repond deja sur $PORT_REST."; return; fi
  binaire_rest
  PGRST_DB_URI="$DATABASE_URL_APP" PGRST_DB_SCHEMAS=public PGRST_DB_ANON_ROLE= \
  PGRST_JWT_SECRET="$SECRET" PGRST_SERVER_PORT="$PORT_REST" \
    nohup "$BASE_DIR/bin/postgrest" >"$BASE_DIR/journaux/postgrest.log" 2>&1 &
  echo $! > "$BASE_DIR/postgrest.pid"
  i=0; until en_ecoute "$PORT_REST"; do
    i=$((i + 1)); [ "$i" -gt 30 ] && { echo "PostgREST ne repond pas ; voir .harnais/journaux/postgrest.log" >&2; exit 1; }
    sleep 1
  done
  echo "  PostgREST v$VERSION_REST est la."
}

# ------------------------------------------------------------- l'application --
construire() {
  if [ ! -f "$RACINE/server/dist/index.js" ] || [ "$HARNAIS_CONSTRUIRE" = 1 ]; then
    echo "  Construction du serveur..."; (cd "$RACINE" && npm run build --prefix server >"$BASE_DIR/journaux/build-serveur.log" 2>&1)
  fi
  if [ ! -f "$RACINE/dist/index.html" ] || [ "$HARNAIS_CONSTRUIRE" = 1 ]; then
    echo "  Construction du front..."; (cd "$RACINE" && npm run build >"$BASE_DIR/journaux/build-front.log" 2>&1)
  fi
}

app_repond() { curl -sf -o /dev/null "http://127.0.0.1:$PORT_APP/api/sante" 2>/dev/null; }

demarrer_app() {
  if app_repond; then echo "  L'application repond deja sur $PORT_APP."; return; fi
  construire
  cd "$RACINE"
  DATABASE_URL="$DATABASE_URL_APP" SESSION_SECRET="$SECRET" \
  POSTGREST_URL="http://127.0.0.1:$PORT_REST" PORT="$PORT_APP" \
  PUBLIC_URL="http://localhost:$PORT_APP" STORAGE_DIR="$BASE_DIR/stockage" \
  FRONT_DIR="$RACINE/dist" UPDATE_DISABLED=1 \
    nohup node server/dist/index.js >"$BASE_DIR/journaux/serveur.log" 2>&1 &
  echo $! > "$BASE_DIR/serveur.pid"
  i=0; until app_repond; do
    i=$((i + 1)); [ "$i" -gt 40 ] && { echo "L'application ne repond pas ; voir .harnais/journaux/serveur.log" >&2; exit 1; }
    sleep 1
  done
  echo "  L'application est la."
}

code_enrolement() {
  cd "$RACINE"
  DATABASE_URL="$DATABASE_URL_APP" SESSION_SECRET="$SECRET" \
    node server/dist/cli/enrolement.js --creer "$MAIL_ADMIN" "Camille" "MARTY" admin 2>&1 |
    grep -oE '[A-Z0-9]{5}-[A-Z0-9]{5}' | head -1
}

arreter() {
  for NOM in serveur postgrest; do
    [ -f "$BASE_DIR/$NOM.pid" ] && kill "$(cat "$BASE_DIR/$NOM.pid")" 2>/dev/null || true
    rm -f "$BASE_DIR/$NOM.pid"
  done
  if [ "$(mode_pg)" = docker ]; then docker stop crm-harnais-pg >/dev/null 2>&1 || true
  else
    PGCTL=$(ls /usr/lib/postgresql/*/bin/pg_ctl 2>/dev/null | tail -1)
    [ -n "$PGCTL" ] && { [ "$(id -u)" = 0 ] && id postgres >/dev/null 2>&1 \
      && su postgres -c "$PGCTL -D $BASE_DIR/pgdata stop" >/dev/null 2>&1 \
      || "$PGCTL" -D "$BASE_DIR/pgdata" stop >/dev/null 2>&1; } || true
  fi
  echo "Harnais arrete. La base est conservee dans .harnais/."
}

etat() {
  pg_repond && echo "  PostgreSQL  : en ecoute sur $PORT_PG" || echo "  PostgreSQL  : arrete"
  en_ecoute "$PORT_REST" && echo "  PostgREST   : en ecoute sur $PORT_REST" || echo "  PostgREST   : arrete"
  app_repond && echo "  Application : http://localhost:$PORT_APP" || echo "  Application : arretee"
}

case "${1:-demarrer}" in
  arreter) arreter ;;
  etat)    etat ;;
  code)    echo "Code d'enrolement : $(code_enrolement)" ;;
  raser)   arreter; rm -rf "$BASE_DIR"; echo "Harnais supprime." ;;
  demarrer)
    echo ""
    echo "=== Harnais local — CRM Cabinet ==="
    echo ""
    demarrer_pg
    appliquer_schema
    demarrer_rest
    demarrer_app
    CODE=$(code_enrolement)
    echo ""
    echo "  ------------------------------------------------------------------"
    echo "  Application        http://localhost:$PORT_APP"
    echo "  Compte             $MAIL_ADMIN"
    echo "  Code d'enrolement  $CODE     (a usage unique, valable une heure)"
    echo ""
    echo "  La totale, 110 tests silencieux compris :"
    echo "      npm run test:tout"
    echo ""
    echo "  Arreter : sh scripts/harnais.sh arreter"
    echo "  ------------------------------------------------------------------"
    echo ""
    ;;
  *) echo "Usage : sh scripts/harnais.sh [demarrer|arreter|etat|code|raser]" >&2; exit 1 ;;
esac
