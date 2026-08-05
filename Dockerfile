# ============================================================================
# CRM Cabinet — image de l'application.
#
# Trois étages, pour que l'image finale ne contienne ni les outils de
# compilation ni les dépendances de développement : Vite, TypeScript et leurs
# dépendances pèsent plus lourd que tout le reste, et ils n'ont rien à faire en
# production.
#
# Le front et le serveur sont construits séparément parce qu'ils ont deux
# `package.json` distincts — le front à la racine, le serveur dans `server/`.
# ============================================================================

# Node 22 et non 20 : Node 20 est en fin de vie depuis avril 2026, et un CRM
# auto-heberge n'a rien a faire sur un runtime qui ne recoit plus de correctifs
# de securite. Accessoirement, `undici` — dependance de `jsdom`, donc de la
# chaine de tests — appelle `webidl.util.markAsUncloneable`, absent de Node 20 :
# la suite de tests ne peut pas s'y executer.

# ---- 1. Construction du front ---------------------------------------------
FROM node:22-alpine AS front
WORKDIR /build

# Les dépendances d'abord : cette couche reste en cache tant que package*.json
# ne change pas, ce qui évite de réinstaller 700 paquets à chaque modification
# de code.
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

# `version.json` est indispensable A LA CONSTRUCTION : vite.config.ts le lit pour
# figer la version dans le bundle (`__VERSION_APP__`). Sans lui, `vite build`
# s'arrête sur « ENOENT: no such file or directory, open './version.json' » et
# l'image ne se construit pas.
#
# Le défaut est passé inaperçu parce que la CI construit le front dans le dépôt
# complet, où le fichier existe : seul `docker build` exerce cette liste
# restreinte. Trouvé le 2026-08-03, au premier déploiement après le système de
# version — `maj.sh` s'est arrêté avant de toucher aux conteneurs, la production
# n'a rien vu. La CI construit désormais l'image à chaque poussée pour que la
# prochaine occurrence soit rouge avant le déploiement.
COPY index.html vite.config.ts tsconfig*.json postcss.config.js tailwind.config.js version.json ./
COPY public ./public
COPY src ./src
RUN npm run build

# ---- 2. Construction du serveur -------------------------------------------
FROM node:22-alpine AS serveur
WORKDIR /build

COPY server/package.json server/package-lock.json ./
# `npm ci` et non `npm install`, comme pour le front : il exige que le verrou
# soit synchrone avec package.json au lieu de le rattraper en silence. C'est
# cette tolerance qui a masque deux desynchronisations — celle du front, qui a
# arrete le tout premier build sur le VPS, et celle-ci, ou jspdf et ses onze
# dependances manquaient au verrou du serveur sans que rien ne le signale.
RUN npm ci --no-audit --no-fund

COPY server/tsconfig.json ./
COPY server/src ./src
RUN npx tsc -p tsconfig.json

# ---- 3. Image d'exécution --------------------------------------------------
FROM node:22-alpine
WORKDIR /app

# `postgresql-client` fournit pg_dump : c'est ce qui permet à maj.sh de
# sauvegarder la base avant d'appliquer une mise à jour, et à l'administrateur
# d'exporter ses données sans installer quoi que ce soit sur l'hôte.
RUN apk add --no-cache postgresql-client tini

# Dépendances de production seulement.
COPY server/package.json server/package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund && npm cache clean --force

COPY --from=serveur /build/dist ./dist
COPY --from=front /build/dist ./public
# Le schéma est appliqué au premier démarrage par le point d'entrée.
COPY schema/cible.sql schema/auth-interne.sql ./schema/
# Les incréments, eux, sont rejoués à CHAQUE démarrage : c'est par eux qu'une
# table nouvelle atteint une instance déjà installée, que cible.sql ne revoit
# jamais. Les oublier ici les rendrait invisibles dans l'image.
COPY schema/increments ./schema/increments
COPY docker/entree.sh ./entree.sh
RUN chmod +x ./entree.sh

ENV NODE_ENV=production
ENV PORT=3000
ENV STORAGE_DIR=/app/data/storage
# Le front construit est copie dans ./public : le serveur le cherche ici.
ENV FRONT_DIR=/app/public
EXPOSE 3000

# tini comme PID 1 : Node reçoit alors SIGTERM proprement, et l'arrêt ferme le
# pool Postgres et la connexion SMTP au lieu d'être tué net.
ENTRYPOINT ["/sbin/tini", "--"]
CMD ["./entree.sh"]
