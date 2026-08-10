# CRM Cabinet — installation et exploitation

Logiciel libre de gestion de cabinet comptable, **auto-hébergé** : le cabinet
installe l'application sur son propre serveur, avec sa propre base de données.
Personne d'autre n'y a accès — ni l'auteur du logiciel, ni aucun tiers.

---

## Avant de commencer

| Il faut | Pourquoi |
|---|---|
| Un VPS Ubuntu 22.04, 24.04 ou 26.04 | 2 Go de RAM, 20 Go de disque suffisent |
| Un nom de domaine, DNS A pointant sur le serveur | Le certificat HTTPS échoue sinon |
| Un navigateur récent sur les postes | La connexion se fait par passkey |

### ⚠️ Le domaine est définitif

Les passkeys sont **liées au domaine**. Ce n'est pas un choix d'implémentation :
c'est le mécanisme même de WebAuthn, et c'est ce qui les rend insensibles au
hameçonnage. Conséquence directe :

> **Changer le domaine invalide toutes les passkeys déjà enrôlées.**
> Chaque collaborateur devra réenrôler son appareil avec un nouveau code.

Choisissez donc le domaine définitif dès l'installation. `crm.moncabinet.fr` est
un bon choix ; `crm-test.moncabinet.fr` en est un mauvais.

---

## Installation

```sh
curl -fsSL https://raw.githubusercontent.com/TARNCOMPTA/crmcabinet/main/installation/install.sh -o install.sh
sudo sh install.sh
```

Le script demande le domaine, deux adresses e-mail et le nom du premier
administrateur. Il installe Docker, ouvre le pare-feu, génère les secrets,
démarre l'instance, puis **affiche un code d'enrôlement**.

### Il n'y a pas de mot de passe

Ni à l'installation, ni ensuite. La connexion se fait par passkey : votre
appareil vous demande votre empreinte, votre visage ou votre code, et c'est tout.

Pourquoi ce choix : un mot de passe se réutilise d'un site à l'autre, se
communique par message, s'attrape par hameçonnage, et finit dans les fuites. Une
passkey ne quitte jamais l'appareil et ne fonctionne que sur le domaine pour
lequel elle a été créée.

Le **code d'enrôlement** remplace le « mot de passe oublié » : un administrateur
en génère un, la personne le saisit une fois, et son appareil est enrôlé. Le code
vaut une heure et ne sert qu'une fois.

### Après l'installation

1. Ouvrez `https://votre-domaine` depuis un poste du cabinet.
2. Cliquez sur **« Premier appareil ou nouvel appareil ? »**.
3. Saisissez le code affiché par le script.
4. Validez sur votre appareil.

**Puis, immédiatement : enrôlez un deuxième appareil.**
Paramètres ▸ Sécurité ▸ Enrôler un appareil. Votre téléphone convient très bien.

Sans mot de passe de secours, perdre l'unique appareil enrôlé oblige à repasser
par la ligne de commande du serveur. Avec deux appareils, il n'y a jamais de
situation bloquée. L'application vous le rappelle tant qu'une seule passkey
existe.

---

## Réglages à faire dans l'application

### Le cabinet
Paramètres ▸ Mon cabinet : nom, adresse, SIRET, logo. Ces informations
apparaissent en en-tête des PDF générés.

### L'envoi de courrier (recommandé)
Paramètres ▸ Notifications. Renseignez le serveur SMTP de votre hébergeur ou de
votre domaine.

Sans SMTP, l'application fonctionne mais n'envoie ni notification ni invitation :
les codes d'enrôlement s'affichent alors à l'écran au lieu d'être envoyés. C'est
utilisable, simplement moins pratique.

Aucun courrier ne passe par un service tiers — ils partent de votre propre
serveur, donc de votre propre domaine.

### L'INPI (facultatif)
`INPI_USERNAME` et `INPI_PASSWORD` dans le fichier `.env`, avec les identifiants
de votre compte `data.inpi.fr`. Cela active la récupération automatique des
fiches d'entreprise et des actes juridiques.

Après modification du `.env` :

```sh
cd /opt/crmcabinet && docker compose up -d
```

### Les collaborateurs
Paramètres ▸ Collaborateurs ▸ Inviter. Chacun reçoit un code d'enrôlement par
courrier — ou affiché à l'écran si le SMTP n'est pas encore réglé.

---

## Mise à jour

```sh
sudo sh /opt/crmcabinet/installation/maj.sh
```

Le script **sauvegarde la base avant toute modification**, récupère le code,
reconstruit et vérifie que l'application répond. En cas de problème, il affiche
la commande de retour en arrière.

Il reconstruit aussi quand le **`.env` a changé**, même sans nouveau code : les
réglages sont injectés au démarrage du conteneur, donc modifier le fichier sans
recréer le conteneur ne change rien. Sans ce contrôle, le script répondait
« Déjà à jour » — vrai du code, faux de l'instance.

Les mises à jour ne sont **jamais** appliquées automatiquement. Vous décidez
quand, et vous pouvez rester sur une version aussi longtemps que vous voulez.

Les dix dernières sauvegardes sont conservées dans `data/sauvegardes/`.

### Mettre à jour depuis GitHub, sans terminal (facultatif)

```sh
sudo sh /opt/crmcabinet/installation/runner.sh
```

