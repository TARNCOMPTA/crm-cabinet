#!/bin/sh
# ============================================================================
# CRM Cabinet — récepteur des sauvegardes, sur le SERVEUR DE SAUVEGARDE.
#
#   sudo sh recepteur-sauvegarde.sh installer 'ssh-ed25519 AAAA... crm-sauvegarde'
#
# La ligne entre apostrophes est celle qu'affiche, sur le serveur du CRM,
#   sudo sh /opt/crmcabinet/installation/sauvegarde-distante.sh preparer <adresse>
#
# Ce script ne s'installe PAS sur le serveur du CRM : il va sur la machine qui
# reçoit les copies. Il y crée un compte `crmsauve` qui ne sait faire que deux
# choses, quelle que soit la commande qu'on lui envoie par SSH :
#
#   deposer <nom>   recevoir UNE nouvelle sauvegarde, chiffrée, sur l'entrée
#   etat            dire combien de sauvegardes sont gardées, et la dernière
#
# ⚠️ POURQUOI SI PEU, ET C'EST TOUT L'INTÉRÊT.
#
# Une copie hors site protège de deux choses : la perte du serveur du CRM, et
# son piratage. Contre la seconde, une copie que le serveur piraté peut EFFACER
# ou RÉÉCRIRE ne protège de rien — c'est la première chose que fait un
# rançongiciel. Ici la clé SSH posée sur le serveur du CRM ne permet ni de lire,
# ni d'effacer, ni d'écraser : seulement d'ajouter. Le ménage des anciennes
# copies est décidé par CE script, sur l'heure de CETTE machine, et un
# expéditeur malveillant ne peut pas l'accélérer.
#
# Et le récepteur REFUSE tout fichier qui n'est pas chiffré (en-tête `age`) :
# les fiches clients ne peuvent pas arriver en clair chez l'hébergeur, même par
# erreur de configuration de l'autre côté.
#
# Conservation : tout ce qui a moins de 35 jours, puis la première copie de
# chaque mois pendant un an.
# ============================================================================
set -eu

COMPTE="crmsauve"
DOSSIER="${RECEPTEUR_DOSSIER:-/srv/crm-sauvegardes}"
BINAIRE="/usr/local/bin/crm-recepteur-sauvegarde"
JOURS_TOUT=35
JOURS_MENSUEL=366
# Au-delà, c'est une boucle ou un expéditeur compromis qui remplit le disque.
DEPOTS_PAR_JOUR=4
# 50 Gio : largement au-dessus d'une instance de cabinet, bien en dessous d'un
# disque rempli par un flux sans fin.
OCTETS_MAX=53687091200

refuser() {
  echo "REFUS $*"
  exit 1
}

# ---------------------------------------------------------------------------
# Installation (root, une fois)
# ---------------------------------------------------------------------------
installer() {
  [ "$(id -u)" -eq 0 ] || { echo "À lancer avec sudo." >&2; exit 1; }
  CLE="${1:-}"
  case "$CLE" in
    ssh-ed25519\ *) ;;
    *) echo "Il faut la ligne « ssh-ed25519 ... » affichée par le serveur du CRM, entre apostrophes." >&2; exit 1 ;;
  esac
  # Une ligne contenant une virgule, un guillemet ou un saut de ligne pourrait
  # ajouter des options à authorized_keys — et en retirer « restrict ».
  case "$CLE" in
    *\"*|*,*) echo "Clé refusée : caractère inattendu." >&2; exit 1 ;;
  esac
  [ "$(printf '%s' "$CLE" | wc -l)" -eq 0 ] || { echo "Clé refusée : plusieurs lignes." >&2; exit 1; }

  if ! command -v age >/dev/null 2>&1; then
    echo "Installation de age (lecture de l'en-tête des fichiers reçus)..."
    apt-get update -qq && apt-get install -y -qq age >/dev/null
  fi

  id "$COMPTE" >/dev/null 2>&1 || useradd --create-home --shell /bin/sh "$COMPTE"
  # Pas de mot de passe : ce compte ne s'ouvre que par la clé, et seulement sur
  # la commande imposée plus bas.
  passwd -l "$COMPTE" >/dev/null 2>&1 || true

  install -d -m 700 -o "$COMPTE" -g "$COMPTE" "$DOSSIER"
  install -m 755 -o root -g root "$0" "$BINAIRE"

  # authorized_keys appartient à ROOT : le compte ne peut pas le modifier, donc
  # ne peut pas retirer la commande imposée, même s'il obtenait un shell.
  MAISON=$(getent passwd "$COMPTE" | cut -d: -f6)
  install -d -m 755 -o root -g root "$MAISON/.ssh"
  printf 'restrict,command="%s" %s\n' "$BINAIRE" "$CLE" > "$MAISON/.ssh/authorized_keys"
  chown root:root "$MAISON/.ssh/authorized_keys"
  chmod 644 "$MAISON/.ssh/authorized_keys"

  echo ""
  echo "Récepteur installé."
  echo "  Compte   : $COMPTE (dépôt seulement, aucun shell)"
  echo "  Dossier  : $DOSSIER"
  echo ""
  echo "Sur le serveur du CRM, vérifiez maintenant la liaison :"
  echo "  sudo sh /opt/crmcabinet/installation/sauvegarde-distante.sh essai"
}

