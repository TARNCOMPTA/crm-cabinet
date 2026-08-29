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


# ⚠️ L'IMAGE DE BASE EST FIGEE PAR SON DIGEST, pas seulement par son etiquette.
#
# `node:22-alpine` est une etiquette MOBILE : elle designe une image differente
# chaque semaine. Deux consequences, et la seconde est la plus genante au
# quotidien :
#   · qui republie sous cette etiquette decide de ce qui tourne chez le cabinet.
#     Une compromission du depot amont entre directement en production a la
#     reconstruction suivante, sans que rien ne change dans ce depot ;
#   · deux constructions du meme commit ne donnent pas la meme image. Un
#     deploiement qui casse ne peut alors pas etre distingue d'une mise a jour
#     du socle, et le retour en arriere par `git checkout` ne ramene pas ce qui
#     tournait.
#
# Le digest ci-dessous est celui que la production execute deja — releve dans le
# journal du deploiement du 2026-08-28. L'epingler ne change donc rien a ce qui
# tourne : il le NOMME.
#
# La contrepartie est qu'un digest fige aussi les correctifs de securite d'Alpine
# et de Node. C'est pour cela, et seulement pour cela, que `.github/dependabot.yml`
# existe : il propose le digest suivant chaque lundi. Retirer l'un rend l'autre
# nuisible.
#
# Pour le relever a la main :  docker buildx imagetools inspect node:22-alpine

# ---- 1. Construction du front ---------------------------------------------
FROM node:22-alpine@sha256:c610fcdfb1d5b4740dd70c284ed3cb16bb857e0f7166196e36a5501df7a3aa32 AS front
WORKDIR /build

# Les dépendances d'abord : cette couche reste en cache tant que package*.json
# ne change pas, ce qui évite de réinstaller 700 paquets à chaque modification
# de code.
# ⚠️ `vendor/` DOIT PRECEDER `npm ci`. `package.json` y pointe pour SheetJS —
# `file:vendor/xlsx-0.20.3.tgz` — parce que l'editeur ne publie plus sur npm et
# que la derniere version du registre porte deux failles hautes sans correctif.
# Sans cette copie, `npm ci` s'arrete sur une archive introuvable, et l'image ne
# se construit pas. Voir `vendor/LISEZMOI.md`.
COPY package.json package-lock.json ./
COPY vendor ./vendor
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
FROM node:22-alpine@sha256:c610fcdfb1d5b4740dd70c284ed3cb16bb857e0f7166196e36a5501df7a3aa32 AS serveur
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
FROM node:22-alpine@sha256:c610fcdfb1d5b4740dd70c284ed3cb16bb857e0f7166196e36a5501df7a3aa32
WORKDIR /app

# `postgresql-client` fournit pg_dump : c'est ce qui permet à maj.sh de
# sauvegarder la base avant d'appliquer une mise à jour, et à l'administrateur
# d'exporter ses données sans installer quoi que ce soit sur l'hôte.
#
# ⚠️ `tzdata` N'EST PAS DÉCORATIF. Alpine n'embarque AUCUNE base de fuseaux :
# sans ce paquet, `TZ` est ignoré en silence et le conteneur reste en UTC. Le
# réglage ci-dessous n'aurait alors aucun effet, ce qui est pire que de ne pas
# l'écrire — il donnerait l'illusion que l'heure est réglée.
RUN apk add --no-cache postgresql-client tini tzdata

# Dépendances de production seulement.
#
# ⚠️ `--omit=optional` N'EST PAS UNE OPTIMISATION DE TAILLE. `pdfjs-dist`
# déclare `@napi-rs/canvas` en dépendance optionnelle : sans ce drapeau, npm
# l'installe, et l'image emporte une cinquantaine de mégaoctets de binaires
# NATIFS — un par architecture et par libc — que ce serveur n'utilise jamais,
# puisqu'il ne dessine aucune page. `server/src/inpi/pdfjs.ts` fournit à la
# place les deux classes vides dont pdf.js a besoin pour se charger, et le
# vérifie sur un arbre installé exactement comme ici.
COPY server/package.json server/package-lock.json ./
RUN npm ci --omit=dev --omit=optional --no-audit --no-fund && npm cache clean --force

