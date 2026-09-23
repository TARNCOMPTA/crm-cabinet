#!/bin/sh
# ============================================================================
# CRM Cabinet — copie chiffrée de la sauvegarde sur un AUTRE serveur.
#
#   sudo sh /opt/crmcabinet/installation/sauvegarde-distante.sh preparer <adresse> [port]
#   sudo sh /opt/crmcabinet/installation/sauvegarde-distante.sh essai
#   sudo sh /opt/crmcabinet/installation/sauvegarde-distante.sh          (la copie)
#
# `preparer` se lance une fois. Il crée les clés, programme la copie chaque
# nuit à 3 h 15, et affiche la commande à lancer sur le serveur de sauvegarde
# (voir `recepteur-sauvegarde.sh`). `essai` vérifie la liaison sans rien
# envoyer. Sans argument, le script fait la copie — c'est ce que lance cron.
#
# CE QUI PART : la base (pg_dump), le dossier `data/` (fichiers déposés dans
# l'application) sauf les sauvegardes locales de maj.sh, et le `.env`. Le `.env`
# en fait partie : sans lui, on ne relance pas l'instance sur un serveur neuf.
#
# ⚠️ TOUT PART CHIFFRÉ, ET LA CLÉ DE DÉCHIFFREMENT NE RESTE NULLE PART ICI.
#
# L'archive est chiffrée avec `age` pour une clé publique. La clé privée
# correspondante est écrite UNE fois, par `preparer`, dans
# /root/CLE-RESTAURATION-CRM.txt — à recopier dans un gestionnaire de mots de
# passe, puis à effacer du serveur. Ni le serveur du CRM ni celui de sauvegarde
# ne peuvent alors relire une copie ; l'hébergeur non plus. Le revers est à
# connaître : SANS CETTE CLÉ, LES COPIES SONT DÉFINITIVEMENT ILLISIBLES.
#
# Le résultat de chaque copie est écrit dans `data/sauvegarde-distante.json`,
# et le détail dans /var/log/crm-sauvegarde-distante.log.
# ============================================================================
set -eu

DIR="${SAUVEGARDE_DIR:-/opt/crmcabinet}"
CONF_DIR="${SAUVEGARDE_CONF_DIR:-/etc/crmcabinet/sauvegarde-distante}"
SSH="${SAUVEGARDE_SSH:-ssh}"
CLE_PRIVEE_A_RECOPIER="${SAUVEGARDE_CLE_RESTAURATION:-/root/CLE-RESTAURATION-CRM.txt}"
CONF="$CONF_DIR/destination.conf"
CLE_SSH="$CONF_DIR/cle_ssh"
DESTINATAIRE="$CONF_DIR/destinataire.age"
HOTES_CONNUS="$CONF_DIR/known_hosts"
ETAT="$DIR/data/sauvegarde-distante.json"

horodatage() { date -u +%Y-%m-%dT%H:%M:%SZ; }

connexion() {
  # shellcheck disable=SC1090
  . "$CONF"
  # accept-new : la première connexion retient l'empreinte du serveur, les
  # suivantes la vérifient. Un serveur qui change d'empreinte fait échouer la
  # copie — c'est voulu, c'est le signe d'une substitution ou d'une réinstallation.
  "$SSH" -i "$CLE_SSH" -p "$PORT" \
    -o IdentitiesOnly=yes -o BatchMode=yes \
    -o StrictHostKeyChecking=accept-new -o UserKnownHostsFile="$HOTES_CONNUS" \
    -o ConnectTimeout=20 \
    "$DESTINATION" "$@"
}

# ---------------------------------------------------------------------------
# preparer <adresse> [port]
# ---------------------------------------------------------------------------
preparer() {
  [ "$(id -u)" -eq 0 ] || { echo "À lancer avec sudo." >&2; exit 1; }
  ADRESSE="${1:-}"
  PORT_CHOISI="${2:-22}"
  [ -n "$ADRESSE" ] || { echo "Usage : $0 preparer <adresse du serveur de sauvegarde> [port]" >&2; exit 1; }
  case "$ADRESSE$PORT_CHOISI" in
    *[!A-Za-z0-9.:-]*) echo "Adresse ou port invalide." >&2; exit 1 ;;
  esac

  if ! command -v age >/dev/null 2>&1; then
    echo "Installation de age (chiffrement)..."
    apt-get update -qq && apt-get install -y -qq age >/dev/null
  fi

  install -d -m 700 "$CONF_DIR"
  [ -f "$CLE_SSH" ] || ssh-keygen -q -t ed25519 -N '' -C crm-sauvegarde -f "$CLE_SSH"

  if [ ! -f "$DESTINATAIRE" ]; then
    ( umask 077; age-keygen -o "$CLE_PRIVEE_A_RECOPIER" 2>/dev/null )
    age-keygen -y "$CLE_PRIVEE_A_RECOPIER" > "$DESTINATAIRE"
    NOUVELLE_CLE=1
  else
    NOUVELLE_CLE=0
  fi

  printf 'DESTINATION=crmsauve@%s\nPORT=%s\n' "$ADRESSE" "$PORT_CHOISI" > "$CONF"
  chmod 600 "$CONF"

  cat > /etc/cron.d/crmcabinet-sauvegarde-distante <<CRON
