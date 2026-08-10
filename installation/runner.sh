#!/bin/sh
# ============================================================================
# CRM Cabinet — runner de déploiement GitHub Actions.
#
#   sudo sh /opt/crmcabinet/installation/runner.sh
#
# Installe sur CE serveur l'agent qui exécute le workflow « Deploiement ». Une
# fois en place, la mise à jour se déclenche depuis GitHub — Actions ▸
# Deploiement ▸ Run workflow — sans ouvrir de terminal.
#
# ⚠️ CE QUE CELA DONNE COMME POUVOIR, ET IL FAUT LE SAVOIR AVANT.
#
# Un runner auto-hébergé exécute sur cette machine le code que le workflow lui
# dit d'exécuter. Le workflow lance `maj.sh` en root (voir la règle sudo plus
# bas), donc QUICONQUE PEUT POUSSER SUR LA BRANCHE PAR DÉFAUT DU DÉPÔT PEUT
# EXÉCUTER DU CODE EN ROOT ICI. Ce n'est pas un défaut de ce script : c'est la
# nature d'un déploiement auto-hébergé, et c'est la raison pour laquelle le
# workflow n'a AUCUN déclencheur `push` ni `pull_request` — seul un
# `workflow_dispatch`, réservé à qui a les droits sur le dépôt.
#
# À n'installer que si le dépôt et ce serveur sont sous la même responsabilité.
#
# Relançable sans risque : un runner déjà enregistré est remplacé (--replace).
# ============================================================================
set -e

DIR="/opt/crmcabinet"
UTILISATEUR="crm-runner"
RACINE_RUNNER="/opt/actions-runner"
ETIQUETTES="vps-crm"

[ "$(id -u)" -eq 0 ] || {
  echo "À lancer avec sudo : sudo sh $DIR/installation/runner.sh" >&2
  exit 1
}

[ -d "$DIR" ] || {
  echo "$DIR n'existe pas : ce serveur ne porte pas d'instance CRM Cabinet." >&2
  exit 1
}

# Le runner s'enregistre sur LE DÉPÔT QUE L'INSTANCE SUIT — c'est celui dont le
# workflow doit tirer, et le déduire évite une faute de frappe silencieuse : un
# runner enregistré ailleurs ne prend jamais le travail, et le job reste en file
# vingt-quatre heures avant d'être annulé sans un mot. Constaté le 2026-08-10.
DEPOT=$(git -C "$DIR" config --get remote.origin.url 2>/dev/null || echo '')
DEPOT=$(echo "$DEPOT" | sed -e 's/\.git$//' -e 's#^git@github\.com:#https://github.com/#')
[ -n "$DEPOT" ] || {
  echo "Impossible de lire l'origine git de $DIR." >&2
  exit 1
}

echo ""
echo "=== CRM Cabinet — runner de déploiement ==="
echo ""
echo "Dépôt      : $DEPOT"
echo "Instance   : $DIR"
echo "Étiquettes : $ETIQUETTES"
echo ""
echo "Il faut un JETON D'ENREGISTREMENT, à prendre sur GitHub :"
echo "  $DEPOT/settings/actions/runners/new"
echo "  → recopiez la valeur qui suit « --token » (valable une heure)."
echo ""
printf "Jeton : "
read JETON </dev/tty
[ -n "$JETON" ] || { echo "Jeton vide : abandon." >&2; exit 1; }

# ---- Dépendances ------------------------------------------------------------
# `curl` et `tar` seulement : le runner apporte le reste. Pas de jq — une
# dépendance de plus pour lire un numéro de version ne se justifie pas.
command -v curl >/dev/null 2>&1 || { apt-get update -qq && apt-get install -y -qq curl; }
command -v tar  >/dev/null 2>&1 || { apt-get update -qq && apt-get install -y -qq tar; }

# ---- Utilisateur dédié ------------------------------------------------------
# Ni root, ni le compte d'administration : un compte à lui, sans shell de
# connexion. Le pouvoir root arrive par la règle sudo ci-dessous, nommément et
# pour UNE commande — pas par l'appartenance au groupe `docker`, qui l'aurait
# donné en entier et sans trace.
if ! id "$UTILISATEUR" >/dev/null 2>&1; then
  useradd --system --create-home --home-dir "$RACINE_RUNNER" --shell /usr/sbin/nologin "$UTILISATEUR"
  echo "Utilisateur $UTILISATEUR créé."
fi
mkdir -p "$RACINE_RUNNER"
chown "$UTILISATEUR:$UTILISATEUR" "$RACINE_RUNNER"