Installe sur le serveur l'agent qui exécute le workflow **Deploiement**. La mise
à jour se déclenche ensuite depuis GitHub — *Actions ▸ Deploiement ▸ Run
workflow* — avec une case « Reconstruire même sans nouveau commit ».

Le script demande un jeton d'enregistrement, à prendre sur
`<votre dépôt>/settings/actions/runners/new` (valable une heure).

> **À savoir avant de l'installer.** Le workflow lance `maj.sh` en root sur ce
> serveur. **Quiconque peut pousser sur la branche par défaut du dépôt peut donc
> y exécuter du code en root.** C'est la nature d'un déploiement auto-hébergé,
> et la raison pour laquelle ce workflow n'a aucun déclencheur `push` ni
> `pull_request` : seul un lancement manuel, réservé à qui a les droits sur le
> dépôt. À n'installer que si le dépôt et le serveur sont sous la même
> responsabilité.

Le runner tourne sous un compte dédié `crm-runner`, **hors du groupe `docker`**
— qui aurait donné root en entier et sans trace. Il reçoit à la place deux
droits nommés dans `/etc/sudoers.d/crm-runner` : `maj.sh` et `docker`.

Pour le retirer :

```sh
cd /opt/actions-runner && sudo ./svc.sh stop && sudo ./svc.sh uninstall
sudo rm /etc/sudoers.d/crm-runner
```

---

## Sauvegarde

Deux choses à sauvegarder **hors du serveur** :

| Quoi | Comment |
|---|---|
| La base | `docker compose exec -T app sh -c 'pg_dump "$DATABASE_URL"' \| gzip > base.sql.gz` |
| Les fichiers et le `.env` | Le dossier `/opt/crmcabinet/data` et le fichier `/opt/crmcabinet/.env` |

Le `.env` contient `SESSION_SECRET` et le mot de passe de la base. Le perdre
signifie déconnecter tout le monde et ne plus pouvoir lire le volume de données.
Il fait partie de la sauvegarde, au même titre que les données.

Exemple de sauvegarde quotidienne, à mettre dans la crontab de `root` :

```
30 2 * * * cd /opt/crmcabinet && docker compose exec -T app sh -c 'pg_dump "$DATABASE_URL"' | gzip > /var/sauvegardes/crm_$(date +\%F).sql.gz
```

### Restauration

```sh
cd /opt/crmcabinet
gunzip -c base.sql.gz | docker compose exec -T app sh -c 'psql "$DATABASE_URL"'
```

---

## En cas de problème

| Symptôme | À regarder |
|---|---|
| Le site ne répond pas | `docker compose logs --tail=50 app` |
| Certificat HTTPS en échec | Le DNS A pointe-t-il bien sur ce serveur ? `docker compose logs caddy` |
| « Aucune passkey disponible » | Le domaine a-t-il changé ? Sinon : nouveau code d'enrôlement |
| Aucun courrier ne part | Paramètres ▸ Notifications ▸ Tester la connexion, puis Envoyer un essai |
| Plus aucun accès | Voir ci-dessous |

### Regénérer un code d'enrôlement

```sh
cd /opt/crmcabinet && docker compose exec app node dist/cli/enrolement.js votre@email.fr
```

### Plus aucun accès du tout

Le code d'enrôlement se génère depuis le serveur, en SSH : il n'y a donc pas de
situation sans issue tant que vous avez accès au VPS.

```sh
cd /opt/crmcabinet
docker compose exec app node dist/cli/enrolement.js --creer secours@moncabinet.fr Secours Admin admin
```

---

## Ce que le logiciel ne fait pas

Par construction, et c'est délibéré :

- **Aucune télémétrie.** L'instance ne signale rien à personne. Ni statistiques
  d'usage, ni rapport d'erreur, ni « ping » de vérification de licence.
- **Aucun accès distant.** L'auteur du logiciel n'a aucun moyen d'entrer dans
  votre instance.
- **Un seul flux sortant**, en dehors des services que vous configurez vous-même
  (SMTP, INPI, BODACC) : la lecture d'un fichier de version sur GitHub, pour vous
  signaler qu'une mise à jour existe. Il se coupe avec `UPDATE_DISABLED=1`.

Conséquence juridique : **votre cabinet est seul responsable de traitement** au
sens du RGPD sur les données de cette instance. Il n'y a pas de sous-traitant à
déclarer, pas de contrat de sous-traitance à signer, pas de transfert hors UE à
justifier.

---

## Ce qu'il y a sous le capot

Quatre conteneurs :

| Service | Rôle |
|---|---|
| `db` | PostgreSQL 17. Vos données. Non exposé au réseau. |
| `postgrest` | Traduit les requêtes de l'interface en SQL. Non exposé au réseau. |
| `app` | Node : authentification, courrier, synchronisations, tâches planifiées, interface. |
| `caddy` | HTTPS automatique. Seul service publié (80/443). |

`postgrest` n'est joignable que par `app`, qui contrôle la session avant de
relayer. Aucune requête n'atteint la base sans être passée par ce contrôle.

---

## Licence

MIT. Vous pouvez l'utiliser, le modifier et le redistribuer librement, y compris
commercialement. Aucune garantie n'est fournie.

Dépôt : <https://github.com/TARNCOMPTA/crmcabinet>
