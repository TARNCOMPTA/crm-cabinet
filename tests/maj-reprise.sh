#!/bin/bash
# ============================================================================
# `installation/maj.sh` doit reprendre sur sa propre nouvelle version.
#
#   sh tests/maj-reprise.sh <chemin d'un maj.sh>
#
# Monte une instance factice — dépôt git local, `docker` remplacé par un
# mouchard — et rejoue le déploiement du 2026-08-28 : le `git pull` de
# l'étape 3 remplace `maj.sh`, et la nouvelle version porte une ligne
# supplémentaire en étape 4.
#
# Écrit sur sa sortie standard, une par ligne, les faits que le test lit :
#   SECTION4-NOUVELLE  la ligne ajoutée par la nouvelle version s'est exécutée
#   SECTION4-ANCIENNE  la ligne présente dans les deux versions s'est exécutée
#   PREPARER-DATA      l'appel à preparer-data.sh a bien été atteint
#   SAUVEGARDES=<n>    nombre de sauvegardes écrites (doit valoir 1)
#   PGDUMP=<n> UP=<n>  appels docker (doivent valoir 1 et 1)
#
# Aucun accès réseau, aucun démon docker, AUCUN BESOIN DE ROOT : tout est local
# et factice, et le résultat ne dépend pas de qui lance le harnais.
# ============================================================================
set -u
# Chemin ABSOLU : le script change de repertoire plus bas, et un chemin relatif
# ne designerait plus rien.
MAJ_SOURCE=$(cd "$(dirname "$1")" && pwd)/$(basename "$1")
T=$(mktemp -d)

mkdir -p "$T/bin"
cat > "$T/bin/docker" <<'DOCKER'
#!/bin/sh
echo "docker $*" >> "$JOURNAL_DOCKER"
case "$1 $2" in
  # pg_dump : assez d'octets pour passer le controle des 2048 de maj.sh.
  "compose exec") head -c 4000 /dev/urandom; exit 0 ;;
  "compose config") echo reseau; exit 0 ;;
esac
exit 0
DOCKER
chmod +x "$T/bin/docker"
export PATH="$T/bin:$PATH"
export JOURNAL_DOCKER="$T/docker.log"; : > "$JOURNAL_DOCKER"

RACINE=$(cd "$(dirname "$0")/.." && pwd)

git init -q --bare "$T/distant"
git clone -q "$T/distant" "$T/travail" 2>/dev/null
cd "$T/travail"
git config user.email zz@example.test
git config user.name ZZ
mkdir -p installation data

# Révision 1 : le maj.sh éprouvé, avec une étape 4 sans la ligne nouvelle.
cp "$MAJ_SOURCE" installation/maj.sh
cp "$RACINE/installation/preparer-data.sh" installation/
sed -i 's|^docker compose up -d --build$|echo "SECTION4-ANCIENNE"\ndocker compose up -d --build|' installation/maj.sh
# Le controle de sante n'a pas d'application en face.
sed -i 's|^until docker compose exec -T app node -e .*|until true; do|' installation/maj.sh
# ⚠️ `preparer-data.sh` EXIGE ROOT — il fait un `chown`. Le laisser s'executer
# rendait ce harnais dependant de qui le lance : vert en root, et rouge sur le
# runner GitHub, qui ne l'est pas. Il y refusait correctement, `set -e`
# arretait maj.sh, et l'etape 4 n'etait jamais atteinte : le test accusait
# `maj.sh` d'un defaut qui n'etait pas le sien.
#
# On le remplace donc par un temoin. Ce n'est pas une perte : l'appel lui-meme
# est CE QUI MANQUAIT en production le 2026-08-28, et le temoin le prouve mieux
# qu'un chown reussi.
sed -i 's|^sh .*preparer-data\.sh.*$|echo "PREPARER-DATA"|' installation/maj.sh
printf 'PUBLIC_URL=https://exemple.test\nDOMAIN=exemple.test\n' > .env
git add -A && git commit -qm "revision 1"
git push -q origin HEAD

# Révision 2 : la même, plus une ligne en étape 4. C'est le cas de ce soir-là.
sed -i 's|^echo "SECTION4-ANCIENNE"$|echo "SECTION4-ANCIENNE"\necho "SECTION4-NOUVELLE"|' installation/maj.sh
git add -A && git commit -qm "revision 2"
git push -q origin HEAD

# L'instance, restée sur la révision 1 — comme le serveur avant un déploiement.
git clone -q "$T/distant" "$T/instance" 2>/dev/null
cd "$T/instance"
git reset -q --hard HEAD~1
mkdir -p data/storage data/sauvegardes
printf 'PUBLIC_URL=https://exemple.test\nDOMAIN=exemple.test\n' > .env

SORTIE=$(sh installation/maj.sh 2>&1)

echo "$SORTIE" | grep -q 'PREPARER-DATA' && echo PREPARER-DATA
echo "$SORTIE" | grep -q 'SECTION4-NOUVELLE' && echo SECTION4-NOUVELLE
echo "$SORTIE" | grep -q 'SECTION4-ANCIENNE' && echo SECTION4-ANCIENNE
echo "SAUVEGARDES=$(ls -1 data/sauvegardes | wc -l | tr -d ' ')"
echo "PGDUMP=$(grep -c 'compose exec' "$JOURNAL_DOCKER" | tr -d ' ')"
echo "UP=$(grep -c 'compose up' "$JOURNAL_DOCKER" | tr -d ' ')"

cd /; rm -rf "$T"
