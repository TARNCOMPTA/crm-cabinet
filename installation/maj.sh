#!/bin/sh
# ============================================================================
# CRM Cabinet — mise à jour d'une instance.
#
#   cd /opt/crmcabinet && sh installation/maj.sh
#
# L'ordre compte : la base est sauvegardée AVANT toute modification. Une mise à
# jour qui casse quelque chose se rattrape alors avec le fichier de sauvegarde ;
# sans lui, il n'y a rien à faire.
#
# Le retour en arrière est possible : voir la fin de ce fichier.
# ============================================================================
set -e

# `--forcer` reconstruit même sans nouveau commit.
#
# Le script s'arrête normalement dès que `git pull` ne ramène rien : sans code
# nouveau, il n'y a rien à déployer. Mais les CONTENEURS peuvent être en retard
# sur le dépôt — une mise à jour interrompue, un `git pull` lancé à la main sans
# reconstruction, une image dont une couche a été mise en cache à tort. L'arrêt
# devient alors un piège : le dossier est à jour, ce qui tourne ne l'est pas, et
# le script refuse d'agir en annonçant que tout va bien.
FORCER=0
for argument in "$@"; do
  case "$argument" in
    --forcer|-f) FORCER=1 ;;
    *) echo "Option inconnue : $argument (attendu : --forcer)" >&2; exit 1 ;;
  esac
done

DIR=$(cd "$(dirname "$0")/.." && pwd)
cd "$DIR"

[ -f .env ] || {
  echo "Aucun .env dans $DIR : cette instance n'est pas installée ici." >&2
  exit 1
}

# Le `.env` n'est PAS sourcé.
#
# Un `.env` est un format Docker Compose, pas un script shell : rien n'y oblige
# les valeurs à être valides pour le shell. Un mot de passe contenant une
# espace, une parenthèse ou un caractère de contrôle est parfaitement légitime,
# Compose le lit sans broncher — et `. ./.env` s'y casse.
#
# C'est arrivé le 2026-08-01, à la toute première exécution de ce script :
# `INPI_PASSWORD` contient un caractère non imprimable, et la mise à jour
# s'arrêtait sur « ./.env: d^V: not found », avant même la sauvegarde. Un script
# de mise à jour qui refuse de démarrer à cause d'un mot de passe légal est un
# script qu'on n'utilise pas.
#
# Seule `PUBLIC_URL` est nécessaire ici, pour le message final. On la lit donc
# sans interpréter quoi que ce soit. Les guillemets éventuels sont retirés :
# Compose les enlève, l'affichage doit faire de même.
lire_env() {
  sed -n "s/^[[:space:]]*$1[[:space:]]*=[[:space:]]*//p" .env \
    | head -n 1 \
    | sed -e 's/^"\(.*\)"$/\1/' -e "s/^'\(.*\)'$/\1/"
}

PUBLIC_URL=$(lire_env PUBLIC_URL)
DOMAIN=$(lire_env DOMAIN)

SAUVEGARDES="$DIR/data/sauvegardes"
mkdir -p "$SAUVEGARDES"
HORODATAGE=$(date +%Y-%m-%d_%H-%M-%S)
FICHIER="$SAUVEGARDES/base_$HORODATAGE.sql.gz"

echo ""
echo "=== CRM Cabinet — mise à jour ==="
echo ""

echo "--- 1/5 Version actuelle ---"
AVANT=$(git rev-parse --short HEAD)
echo "Révision : $AVANT"

# ⚠️ UN `.env` MODIFIÉ DOIT DÉCLENCHER UNE RECONSTRUCTION, et il ne le faisait pas.
#
# Le script ne comparait que les révisions git. Or `docker-compose.yml` injecte
# le `.env` au démarrage du conteneur : changer un réglage sans recréer le
# conteneur ne change RIEN, et le script annonçait « Déjà à jour. Rien à faire »
# — ce qui est vrai du code, et faux de l'instance.
#
# Vécu le 2026-08-09 : un réglage jedeclare écrit dans le `.env`, `maj.sh` lancé,
# « Déjà à jour », et trois analyses dépensées à chercher pourquoi le logiciel
# ignorait ce qu'on venait de lui écrire.
#
# L'empreinte est rangée dans data/, à côté des sauvegardes : c'est le volume qui
# survit à la reconstruction. Absente — première exécution après cette
# correction, ou instance restaurée — on reconstruit, ce qui est le choix sûr.
EMPREINTE_ENV="$DIR/data/.env.empreinte"
ENV_ACTUEL=$(sha256sum .env | cut -d' ' -f1)
ENV_CHANGE=1
if [ -f "$EMPREINTE_ENV" ] && [ "$(cat "$EMPREINTE_ENV")" = "$ENV_ACTUEL" ]; then
  ENV_CHANGE=0
