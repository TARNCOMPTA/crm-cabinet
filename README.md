# CRM Cabinet

Logiciel libre de gestion de cabinet d'expertise comptable. **Auto-hébergé** : le
cabinet l'installe sur son propre serveur, avec sa propre base de données.
Personne d'autre n'y accède.

---

## Installation

Un VPS Ubuntu, un nom de domaine, une commande :

```bash
curl -fsSL https://raw.githubusercontent.com/TARNCOMPTA/crm-cabinet/main/installation/install.sh -o install.sh && sudo sh install.sh
```

Le script installe Docker, ouvre le pare-feu, génère les secrets, démarre
l'instance en HTTPS et affiche un code d'enrôlement de passkey.

Détail complet : [installation/NOTICE-INSTALLATION.md](installation/NOTICE-INSTALLATION.md).

---

## Ce que ça fait

- **Clients** — fiches, dirigeants, habilitations, régimes fiscaux, annuaire
- **Dossiers** — tâches, bilans, échéances fiscales, assemblées générales
- **Juridique** — actes déposés au registre, dépôts de comptes au BODACC,
  alertes, suivi des dépôts
- **Commercial** — opportunités, relances, déclarations de revenus
- **Outils** — simulateur d'exonérations, recherche de communes, autorisations
  fiscales
- **Suivi des échéances** — les déclarations télétransmises via jedeclare, en
  tableau société × mois, un onglet par type (TVA CA3, liasse IS, DAS2…), avec
  l'état d'avancement du cabinet à côté de celui du destinataire
- **Synchronisation** — INPI (fiches et actes), BODACC (dépôts de comptes),
  jedeclare (accusés de télétransmission)
- **TVA intracommunautaire** — numéro calculé depuis le SIREN, vérifié auprès du
  registre européen VIES d'un clic, à la création d'une fiche, et une fois par
  mois par petits lots espacés
- **Connecteur MCP** — accès en lecture depuis un assistant IA, par clé d'API

---

## Ce qui est délibérément absent

- **Aucune télémétrie**, aucun ping, aucun rapport d'usage
- **Aucun accès distant** de l'auteur du logiciel à votre instance
- **Aucun mot de passe** : la connexion se fait par passkey
- **Aucun service tiers** imposé : le courrier part de votre SMTP, et les seuls
  appels sortants sont ceux que vous activez (INPI, BODACC, jedeclare — avec
  **votre** compte, jamais un compte mutualisé), plus le registre public VIES.
  Chacun est déclaré ici, et vous pouvez le couper

  > **Ce qui part tout seul, et il faut le savoir.** INPI, BODACC et jedeclare
  > se synchronisent selon le rythme que vous réglez. VIES est interrogé quand
  > vous cliquez, quand vous créez une fiche, et une fois par mois par fiche —
  > un petit lot par jour, cinq secondes entre deux appels, arrêt automatique si
  > le service ne répond plus. Un numéro intracommunautaire se désactive sans
  > prévenir : c'est ce que ce contrôle mensuel existe pour attraper.
  > `VIES_PERIODIQUE_DISABLED=1` coupe la partie périodique en gardant le
  > bouton ; `VIES_DISABLED=1` coupe tout. Aucun de ces appels n'envoie de
  > données de vos clients au-delà du numéro ou de l'identifiant interrogé

Conséquence : **votre cabinet est seul responsable de traitement** au sens du
RGPD. Pas de sous-traitant à déclarer, pas de contrat à signer, pas de transfert
hors UE à justifier.

Seul flux sortant du produit lui-même : la lecture d'un fichier de version sur
GitHub, pour signaler qu'une mise à jour existe. `UPDATE_DISABLED=1` le coupe.

---

## Architecture

```
Navigateur
    │  HTTPS
    ▼
 Caddy ──────► app (Node 20 + Fastify)
                 │  ├─ authentification par passkey (WebAuthn)
                 │  ├─ routes métier (INPI, BODACC, PDF, courrier, MCP)
                 │  ├─ ordonnanceur interne (7 tâches)
                 │  └─ front React servi en statique
                 │
                 ├──► postgrest ──┐
                 │                ▼
                 └──────────► PostgreSQL 17
```

Quatre conteneurs. Seul Caddy est publié ; la base et PostgREST ne sont
joignables que depuis le réseau interne.