# ---- Règle sudo -------------------------------------------------------------
# Portée à DEUX commandes, et le fichier est écrit puis validé avant d'être mis
# en place : un sudoers invalide casse `sudo` pour tout le monde, y compris pour
# le réparer. `visudo -c` sur un fichier temporaire est la seule façon sûre.
#
#   · maj.sh  — la mise à jour elle-même, chemin absolu, non modifiable par le
#     runner puisque $DIR appartient à root ;
#   · docker  — le compte rendu du workflow lit /api/sante dans le conteneur, et
#     compose doit pouvoir lire le `.env` de l'instance (600, root).
TEMPORAIRE=$(mktemp)
cat > "$TEMPORAIRE" <<SUDO
# CRM Cabinet — deploiement par GitHub Actions. Voir installation/runner.sh.
$UTILISATEUR ALL=(root) NOPASSWD: $DIR/installation/maj.sh, /usr/bin/docker
SUDO
chmod 0440 "$TEMPORAIRE"
if visudo -c -f "$TEMPORAIRE" >/dev/null 2>&1; then
  install -m 0440 -o root -g root "$TEMPORAIRE" /etc/sudoers.d/crm-runner
  rm -f "$TEMPORAIRE"
  echo "Règle sudo installée (maj.sh et docker, sans mot de passe)."
else
  rm -f "$TEMPORAIRE"
  echo "La règle sudo générée est invalide : rien n'a été modifié." >&2
  exit 1
fi

# ---- Téléchargement ---------------------------------------------------------
ARCHITECTURE=$(uname -m)
case "$ARCHITECTURE" in
  x86_64)  PLATEFORME="linux-x64" ;;
  aarch64) PLATEFORME="linux-arm64" ;;
  *) echo "Architecture non gérée : $ARCHITECTURE" >&2; exit 1 ;;
esac

VERSION=$(curl -fsSL https://api.github.com/repos/actions/runner/releases/latest \
  | sed -n 's/.*"tag_name": *"v\([^"]*\)".*/\1/p' | head -1)
[ -n "$VERSION" ] || { echo "Version du runner introuvable (API GitHub injoignable ?)." >&2; exit 1; }

if [ ! -x "$RACINE_RUNNER/config.sh" ]; then
  echo "Téléchargement du runner $VERSION ($PLATEFORME)..."
  curl -fsSL -o /tmp/runner.tar.gz \
    "https://github.com/actions/runner/releases/download/v$VERSION/actions-runner-$PLATEFORME-$VERSION.tar.gz"
  tar xzf /tmp/runner.tar.gz -C "$RACINE_RUNNER"
  rm -f /tmp/runner.tar.gz
  chown -R "$UTILISATEUR:$UTILISATEUR" "$RACINE_RUNNER"
fi

# Dépendances système du runner (.NET). Le script est fourni par l'archive.
[ -x "$RACINE_RUNNER/bin/installdependencies.sh" ] && \
  "$RACINE_RUNNER/bin/installdependencies.sh" >/dev/null 2>&1 || true

# ---- Enregistrement ---------------------------------------------------------
# `--unattended` pour ne rien demander, `--replace` pour que relancer ce script
# remplace l'enregistrement au lieu d'échouer sur un nom déjà pris.
#
# `config.sh` REFUSE de tourner en root, et c'est voulu de sa part : on repasse
# donc par l'utilisateur dédié.
NOM=$(hostname)
su -s /bin/sh "$UTILISATEUR" -c "cd '$RACINE_RUNNER' && ./config.sh \
  --url '$DEPOT' \
  --token '$JETON' \
  --name '$NOM' \
  --labels '$ETIQUETTES' \
  --unattended --replace"

# ---- Service ----------------------------------------------------------------
# En service systemd, et non en session : il doit repartir au redémarrage du
# serveur, sans quoi le premier déploiement d'après reboot resterait en file.
cd "$RACINE_RUNNER"
./svc.sh install "$UTILISATEUR"
./svc.sh start

echo ""
echo "=== Terminé ==="
echo ""
echo "Le runner « $NOM » est en service, étiqueté « $ETIQUETTES »."
echo "Vérifiez qu'il apparaît « Idle » ici :"
echo "  $DEPOT/settings/actions/runners"
echo ""
echo "Déploiement, désormais sans terminal :"
echo "  $DEPOT/actions/workflows/deploiement.yml → Run workflow"
echo ""
echo "État du service    : systemctl status actions.runner.*"
echo "Journal            : journalctl -u actions.runner.* -f"
echo "Retrait du runner  : cd $RACINE_RUNNER && ./svc.sh stop && ./svc.sh uninstall"
echo "                     puis su -s /bin/sh $UTILISATEUR -c './config.sh remove --token <jeton>'"
echo ""