fi
[ "$ENV_CHANGE" -eq 1 ] && echo "Configuration : .env modifié depuis la dernière mise à jour."

echo ""
echo "--- 2/5 Sauvegarde de la base ---"
# pg_dump depuis le conteneur applicatif : postgresql-client y est installé, et
# la base n'est joignable que depuis le réseau interne de compose.
docker compose exec -T app sh -c 'pg_dump "$DATABASE_URL"' | gzip > "$FICHIER"

TAILLE=$(du -h "$FICHIER" | cut -f1)
# Une sauvegarde vide ou minuscule signale un pg_dump qui a échoué en silence.
# Continuer serait exactement le cas où l'on regretterait de ne pas s'être
# arrêté.
OCTETS=$(wc -c < "$FICHIER")
[ "$OCTETS" -gt 2048 ] || {
  echo "Sauvegarde suspecte ($OCTETS octets) : mise à jour interrompue." >&2
  echo "Vérifiez : docker compose exec app sh -c 'pg_dump \"\$DATABASE_URL\" | head'" >&2
  exit 1
}
echo "Sauvegarde : $FICHIER ($TAILLE)"

echo ""
echo "--- 3/5 Récupération du code ---"
git pull

APRES=$(git rev-parse --short HEAD)
if [ "$AVANT" = "$APRES" ] && [ "$FORCER" -eq 0 ] && [ "$ENV_CHANGE" -eq 0 ]; then
  echo ""
  echo "Déjà à jour ($AVANT), .env inchangé. Rien à faire."
  echo "La sauvegarde de la base a tout de même été conservée."
  echo ""
  echo "Si ce qui tourne est en retard sur ce dossier — mise à jour interrompue,"
  echo "  « git pull » lancé à la main sans reconstruction — forcez la reprise :"
  echo "    sudo sh installation/maj.sh --forcer"
  exit 0
fi
echo "Révision : $AVANT → $APRES"

echo ""
echo "--- 4/5 Reconstruction et redémarrage ---"
docker compose up -d --build

echo ""
echo "--- 5/5 Vérification ---"
i=0
until docker compose exec -T app node -e \
  "fetch('http://localhost:3000/api/sante').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))" \
  >/dev/null 2>&1; do
  i=$((i + 1))
  if [ "$i" -gt 40 ]; then
    echo ""
    echo "L'application ne répond pas après 2 minutes." >&2
    echo "Journaux : docker compose logs --tail=50 app" >&2
    echo "" >&2
    echo "Pour revenir en arrière :" >&2
    echo "  cd $DIR" >&2
    echo "  git checkout $AVANT" >&2
    echo "  docker compose up -d --build" >&2
    echo "  gunzip -c $FICHIER | docker compose exec -T app sh -c 'psql \"\$DATABASE_URL\"'" >&2
    echo "" >&2
    echo "  Cette restauration-la vise la base EXISTANTE : les roles y sont deja." >&2
    echo "  Sur un serveur NEUF il faut les creer AVANT, sinon elle s'arrete sur" >&2
    echo "  « role ... does not exist » : pg_dump ne les emporte pas, ils" >&2
    echo "  appartiennent au serveur et non a la base. Verifie le 2026-08-01 :" >&2
    echo "    CREATE ROLE crm LOGIN SUPERUSER; CREATE ROLE authenticated NOLOGIN;" >&2
    exit 1
  fi
  sleep 3
done

# L'empreinte n'est retenue QU'APRÈS la vérification de santé. Une mise à jour
# qui échoue laisse donc le `.env` marqué « à appliquer », et la reprise suivante
# reconstruira — au lieu de croire le réglage déjà en place.
echo "$ENV_ACTUEL" > "$EMPREINTE_ENV"

# Les sauvegardes s'accumulent sinon : une par mise à jour, indéfiniment. Dix
# couvrent largement le besoin — au-delà, la plus récente est de toute façon la
# seule pertinente.
ls -1t "$SAUVEGARDES"/base_*.sql.gz 2>/dev/null | tail -n +11 | while read -r vieux; do
  rm -f "$vieux"
done

echo ""
echo "============================================================"
echo "  Mise à jour terminée : $AVANT → $APRES"
echo ""
echo "  Adresse    : ${PUBLIC_URL:-https://$DOMAIN}"
echo "  Sauvegarde : $FICHIER"
echo ""
echo "  Retour en arrière si nécessaire :"
echo "    git checkout $AVANT && docker compose up -d --build"
echo "============================================================"
echo ""
