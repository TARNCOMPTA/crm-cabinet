# Paquets embarqués

## `xlsx-0.20.3.tgz` — SheetJS

**Pourquoi ce fichier est ici plutôt que dans `npm install`.** SheetJS a cessé
de publier sur le registre npm : la dernière version qu'on y trouve est
**0.18.5**, et elle porte deux failles hautes que `npm audit` signale sans
pouvoir les corriger — *No fix available*, indéfiniment.

| Faille | Nature | CVSS | Corrigée en |
|---|---|---|---|
| [GHSA-4r6h-8v6p-xvw6](https://github.com/advisories/GHSA-4r6h-8v6p-xvw6) | Pollution de prototype | 7,8 | 0.19.3 |
| [GHSA-5pgg-2g8v-p4x9](https://github.com/advisories/GHSA-5pgg-2g8v-p4x9) | ReDoS | 7,5 | 0.20.2 |

L'éditeur distribue désormais depuis son propre serveur, `cdn.sheetjs.com`.

**Pourquoi une archive versionnée et non l'URL du CDN.** `package.json` pourrait
pointer directement sur `https://cdn.sheetjs.com/...`, mais `npm ci` — donc
`docker build`, donc **chaque déploiement chez chaque cabinet** — dépendrait
alors d'un serveur tiers joignable. Pour un produit auto-hébergé dont l'argument
est que rien n'est mutualisé, c'est un point de défaillance qu'on s'ajoute. Et
on ne perd aucun automatisme : npm ne fournit plus de mise à jour de toute façon.

**Provenance.** Téléchargée depuis `cdn.sheetjs.com` le 2026-08-25, hors de
l'environnement de développement dont le mandataire refuse ce domaine.

    SHA-256  8dc73fc3b00203e72d176e85b50938627c7b086e607c682e8d3c22c02bb99fe8
    Taille   2 409 319 octets
    Licence  Apache-2.0

Contenu vérifié avant intégration : 26 fichiers, **aucun script d'installation**
(`preinstall`, `install`, `postinstall`, `prepare` — aucun), aucune dépendance.

**Pour monter de version.** Récupérer la nouvelle archive depuis
`cdn.sheetjs.com`, la déposer ici, mettre à jour le chemin dans `package.json`
et **la ligne `COPY vendor` du Dockerfile n'a pas à changer** — elle copie le
dossier entier. Relancer `npm install` pour régénérer le verrou.
