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
- **TVA intracommunautaire** — numéro calculé depuis le SIREN, vérifiable auprès
  du registre européen VIES d'un clic
- **Connecteur MCP** — accès en lecture depuis un assistant IA, par clé d'API

---

## Ce qui est délibérément absent

- **Aucune télémétrie**, aucun ping, aucun rapport d'usage
- **Aucun accès distant** de l'auteur du logiciel à votre instance
- **Aucun mot de passe** : la connexion se fait par passkey
- **Aucun service tiers** imposé : le courrier part de votre SMTP, les seuls
  appels sortants sont ceux que vous configurez (INPI, BODACC, jedeclare —
  avec **votre** compte, jamais un compte mutualisé), plus le registre public
  VIES quand vous cliquez sur « vérifier un numéro de TVA ». Aucun de ces
  appels n'est périodique : rien ne part sans une action de votre part

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

### Vérifications

```bash
npm run typecheck   # front
npm run test        # vitest
npm run build       # vite
cd server && npm run typecheck && npm run build
```

`npm test` s'exécute sans rien installer : les suites qui demandent une
infrastructure — le schéma appliqué à un vrai PostgreSQL, le parcours dans un
navigateur — s'ignorent d'elles-mêmes quand elle n'est pas là.

### Le parcours de bout en bout

La connexion se fait par passkey, donc par `navigator.credentials`, donc par un
authentificateur : aucun script ne peut ouvrir une session. Chromium en expose un
**virtuel** par le protocole DevTools, et c'est le seul angle depuis lequel
l'enrôlement et la connexion sont observables.

Contre une instance qui tourne :

```bash
npx playwright install chromium          # une fois

cd server && npm run enrolement -- vous@exemple.fr   # un code, valable une heure

E2E_BASE_URL=http://localhost:3000 E2E_CODE_ENROLEMENT=XXXXX-XXXXX npm run test:e2e
```

Le code est à usage unique : chaque exécution en demande un nouveau. La CI monte
la pile entière — PostgreSQL, PostgREST, serveur, front construit — dans le job
`navigateur`.

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