# ---------------------------------------------------------------------------
# Ménage : décidé ici, sur l'heure de cette machine
# ---------------------------------------------------------------------------
menage() {
  MAINTENANT=$(date +%s)
  MOIS_VUS=" "
  # Du plus ancien au plus récent : la première copie d'un mois est la plus
  # ancienne de ce mois, c'est elle qu'on garde.
  ls -1tr "$DOSSIER" 2>/dev/null | while read -r f; do
    case "$f" in crm_*.tar.age) ;; *) continue ;; esac
    T=$(stat -c %Y "$DOSSIER/$f")
    AGE_J=$(( (MAINTENANT - T) / 86400 ))
    MOIS=$(date -d "@$T" +%Y-%m)
    PREMIER=0
    case "$MOIS_VUS" in *" $MOIS "*) ;; *) PREMIER=1; MOIS_VUS="$MOIS_VUS$MOIS " ;; esac
    if [ "$AGE_J" -lt "$JOURS_TOUT" ]; then continue; fi
    if [ "$AGE_J" -lt "$JOURS_MENSUEL" ] && [ "$PREMIER" -eq 1 ]; then continue; fi
    rm -f "$DOSSIER/$f"
  done
}

# ---------------------------------------------------------------------------
# Dépôt
# ---------------------------------------------------------------------------
deposer() {
  NOM="$1"
  case "$NOM" in
    crm_[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]_[0-9][0-9][0-9][0-9][0-9][0-9].tar.age) ;;
    *) refuser "nom invalide" ;;
  esac
  [ -e "$DOSSIER/$NOM" ] && refuser "existe deja"

  RECENTS=$(find "$DOSSIER" -maxdepth 1 -name 'crm_*.tar.age' -mmin -1440 | wc -l)
  [ "$RECENTS" -ge "$DEPOTS_PAR_JOUR" ] && refuser "trop de depots en 24 h"

  TMP="$DOSSIER/.en-cours-$$"
  trap 'rm -f "$TMP"' EXIT
  ( umask 077; head -c "$OCTETS_MAX" > "$TMP" )

  # Le contrôle qui tient les données clients hors de portée de l'hébergeur.
  if [ "$(head -c 21 "$TMP")" != "age-encryption.org/v1" ]; then
    refuser "fichier non chiffre"
  fi
  OCTETS=$(stat -c %s "$TMP")
  [ "$OCTETS" -ge "$OCTETS_MAX" ] && refuser "trop volumineux"

  # `ln` échoue si la cible existe : deux dépôts simultanés du même nom ne
  # s'écrasent pas.
  ln "$TMP" "$DOSSIER/$NOM" 2>/dev/null || refuser "existe deja"
  rm -f "$TMP"
  trap - EXIT

  EMPREINTE=$(sha256sum "$DOSSIER/$NOM" | cut -d' ' -f1)
  menage
  echo "OK $EMPREINTE $OCTETS"
}

etat() {
  N=$(find "$DOSSIER" -maxdepth 1 -name 'crm_*.tar.age' | wc -l)
  DERNIERE=$(ls -1t "$DOSSIER" 2>/dev/null | grep '^crm_.*\.tar\.age$' | head -1 || true)
  LIBRE=$(df -Pk "$DOSSIER" | awk 'NR==2 {print int($4/1024)}')
  echo "OK sauvegardes=$N derniere=${DERNIERE:-aucune} libre_mo=$LIBRE"
}

# ---------------------------------------------------------------------------
# Aiguillage
# ---------------------------------------------------------------------------
if [ "${1:-}" = "installer" ]; then
  shift
  installer "$@"
  exit 0
fi

# Appelé par sshd comme commande imposée : la commande DEMANDÉE n'est qu'une
# donnée, lue ici et jamais exécutée.
DEMANDE="${SSH_ORIGINAL_COMMAND:-}"
set -f
# shellcheck disable=SC2086
set -- $DEMANDE
set +f
case "${1:-}" in
  deposer) [ "$#" -eq 2 ] || refuser "usage"; deposer "$2" ;;
  etat) [ "$#" -eq 1 ] || refuser "usage"; etat ;;
  *) refuser "commande inconnue" ;;
esac
