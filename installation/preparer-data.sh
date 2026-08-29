#!/bin/sh
# ============================================================================
# Prépare `data/` pour un conteneur applicatif qui ne tourne PAS en root.
#
#   sh installation/preparer-data.sh <répertoire de l'instance>
#
# ⚠️ CE SCRIPT EST LA MOITIÉ D'UN CONTRAT. L'autre moitié est le `USER` du
# `Dockerfile` : l'image tourne sous l'uid 10001, et `/app/data` est un montage
# lié dont le propriétaire est celui du dossier `data/` SUR L'HÔTE. L'image ne
# peut pas le changer — un montage lié n'obéit pas au `chown` fait au build.
# Sans ce script, la première pièce déposée échoue en « EACCES: permission
# denied », et pas au démarrage : l'application a l'air d'aller bien jusqu'au
# premier fichier.
#
# Les deux valeurs doivent rester d'accord. Si l'une change, l'autre change.
#
# Idempotent, et volontairement bavard uniquement quand il agit : appelé à
# chaque mise à jour, il ne doit pas ajouter une ligne de bruit par exécution.
# ============================================================================
set -e

UID_APP=10001
GID_APP=10001

DIR=${1:?Usage : preparer-data.sh <repertoire de l instance>}
DATA="$DIR/data"

# ⚠️ ON DECIDE AVANT D'AGIR, et non l'inverse. Le premier jet appelait `mkdir -p`
# d'entree : sur une instance ou `data/` appartient a root et qu'on lance sans
# sudo, l'utilisateur recevait « mkdir: Permission denied » — vrai, mais qui ne
# dit ni ce qu'on voulait faire ni comment s'en sortir. Le controle d'abord
# permet de sortir en silence quand tout est deja bon, et de n'expliquer qu'une
# fois, clairement, quand ca ne l'est pas.
BESOIN=0
if [ ! -d "$DATA" ] || [ ! -d "$DATA/storage" ] || [ ! -d "$DATA/sauvegardes" ]; then
  BESOIN=1
# `%u` et non `%U` : l'identifiant numerique, pas le nom. Le compte `crm`
# n'existe pas forcement sur l'hote, et c'est sans importance — seul le nombre
# traverse le montage.
elif [ "$(stat -c '%u' "$DATA")" != "$UID_APP" ]; then
  BESOIN=1
fi

[ "$BESOIN" = 0 ] && exit 0

if [ "$(id -u)" != "0" ]; then
  echo "data/ doit exister et appartenir a l'uid $UID_APP, celui du conteneur." >&2
  echo "Relancez en root : sudo sh installation/preparer-data.sh $DIR" >&2
  exit 1
fi

echo "Preparation de data/ pour le conteneur non-root (uid $UID_APP)."
mkdir -p "$DATA/storage" "$DATA/sauvegardes"
chown -R "$UID_APP:$GID_APP" "$DATA"
