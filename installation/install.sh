#!/bin/sh
# ============================================================================
# CRM Cabinet — installation sur un VPS Ubuntu (22.04 / 24.04 / 26.04)
#
#   curl -fsSL https://raw.githubusercontent.com/TARNCOMPTA/crmcabinet/main/installation/install.sh -o install.sh
#   sudo sh install.sh
#
# Le script installe Docker si besoin, ouvre le pare-feu (80/443/SSH), récupère
# le code, écrit la configuration, démarre l'instance en HTTPS automatique, puis
# affiche un CODE D'ENRÔLEMENT à saisir sur la page de connexion.
#
# Il n'y a pas de mot de passe administrateur à choisir : la connexion se fait
# par passkey. Rien à retenir, rien à taper au terminal, rien à transmettre en
# clair — et le code expire au bout d'une heure.
#
# Relançable sans risque : data/ et le volume de la base sont conservés.
# ============================================================================
set -e

REPO="https://github.com/TARNCOMPTA/crmcabinet.git"
DIR="/opt/crmcabinet"

echo ""
echo "=== CRM Cabinet — installation ==="
echo ""
echo "Prérequis :"
echo "  · un nom de domaine dont l'enregistrement DNS A pointe DÉJÀ vers l'IP"
echo "    de ce serveur (sinon le certificat HTTPS échouera) ;"
echo "  · un navigateur récent sur les postes du cabinet (passkeys)."
echo ""
echo "⚠️  Le domaine choisi devient l'identité des passkeys. En changer plus"
echo "    tard invalide TOUTES les passkeys déjà enrôlées, sans exception."
echo "    Choisissez-le définitif."
echo ""

# Les questions lisent /dev/tty pour fonctionner même invoquées par « curl | sh ».
printf "Domaine (ex. crm.moncabinet.fr) : "
read DOMAIN </dev/tty
printf "E-mail pour le certificat HTTPS : "
read ACME_EMAIL </dev/tty
printf "E-mail du premier compte administrateur : "
read ADMIN_EMAIL </dev/tty
printf "Prénom : "
read ADMIN_PRENOM </dev/tty
printf "Nom : "
read ADMIN_NOM </dev/tty

[ -n "$DOMAIN" ] && [ -n "$ACME_EMAIL" ] && [ -n "$ADMIN_EMAIL" ] || {
  echo "Domaine, e-mail HTTPS et e-mail administrateur sont obligatoires." >&2
  exit 1
}

echo ""
echo "--- 1/6 Docker ---"
if command -v docker >/dev/null 2>&1; then
  echo "Docker est déjà installé."
else
  curl -fsSL https://get.docker.com | sh
fi

echo ""
echo "--- 2/6 Pare-feu (SSH + web) ---"
if command -v ufw >/dev/null 2>&1; then
  ufw allow OpenSSH >/dev/null
  ufw allow 80 >/dev/null
  ufw allow 443 >/dev/null
  ufw --force enable >/dev/null
  echo "Ports ouverts : SSH, 80, 443."
else
  echo "ufw absent : vérifiez que les ports 80 et 443 sont ouverts."
fi

echo ""
echo "--- 3/6 Code de l'application ---"
if [ -d "$DIR/.git" ]; then
  echo "Dépôt déjà présent dans $DIR : mise à jour."
  git -C "$DIR" pull
else
  apt-get update -qq && apt-get install -y -qq git >/dev/null 2>&1 || true
  git clone --depth 1 "$REPO" "$DIR"
fi
cd "$DIR"

echo ""
echo "--- 4/6 Configuration ---"
if [ -f .env ]; then
  # Une réinstallation ne doit pas régénérer les secrets : changer
  # SESSION_SECRET déconnecterait tout le monde, et changer le mot de passe
  # Postgres rendrait le volume de données inaccessible.
  echo "Un .env existe déjà : conservé (secrets et mot de passe de base intacts)."