COPY --from=serveur /build/dist ./dist
COPY --from=front /build/dist ./public
# Le schéma est appliqué au premier démarrage par le point d'entrée.
COPY schema/cible.sql schema/auth-interne.sql ./schema/
# Les incréments, eux, sont rejoués à CHAQUE démarrage : c'est par eux qu'une
# table nouvelle atteint une instance déjà installée, que cible.sql ne revoit
# jamais. Les oublier ici les rendrait invisibles dans l'image.
COPY schema/increments ./schema/increments
# ⚠️ `version.json` DANS L'IMAGE FINALE, et pas seulement dans l'étage de
# construction du front. Le serveur ne connaissait sa version que par
# `APP_VERSION`, alimentée depuis `VERSION` du `.env` — une valeur saisie à
# l'installation que RIEN ne met jamais à jour. Le front, lui, fige la sienne au
# build. Toute instance mise à jour dérivait donc : l'écran « Version et mise à
# jour » annonçait un serveur en 2.0.0 sous une interface en 2.1.0.
#
# Le fichier est bâti par `npm run version:definir` et vaut aussi bien pour une
# image construite sur place que pour une image tirée de GHCR : dans les deux
# cas il porte la version du code qu'elle contient.
COPY version.json ./version.json
COPY docker/entree.sh ./entree.sh
RUN chmod +x ./entree.sh

# L'HEURE LOCALE DU CONTENEUR COMMANDE L'ORDONNANCEUR.
#
# `planificateur.ts` compare `new Date().getHours()` à l'heure annoncée par
# chaque tâche (« tous les jours a 2h »). En UTC — le défaut d'une image Alpine
# — ces libellés mentaient de une à deux heures selon la saison : « 6h » se
# déclenchait à 8h en été. Trois autres affichages en dépendaient aussi, et se
# trompaient pareil : l'expiration d'un code d'enrôlement, celle affichée à
# l'utilisateur, et la date portée sur les PDF générés — cette dernière datant
# de la veille entre minuit et 2h du matin.
#
# Surchargeable : le produit est distribué, et tous les cabinets ne sont pas
# en France métropolitaine.
ENV TZ=Europe/Paris

ENV NODE_ENV=production
ENV PORT=3000
ENV STORAGE_DIR=/app/data/storage
# Le front construit est copie dans ./public : le serveur le cherche ici.
ENV FRONT_DIR=/app/public
EXPOSE 3000

# ⚠️ LE CONTENEUR NE TOURNE PLUS EN ROOT.
#
# Il y tournait, comme tout conteneur qui ne dit rien. La conséquence n'est pas
# théorique : root DANS un conteneur est le même uid 0 que root sur l'hôte, et
# tout ce qui élargit l'isolation — un montage, une capacité ajoutée, une faille
# du noyau — transforme une exécution de code arbitraire dans le serveur Node en
# accès root sur la machine du cabinet. Un serveur qui accepte des fichiers
# déposés par ses utilisateurs et qui va chercher des PDF sur Internet est
# exactement le genre de programme dont on ne veut pas qu'il soit root.
#
# Rien ici n'a besoin de privilèges : le port est 3000 (au-dessus de 1024), le
# schéma est appliqué par psql avec les droits de la BASE et non ceux du
# système, et la seule écriture est celle des pièces déposées, sous /app/data.
#
# ⚠️ L'UID EST FIXE À 10001, ET CE NOMBRE EST UN CONTRAT. /app/data est un
# montage lié : son propriétaire est celui du dossier `data/` SUR L'HÔTE, que
# l'image ne peut pas changer. `installation/preparer-data.sh` le donne à cet
# uid, et les deux valeurs doivent rester d'accord. Un uid choisi par Alpine
# (« le prochain libre ») changerait au gré des versions de l'image de base et
# rendrait le montage illisible sans que rien ne l'annonce.
#
# `/app/data` est créé et donné à cet utilisateur POUR LE CAS SANS VOLUME — une
# image lancée à la main, un essai en CI. Avec le montage lié, l'hôte recouvre
# ce dossier et c'est lui qui décide ; sans montage, l'application a tout de
# même où écrire.
RUN addgroup -g 10001 -S crm && adduser -u 10001 -S crm -G crm \
    && mkdir -p /app/data/storage && chown -R crm:crm /app/data
USER crm

# tini comme PID 1 : Node reçoit alors SIGTERM proprement, et l'arrêt ferme le
# pool Postgres et la connexion SMTP au lieu d'être tué net.
ENTRYPOINT ["/sbin/tini", "--"]
CMD ["./entree.sh"]