**Pourquoi PostgREST** : l'interface compte 70 requêtes qui reposent sur sa
sémantique — sélections imbriquées, filtres `or`, comptages exacts. Le remplacer
aurait voulu dire les réécrire toutes, sans rien y gagner. `app` contrôle la
session avant de relayer : aucune requête n'atteint la base sans ce contrôle.

**Stack** : React 18 · TypeScript strict · Tailwind · Vite · Fastify 5 ·
PostgreSQL 17 · WebAuthn · nodemailer

---

## Développement

```bash
# Base de données
docker compose up -d db postgrest

# Serveur
cd server && npm install && npm run dev

# Front (autre terminal)
npm install && npm run dev
```

Copiez `.env.exemple` en `.env` et remplissez-le. Le serveur écoute sur 3000, le
front sur 5173 avec un mandataire vers 3000 — même origine côté navigateur, donc
le cookie de session fonctionne comme en production.

Premier compte :

```bash
cd server && npm run enrolement -- --creer vous@exemple.fr Prenom Nom admin
```

### Le harnais local

Une instance complète — PostgreSQL, PostgREST, le serveur, le front construit et
un portefeuille de démonstration — en une commande :

```bash
sh scripts/harnais.sh
```

Elle rend l'adresse et un code d'enrôlement. Comptez quelques secondes si Docker
tourne, un peu plus au premier lancement (le binaire PostgREST est téléchargé
dans `.harnais/`, à la version qu'épingle `docker-compose.yml`).

```bash
sh scripts/harnais.sh etat      # ce qui tourne
sh scripts/harnais.sh code      # un nouveau code d'enrôlement
sh scripts/harnais.sh arreter   # arrêter, garder la base
sh scripts/harnais.sh raser     # tout supprimer
```

Les données sont **entièrement fictives** (`scripts/donnees-demonstration.sql`) :
treize sociétés, sept dirigeants, des tâches, des opportunités. Aucune société,
personne ni SIREN réel — de quoi montrer le produit sans jamais ouvrir un dossier
client. Le fichier refuse de s'appliquer à une base qui porte déjà des clients.

Deux bases sont montées, et ce n'est pas du confort : `schema.test.ts` et
`mcp-sql.test.ts` commencent par `DROP SCHEMA public CASCADE`. La base d'essai
est donc séparée de celle de l'instance, et jetable.

### Vérifications

```bash
npm run test:tout   # la totale : typecheck, eslint, 753 tests
```

Prérequis : le harnais tourne.

⚠️ **`npm test` seul ne dit pas tout, et son chiffre est trompeur.** Il affiche
`643 passed | 110 skipped` : les 110 sont `schema.test.ts`, `mcp-sql.test.ts` et
`e2e.test.ts`, c'est-à-dire **toute la couche base de données et toute la couche
navigateur**. Elles s'ignorent d'elles-mêmes faute de `DATABASE_URL_TEST` et de
`E2E_BASE_URL`.

Le problème n'est pas qu'elles s'ignorent — c'est raisonnable sur un poste sans
base. Le problème est que **sauter ressemble à réussir** : la sortie est verte,
le compte est gros, et rien ne distingue « tout va bien » de « on n'a pas
regardé ». Le 2026-08-29 une régression est partie en CI pour ce motif exact, un
test e2e cherchant « repartition » quand le produit écrivait « répartition ».

`npm run test:tout` **échoue si un seul test est ignoré**, et nomme le fichier.

Les commandes séparées restent disponibles :

```bash
npm run typecheck   # front
npm run test        # vitest, sans infrastructure
npm run build       # vite
cd server && npm run typecheck && npm run build
```

### Le parcours de bout en bout

La connexion se fait par passkey, donc par `navigator.credentials`, donc par un
authentificateur : aucun script ne peut ouvrir une session. Chromium en expose un
**virtuel** par le protocole DevTools, et c'est le seul angle depuis lequel
l'enrôlement et la connexion sont observables.

`npm run test:tout` s'en charge. À la main, contre une instance qui tourne :

```bash
npx playwright install chromium                      # une fois
sh scripts/harnais.sh code                           # un code, valable une heure
E2E_BASE_URL=http://localhost:3100 E2E_CODE_ENROLEMENT=XXXXX-XXXXX npm run test:e2e
```

Le code est à usage unique : chaque exécution en demande un nouveau. La CI monte
la même pile dans le job `navigateur`.

---

## Mise à jour d'une instance

```bash
cd /opt/crmcabinet && sh installation/maj.sh
```

La base est sauvegardée **avant** toute modification. Rien n'est jamais appliqué
automatiquement : chaque cabinet décide quand il met à jour, et peut rester sur
une version aussi longtemps qu'il le souhaite.

L'instance signale qu'une version existe dans **Paramètres ▸ Version et mise à
jour**, réservé aux administrateurs. Elle lit pour cela un fichier statique
public sur GitHub — seul flux sortant du produit lui-même, sans rien envoyer, et
coupé par `UPDATE_DISABLED=1`.

### Depuis GitHub, sans ouvrir de session sur le serveur

Le workflow **Deploiement** (`Actions ▸ Deploiement ▸ Run workflow`) lance
exactement la commande ci-dessus, sur le serveur, depuis un *runner*
auto-hébergé portant le label `vps-crm`. Il n'y a rien de plus : le travail est
fait par `maj.sh`, sauvegarde comprise.

Il se déclenche **à la main, et seulement à la main** — aucun `push`, aucune
`pull_request`. Deux raisons :

1. le produit tient que chaque cabinet décide quand il met à jour ; un merge ne
   doit pas toucher la production ;
2. un runner auto-hébergé exécute le code du workflow **sur le serveur du
   cabinet**. Le déclencher sur `pull_request` ferait tourner le code de
   n'importe quelle proposition de modification sur la machine qui porte la
   comptabilité des clients.

Pour exiger une approbation avant chaque exécution : **Settings ▸ Environments ▸
production ▸ Required reviewers**.

Le runner doit tourner sous un utilisateur qui **possède le répertoire de
l'instance** (pour le `git pull`) et **appartient au groupe `docker`**. Le
workflow le vérifie avant de toucher à quoi que ce soit, et s'arrête avec le
motif exact plutôt qu'au milieu de la mise à jour.

---

## Publier le code

Le code vit dans deux dépôts, et ce n'est pas un doublon :

| Dépôt | Rôle |
|---|---|
| `TARNCOMPTA/crmcabinet` — **privé** | on y travaille. Son historique porte un export de la base de production : il ne doit **jamais** devenir public |
| `TARNCOMPTA/crm-cabinet` — **public** | ce que les cabinets installent, et d'où les instances lisent le manifeste de mise à jour |

```bash
npm run publier                 # répétition : montre ce qui partirait
npm run publier -- --pousser    # publie
```

Le script **recopie l'arbre courant** dans le dépôt public et y fait un commit
unique. Il ne pousse jamais de branche, et c'est la seule chose qui compte :
supprimer des fichiers ne les retire pas de l'historique, un `git push` les
publierait tous. Ici l'historique privé ne *peut* pas fuir.

Il refuse de partir si l'arbre de travail est modifié, ou s'il détecte un secret
dans ce qu'il s'apprête à publier — dernière barrière avant une mise en ligne
irréversible. Restent privés : `supabase/`, `MIGRATION.md` et les scripts de
reprise depuis la 1.x.

---

## Publier une version

Le numéro vit à sept endroits — deux `package.json`, leurs deux verrous,
`version.json`, `update/version.json`, et la section du haut de `CHANGELOG.md`.
**Un seul outil les change**, et un test casse la CI si l'un d'eux dérive :

```bash
npm run version:definir -- 2.1.0 --notes "Suivi des echeances via jedeclare."
```

Puis, une fois les six jobs verts :

```bash
git commit -am "Version 2.1.0"
git tag v2.1.0 && git push --tags
```

Le tag — et lui seul — déclenche la construction de l'image et sa publication
sur GHCR. Un `push` ordinaire ne publie rien.

Deux conditions pour que les instances voient quoi que ce soit — il faut **les
deux**, et leur absence est silencieuse :

1. **`update/version.json` sur la branche par défaut.** C'est de là qu'il est
   servi. Un manifeste resté en arrière annonce la version que les instances ont
   déjà : elles concluent qu'elles sont à jour ;
2. **le dépôt public.** `raw.githubusercontent.com` ne sert pas les dépôts
   privés, et l'instance interroge sans jeton — c'est tout l'intérêt : elle
   n'envoie rien, pas même une identité. Tant que le dépôt est privé, l'adresse
   répond 404, `README.md` compris.

Le job `image` vérifie les deux après publication : l'image reste utilisable, le
job devient rouge avec le motif exact.

---

## Licence

[MIT](LICENSE). Utilisation, modification et redistribution libres, y compris
commerciales. Aucune garantie.

Développé par [TARN COMPTA](https://tarncompta.fr) — Albi.