else
  # openssl est présent sur toute installation Ubuntu ; /dev/urandom sert de
  # repli. Ces deux secrets ne doivent jamais être devinables : le premier
  # signe les sessions, le second ouvre la base.
  if command -v openssl >/dev/null 2>&1; then
    SESSION_SECRET=$(openssl rand -hex 32)
    POSTGRES_PASSWORD=$(openssl rand -hex 24)
  else
    SESSION_SECRET=$(head -c 32 /dev/urandom | od -An -tx1 | tr -d ' \n')
    POSTGRES_PASSWORD=$(head -c 24 /dev/urandom | od -An -tx1 | tr -d ' \n')
  fi

  cat > .env <<EOF
# CRM Cabinet — configuration de cette instance.
# Généré à l'installation. Ne pas versionner. Sauvegarder avec les données.

DOMAIN=$DOMAIN
PUBLIC_URL=https://$DOMAIN
ACME_EMAIL=$ACME_EMAIL

# Signe les sessions ET les jetons transmis à PostgREST. Le changer déconnecte
# tout le monde.
SESSION_SECRET=$SESSION_SECRET

POSTGRES_DB=crmcabinet
POSTGRES_USER=crm
POSTGRES_PASSWORD=$POSTGRES_PASSWORD

# ---- Envoi de courrier (facultatif ici : réglable dans l'application) -------
# Sans SMTP, l'application fonctionne mais n'envoie ni notification ni
# invitation. Les codes d'enrôlement s'affichent alors à l'écran.
SMTP_HOST=
SMTP_PORT=465
SMTP_SECURE=true
SMTP_USER=
SMTP_PASSWORD=
SMTP_FROM=

# ---- INPI (facultatif) -----------------------------------------------------
# Identifiants du compte data.inpi.fr, pour la synchronisation des fiches
# d'entreprise et des actes juridiques.
INPI_USERNAME=
INPI_PASSWORD=
EOF
  chmod 600 .env
  echo "Configuration écrite dans $DIR/.env (secrets générés)."
fi

echo ""
echo "--- 5/6 Démarrage (construction de l'image : plusieurs minutes) ---"
docker compose up -d --build

echo ""
echo "--- 6/6 Premier compte ---"
# On attend que l'application réponde : le schéma est appliqué au démarrage du
# conteneur, et créer un compte avant qu'il soit là échouerait.
i=0
until docker compose exec -T app node -e \
  "fetch('http://localhost:3000/api/sante').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))" \
  >/dev/null 2>&1; do
  i=$((i + 1))
  [ "$i" -gt 60 ] && {
    echo "L'application ne répond pas après 3 minutes." >&2
    echo "Consultez : docker compose logs app" >&2
    exit 1
  }
  sleep 3
done

docker compose exec -T app node dist/cli/enrolement.js \
  --creer "$ADMIN_EMAIL" "$ADMIN_PRENOM" "$ADMIN_NOM" admin

echo ""
echo "============================================================"
echo "  Installation terminée."
echo ""
echo "  Adresse : https://$DOMAIN"
echo "  Compte  : $ADMIN_EMAIL"
echo ""
echo "  1. Ouvrez l'adresse ci-dessus depuis le poste du cabinet."
echo "  2. Cliquez sur « Premier appareil ou nouvel appareil ? »."
echo "  3. Saisissez le code affiché plus haut."
echo "  4. Votre appareil demandera empreinte, visage ou code : c'est fait."
echo ""
echo "  ⚠️  Enrôlez ensuite un DEUXIÈME appareil (Paramètres ▸ Sécurité)."
echo "      Sans mot de passe de secours, perdre l'unique appareil enrôlé"
echo "      oblige à repasser par la ligne de commande du serveur."
echo ""
echo "  Nouveau code si besoin :"
echo "    cd $DIR && docker compose exec app node dist/cli/enrolement.js $ADMIN_EMAIL"
echo ""
echo "  Mise à jour :  cd $DIR && sh installation/maj.sh"
echo "  Notice complète : $DIR/installation/NOTICE-INSTALLATION.md"
echo "============================================================"
echo ""