# Copie chiffree de la sauvegarde hors du serveur. Voir $DIR/installation/sauvegarde-distante.sh
PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
15 3 * * * root sh $DIR/installation/sauvegarde-distante.sh >> /var/log/crm-sauvegarde-distante.log 2>&1
CRON
  chmod 644 /etc/cron.d/crmcabinet-sauvegarde-distante

  echo ""
  echo "============================================================"
  echo "  1) Sur le SERVEUR DE SAUVEGARDE ($ADRESSE), lancez :"
  echo ""
  echo "  curl -fsSLO https://raw.githubusercontent.com/TARNCOMPTA/crm-cabinet/main/installation/recepteur-sauvegarde.sh"
  echo "  sudo sh recepteur-sauvegarde.sh installer '$(cat "$CLE_SSH.pub")'"
  echo ""
  echo "  2) Puis, ICI :"
  echo "  sudo sh $DIR/installation/sauvegarde-distante.sh essai"
  echo "============================================================"
  if [ "$NOUVELLE_CLE" -eq 1 ]; then
    echo ""
    echo "  ⚠️  CLÉ DE RESTAURATION : $CLE_PRIVEE_A_RECOPIER"
    echo ""
    echo "  Recopiez son contenu dans votre gestionnaire de mots de passe,"
    echo "  puis effacez-la de ce serveur :"
    echo "    sudo shred -u $CLE_PRIVEE_A_RECOPIER"
    echo ""
    echo "  Sans elle, AUCUNE copie ne pourra jamais être relue."
    echo "============================================================"
  fi
}

# ---------------------------------------------------------------------------
# essai
# ---------------------------------------------------------------------------
essai() {
  [ -f "$CONF" ] || { echo "Pas encore préparé : lancez d'abord « preparer »." >&2; exit 1; }
  REPONSE=$(connexion etat 2>&1) || { echo "Liaison impossible : $REPONSE" >&2; exit 1; }
  echo "Liaison établie : $REPONSE"
  [ -f "$CLE_PRIVEE_A_RECOPIER" ] && {
    echo ""
    echo "⚠️  $CLE_PRIVEE_A_RECOPIER est toujours sur ce serveur."
    echo "   Recopiez-la en lieu sûr, puis : sudo shred -u $CLE_PRIVEE_A_RECOPIER"
  }
  return 0
}

# ---------------------------------------------------------------------------
# La copie
# ---------------------------------------------------------------------------
ecrire_etat() {
  # La dernière réussite est gardée quand une copie échoue : c'est elle qui dit
  # depuis quand on est découvert.
  PRECEDENTE=$(sed -n 's/.*"derniere_reussite": *"\([^"]*\)".*/\1/p' "$ETAT" 2>/dev/null || true)
  if [ "$1" = ok ]; then
    printf '{"derniere_reussite": "%s", "fichier": "%s", "octets": %s}\n' "$(horodatage)" "$2" "$3" > "$ETAT"
  else
    printf '{"derniere_reussite": "%s", "dernier_echec": "%s", "raison": "%s"}\n' \
      "$PRECEDENTE" "$(horodatage)" "$(printf '%s' "$2" | tr -d '"\\\n' | cut -c1-200)" > "$ETAT"
  fi
}

echouer() {
  echo "$(horodatage) ÉCHEC : $1" >&2
  ecrire_etat echec "$1"
  exit 1
}

copier() {
  [ -f "$CONF" ] && [ -f "$DESTINATAIRE" ] && [ -f "$CLE_SSH" ] \
    || echouer "non préparé (lancer : sauvegarde-distante.sh preparer <adresse>)"

  NOM="crm_$(date -u +%Y-%m-%d_%H%M%S).tar.age"
  TRAVAIL=$(mktemp -d)
  chmod 700 "$TRAVAIL"
  trap 'rm -rf "$TRAVAIL"' EXIT

  cd "$DIR"
  ( umask 077; docker compose exec -T app sh -c 'pg_dump "$DATABASE_URL"' | gzip > "$TRAVAIL/base.sql.gz" ) \
    || echouer "pg_dump"
  OCTETS=$(wc -c < "$TRAVAIL/base.sql.gz")
  # Même seuil que maj.sh : un pg_dump qui échoue en silence rend un gzip vide.
  [ "$OCTETS" -ge 2048 ] || echouer "sauvegarde de la base suspecte ($OCTETS octets)"

  # Le tar ne contient qu'une copie de la base : celle de cette nuit. Les dix
  # de maj.sh doubleraient le volume pour rien.
  ( umask 077
    tar -cf - --exclude=./data/sauvegardes -C "$DIR" ./.env ./data -C "$TRAVAIL" ./base.sql.gz \
      | age -R "$DESTINATAIRE" > "$TRAVAIL/$NOM" ) || echouer "archive ou chiffrement"

  LOCALE=$(sha256sum "$TRAVAIL/$NOM" | cut -d' ' -f1)
  REPONSE=$(connexion "deposer $NOM" < "$TRAVAIL/$NOM" 2>&1) || echouer "envoi : $REPONSE"
  set -- $REPONSE
  [ "${1:-}" = OK ] || echouer "envoi : $REPONSE"
  # Le récepteur calcule l'empreinte de ce qu'il a écrit sur SON disque : une
  # copie tronquée ou altérée en route ne passe pas pour réussie.
  [ "${2:-}" = "$LOCALE" ] || echouer "empreinte différente après envoi"

  TAILLE=$(wc -c < "$TRAVAIL/$NOM")
  ecrire_etat ok "$NOM" "$TAILLE"
  echo "$(horodatage) OK $NOM ($TAILLE octets)"
}

case "${1:-}" in
  preparer) shift; preparer "$@" ;;
  essai) essai ;;
  "") copier ;;
  *) echo "Usage : $0 [preparer <adresse> [port] | essai]" >&2; exit 1 ;;
esac
