# Journal des versions

Les versions suivent [SemVer](https://semver.org/lang/fr/). Une version majeure
signale un changement qui demande une action de votre part.

---

## 2.2.0 — 2026-08-10

Cette version répare un angle mort du suivi des échéances : **un cabinet qui
dépose ses flux sous plusieurs comptes jedeclare n'en voyait qu'un**. Le reste
n'apparaissait nulle part, et rien ne le signalait — l'écran avait seulement
l'air incomplet.

### Suivi des échéances : les comptes de flux multiples

Une requête jedeclare ne voit que le compte qu'elle authentifie ; il n'existe
aucun paramètre pour en désigner un autre. Les comptes supplémentaires se
déclarent donc dans le `.env` avec les suffixes `_2`, `_3`… et sont désormais
interrogés séparément, leurs résultats fusionnés.

- **Le diagnostic est branché**, et détaille **chaque compte**. Le serveur les
  testait déjà un par un — « un mot de passe faux sur le second compte doit se
  voir comme tel » — mais la réponse était aplatie en un seul état, et aucun
  écran ne l'appelait. Un cabinet à deux comptes ne pouvait pas savoir lequel ne
  répondait pas.
- **Le bilan d'analyse est ventilé par compte** : trouvés, en cache, écartés, à
  traiter. Un total de « 170 écartés » ne dit pas s'ils viennent d'un compte ou
  des deux ; la ventilation, si.
- **Les pièces du second compte ne sont plus jetées comme doublons.** Deux
  comptes numérotent leurs accusés chacun de leur côté : à numéro identique, la
  seconde passait pour déjà connue. Le compte fait maintenant partie de
  l'identité d'une pièce, en base comme en mémoire.

### Le mode prudent, compte par compte

Lire un accusé le marque « récupéré » chez jedeclare. Le mode prudent n'ouvre
donc que les accusés **déjà** marqués : leur lecture ne retire rien au logiciel
de production qui les a déjà vus. C'est la bonne règle — tant qu'un logiciel
relève effectivement le compte.

Sur un compte que **personne ne relève**, aucun accusé n'est jamais marqué, et
la règle se retourne : 100 % des pièces écartées, à chaque analyse, et le compte
absent du suivi pour toujours. Mesuré sur un cabinet réel : 204 écartées sur
204, dont pas une n'aurait pu passer un jour.

`JEDECLARE_MARQUAGE_AUTORISE_2=1` lève la prudence **sur ce compte-là
uniquement**. Faux par défaut, y compris pour un compte ajouté plus tard.

> ⚠️ Ce réglage rend une opération irréversible possible, et **ne se règle que
> dans le `.env` du serveur** — aucun écran ne permet de l'activer. Ne l'utilisez
> que si aucun autre logiciel ne relève ce compte, ou si votre couple
> éditeur/logiciel est inscrit en exception de marquage auprès de jedeclare.

Le compte concerné porte la mention **« marquage autorisé »** dans le diagnostic
et dans le bilan, et le journal d'audit nomme les comptes ouverts à chaque
analyse. La tâche de 6h30 hérite de la dérogation : c'est écrit là où on la pose.

### Mise à jour : deux pièges refermés

- **Un `.env` modifié déclenche maintenant une reconstruction.** `maj.sh` ne
  comparait que les révisions git, or les réglages sont injectés au démarrage du
  conteneur : changer le fichier sans le recréer ne changeait rien, et le script
  répondait « déjà à jour, rien à faire » — vrai du code, faux de l'instance.
- **`installation/runner.sh`** installe l'agent qui exécute le workflow de
  déploiement. La mise à jour se déclenche alors depuis GitHub, sans terminal.
  Facultatif, et à lire avant : le workflow lance `maj.sh` en root, donc
  quiconque peut pousser sur la branche par défaut peut exécuter du code en root
  sur le serveur. C'est la nature d'un déploiement auto-hébergé.

### Contrôles ajoutés

Trois défauts de cette version sont partis en production **sans effet visible**,
faute d'un contrôle qui casse plutôt que de se taire :

- les fichiers `docker-compose*.yml` énumèrent les variables une par une, et il
  y en a **deux** — une pile complète et une pile partagée. Une variable oubliée
  n'atteint pas le conteneur, sans erreur. Un test compare désormais les noms
  lus par le serveur à ceux déclarés dans **chaque** pile ;
- `booleen()` rendait faux en silence sur ce qu'il ne comprenait pas : `oui`, ou
  une valeur suivie d'une espace, valaient « absent ». La valeur est élaguée, le
  vocabulaire élargi, et l'incompris journalisé ;
- l'état d'un réglage se lit dans le diagnostic, qui ne marque rien. Il fallait
  auparavant lancer une analyse — donc marquer des accusés — pour savoir si le
  serveur avait vu le réglage.

---

## 2.1.1 — 2026-08-09

Trois corrections, trouvées en production le jour même de la 2.1.0 — à la
première mise à jour que l'application ait jamais eu à proposer. **Recommandée à
toute instance en 2.1.0**, dont l'image ne les porte pas.

- **La commande de mise à jour affichée par l'application ne fonctionnait pas.**
  L'écran donnait `sudo ./installation/maj.sh`, et le script était enregistré
  sans bit exécutable : `Permission denied`. Il est désormais exécutable, et
  l'écran affiche `sudo sh installation/maj.sh`, qui marche même sur une copie
  restaurée d'une archive.
- **Le serveur annonçait une version que rien ne mettait à jour.** Il la lisait
  dans une variable saisie à l'installation, jamais retouchée depuis, quand
  l'interface figeait la sienne à la construction. Toute instance mise à jour
  affichait donc un écart qui ne se résorbait jamais. Les deux lisent maintenant
  la même source, embarquée dans l'image.
- **`maj.sh --forcer`** reconstruit sans nouveau commit. Sans cette option, une
  instance dont les conteneurs sont en retard sur le dossier — mise à jour
  interrompue, `git pull` lancé à la main — se voyait répondre « déjà à jour,
  rien à faire », sans moyen d'insister.

---

## 2.1.0 — 2026-08-09

Deux ajouts métier, et une correction sans laquelle vous n'auriez jamais vu
cette version.

### ⚠️ Les mises à jour étaient invisibles

L'instance interrogeait l'adresse d'un dépôt **privé** pour savoir si une version
existait. `raw.githubusercontent.com` ne sert pas les dépôts privés, et
l'instance interroge sans jeton — c'est ce qui lui évite d'envoyer quoi que ce
soit, votre identité comprise. L'adresse répondait donc 404, pour tout le monde,
depuis toujours.

Rien ne cassait, personne ne se plaignait, et les instances restaient sur une
version périmée. C'est corrigé : **Paramètres ▸ Version et mise à jour** vous
signalera désormais les versions suivantes.

### Campagnes : cibler par métier

La section « À qui » gagne un filtre **code NAF**. Il ne propose que les codes
présents dans votre portefeuille, avec leur effectif — la nomenclature en compte
732, un cabinet en touche quelques dizaines, et proposer les autres ferait
choisir des filtres qui ne ramènent personne.

La recherche porte aussi sur le nom de la section : taper « construction »
trouve 41, 42 et 43. Un code vise une activité précise (`6201Z`), une division
tout son groupe (`62`), et plusieurs codes s'additionnent.

Les fiches **sans** code NAF sont écartées par un tel filtre, quel que soit leur
métier réel. Leur nombre est annoncé à l'écran dès qu'un code est retenu, plutôt
que découvert après l'envoi.

### Fiche client : les statuts déposés au greffe

Une carte **Statuts** résume ce qui est déposé au registre : statuts constitutifs
et leur date, dernière version, nombre de modifications, les derniers dépôts — et
un bouton pour télécharger le PDF, qui n'existait nulle part alors que le serveur
savait déjà le servir.

La carte n'apparaît que si des statuts existent. Elle reste en revanche visible,
avec le motif, quand le registre n'a pas pu être consulté : une panne et une
absence ne doivent pas produire le même écran vide.

À la première ouverture d'une fiche, le registre est interrogé une fois, et le
résultat conservé.

### Corrections

- le téléchargement des statuts pouvait livrer un **procès-verbal** : la pièce
  était reconnue sur son libellé entier, or « PV d'assemblée générale
  extraordinaire - Modification des statuts » en est un ;
- une pièce du registre sans date faisait échouer l'enregistrement de toutes les
  autres, et le registre était alors réinterrogé à chaque ouverture de fiche ;
- le contrôle du schéma en intégration continue échouait depuis le 7 août, sur
  trois compteurs qui avaient pris du retard sur le schéma.

---

## 2.0.0 — 2026-08-06

Refonte du socle technique. L'application est la même ; ce qui change, c'est où
elle tourne et comment on s'y connecte.

### ⚠️ À savoir avant de mettre à jour

Cette version n'est **pas** une mise à jour de la 1.x : c'est une nouvelle
installation avec reprise des données. La 1.x reposait sur Supabase Cloud, la 2.0
sur votre propre serveur. Le chemin de migration est documenté séparément.

- **Les mots de passe disparaissent.** La connexion se fait par passkey. Chaque
  collaborateur reçoit un code d'enrôlement à saisir une fois.
- **Le domaine devient définitif.** Les passkeys y sont liées : en changer les
  invalide toutes.
- **Un client MCP configuré en OAuth cessera de fonctionner.** Il faut le
  reconfigurer avec une clé d'API (Paramètres ▸ Connecteur MCP).

### Le cabinet garde ses données

- Supabase Cloud remplacé par **PostgreSQL sur votre serveur**
- Les 11 fonctions serveur (Deno) portées en routes Node
- **Multi-cabinet supprimé** : une instance, un cabinet. 96 tables → 74,
  420 règles de sécurité au niveau ligne → 0 (elles n'avaient plus d'objet), 39
  colonnes `cabinet_id` retirées
- **Aucune télémétrie, aucun accès distant.** Votre cabinet est seul responsable
  de traitement au sens du RGPD

### Authentification

- **Passkeys (WebAuthn)** : empreinte, visage ou code de l'appareil. Rien à
  retenir, rien qui puisse être hameçonné ou réutilisé ailleurs
- Session dans un cookie `httpOnly`, donc hors de portée du JavaScript de la page
  — contrairement à un jeton en `localStorage`
- **Codes d'enrôlement** en remplacement du « mot de passe oublié » : générés par
  un administrateur, valables une heure et une seule fois, stockés hachés
- L'application refuse de supprimer la dernière passkey d'un compte, et signale
  tant qu'un seul appareil est enrôlé

### Courrier

- **Resend remplacé par le SMTP du cabinet.** Aucun tiers ne voit passer les noms
  de clients ni les montants, et les mails partent du domaine du cabinet — donc
  ils arrivent
- Réglages modifiables depuis l'application, sans accès SSH
- Test de connexion et envoi d'essai depuis les paramètres
- Réémission des envois en erreur : un incident SMTP d'une heure ne perd plus
  définitivement les notifications de la période

### Suivi des échéances (nouvel écran)

La 1.x avait un module « Échéances fiscales » qu'il fallait tenir à jour à la
main, ligne par ligne. Il a été retiré au portage faute de remplaçant. Voici le
remplaçant : il ne demande aucune saisie, parce qu'il lit ce que le cabinet a
réellement télétransmis.

- **Les déclarations télétransmises via jedeclare**, en tableau société × mois,
  un onglet par type — TVA CA3, liasse IS, DAS2… Les onglets sont **déduits** de
  ce que le compte renvoie : un cabinet qui ne dépose pas de DAS2 n'a pas
  d'onglet DAS2, et un type nouveau apparaît de lui-même
- **Deux états côte à côte, jamais confondus** : ce que jedeclare constate
  (**rond**, en lecture seule) et ce que le cabinet en dit (**carré**,
  modifiable — à faire, en cours, à contrôler, validé, sans objet). C'est la
  forme qui distingue les deux autorités, pas la couleur : un vert jedeclare veut
  dire « accepté par la DGFiP », un vert cabinet « le collaborateur a fini ». Et
  un collaborateur ne peut pas « valider » une déclaration que la DGFiP a rejetée
- **Les sociétés qui télédéclarent sans exister au portefeuille sont affichées**,
  pas masquées, avec un compteur en tête d'écran : c'est un dossier sorti ou une
  fiche manquante. Le rapprochement se fait par SIREN et avoue son ambiguïté
  plutôt que de rattacher au hasard
- Les filtres vivent dans l'URL : une vue se partage par un lien collé
- **Facultatif.** Sans `JEDECLARE_LOGIN` / `JEDECLARE_MDP` / `JEDECLARE_EDITEUR`
  au `.env`, l'écran le dit et n'appelle rien. Le compte reste celui du cabinet :
  rien n'est mutualisé, aucun tiers n'est imposé

> ⚠️ **Lire un accusé le marque « récupéré » chez jedeclare**, et le logiciel
> avec lequel le cabinet dépose ses flux peut alors ne plus le voir comme
> nouveau. Le CRM n'analyse donc **jamais tout seul** : aucune tâche planifiée,
> l'analyse est déclenchée à la main par un administrateur, tracée dans le
> journal d'audit **avant** l'appel, limitée à trois par heure, et n'ouvre que
> les accusés **déjà marqués récupérés**. Avant la mise en service, faites
> inscrire votre couple éditeur/logiciel sur la liste d'exclusion de marquage
> auprès de jedeclare.

### Fiche client : identité, adresse et TVA structurées

Premier volet, invisible à l'écran : les colonnes existent, elles sont remplies,
et l'interface les exposera dans une prochaine version.

- **L'adresse est éclatée en composants** — voie, complément, code postal, ville,
  pays, code INSEE — au lieu d'une seule chaîne que **cinq** parseurs
  concurrents redécoupaient à la lecture, chacun avec ses angles morts. Le texte
  lisible reste, recomposé automatiquement
- **Nom et prénom sont distingués de la raison sociale** pour les personnes
  physiques. Jusqu'ici tout tenait dans une colonne : impossible d'adresser un
  courrier ni de trier par nom de famille
- **Un numéro de TVA intracommunautaire**, calculé depuis le SIREN et
  surchargeable à la main. La vérification auprès du registre européen arrive
  ensuite
- Sur 649 fiches, l'adresse a été découpée partout où elle était lisible. Les
  autres sont **signalées, pas devinées** : une adresse qu'on n'a pas su lire
  reste entière plutôt que réparties au hasard, et remonte dans « Fiches
  incomplètes »

**La TVA intracommunautaire est vérifiable d'un clic.** Le numéro est calculé
depuis le SIREN, surchargeable à la main, et confrontable au registre européen
VIES depuis la fiche client. La clé de contrôle est vérifiée localement avant
tout appel : une faute de frappe se voit sans déranger Bruxelles.

> **« Non confirmé » ne veut pas dire « mal saisi ».** Une entreprise en franchise
> en base de TVA, ou qui n'a jamais demandé son numéro intracommunautaire, répond
> « non » à VIES avec un numéro parfaitement correct. Le CRM l'affiche donc en
> orange et le dit en toutes lettres, jamais en rouge.
>
> Et quand VIES ne répond pas — ce qui arrive : le service nous a renvoyé un
> « service saturé » sur un numéro valide vérifié deux minutes plus tôt — **le
> statut précédent est conservé**. Aucune conclusion n'est tirée du numéro.

Rien n'est envoyé à Bruxelles sans un clic : aucune vérification périodique,
aucun traitement du portefeuille par lot. `VIES_DISABLED=1` coupe même cette
possibilité.

> ⚠️ **Le nom affiché d'une personne physique passera de « Prénom NOM » à
> « NOM Prénom »** dès que son nom et son prénom seront renseignés. C'est
> volontaire : ce libellé est la colonne de tri de toutes les listes, et une
> personne classée à son prénom est introuvable dans 649 clients.

**Dans les listes et la recherche** : une colonne « Ville », triable, et la ville
devient un critère de recherche — « Gaillac » était introuvable, elle n'existait
que noyée dans la chaîne d'adresse. La recherche globale (Ctrl+K) la trouve
aussi. Le PDF de fiche client gagne le type de personne, le nom commercial, le
numéro de TVA et l'adresse détaillée.

**La synchronisation INPI remplit enfin ce qu'elle extrayait.** Trois défauts
corrigés : le code APE n'était **jamais** écrit par le serveur (une clé mal
orthographiée), l'adresse perdait le complément, le pays et le code INSEE à
l'écriture, et une seconde écriture depuis le navigateur **vidait** la date de
clôture et la description d'activité à chaque synchronisation d'un entrepreneur
individuel. L'état au registre — actif ou cessé — et le nom commercial sont
désormais repris.

**Nom et prénom ne sont pas devinés** à partir de l'existant. Découper
« MARTIN DUPOND » est indécidable en français — « DE LA TOUR Jean », un nom
d'usage accolé — et une erreur serait recopiée dans le nom affiché, donc
destructrice. La synchronisation INPI les renseignera ; en attendant les fiches
concernées sont listées.

### Interface

- **La barre de recherche de l'en-tête est retirée.** Large, centrée et en tête
  de page, elle se lisait comme la fonction principale de l'écran alors qu'elle
  n'en était qu'un raccourci — et elle déroutait. La palette reste ouverte par
  **Ctrl+K**, et l'aide des raccourcis (icône clavier, ou `?`) l'annonce toujours

### Version et mise à jour

- **La version est affichée**, au pied du menu et dans **Paramètres ▸ Version et
  mise à jour**. Elle ne l'était nulle part : impossible de savoir ce qu'une
  instance exécute sans ouvrir un terminal
- L'écran distingue la version du **serveur** de celle du **bundle chargé par
  votre navigateur**. Elles divergent le temps d'un rechargement après une mise
  à jour, et durablement si un cache s'accroche — ce qui explique bien des
  correctifs « déployés » qu'on ne voit pas
- **`npm run version:definir -- 2.1.0`** change le numéro aux sept endroits où
  il vit, et un test casse la CI si l'un d'eux dérive. Les deux `package.json`
  annonçaient déjà `0.0.0` quand le reste disait `2.0.0`
- La CI vérifie, après publication, que le manifeste **réellement servi** annonce
  bien la version publiée. Le mode de défaillance était silencieux et total : un
  manifeste resté en arrière, et aucune instance ne voit la mise à jour — rien
  ne casse, personne ne se plaint, les cabinets restent sur une version périmée

### Corrections de fond

Défauts présents dans la 1.x, trouvés au portage :

- **La synchronisation INPI n'écrivait rien.** L'action « synchroniser » était
  traitée exactement comme « rechercher » : les données étaient récupérées puis
  jetées. La synchronisation automatique de tout le portefeuille faisait de même,
  consommant le quota INPI sans effet
- **Certains courriers partaient en double** : la file d'attente était lue sans
  verrou, deux passes concurrentes traitaient la même ligne
- **Les secrets du connecteur MCP étaient prévisibles** (`Math.random()`), et la
  comparaison des empreintes n'était pas à temps constant
- La synchronisation BODACC tournait **toutes les heures** pour des dépôts de
  comptes annuels : passée à un balayage hebdomadaire
- La clé OpenAI était lisible en clair par tout collaborateur connecté. La brique
  IA a été retirée, la colonne avec

### Défauts de la refonte, trouvés avant publication

La 2.0 n'a jamais été publiée : **aucun cabinet n'a été exposé**. Ce qui suit
est consigné parce qu'un journal qui ne raconte que les réussites n'apprend
rien, et parce que plusieurs de ces défauts n'étaient visibles que depuis un
angle précis — une base réelle, un navigateur, un compilateur qu'on écoute.

Quatre atteintes à la sécurité, toutes dans du code écrit pour la 2.0 :

- **Le contrôle d'administration était contournable par un caractère encodé.**
  PostgREST route sur le chemin décodé : `/rest/v1/pro%66iles` y désigne la
  table `profiles`, mais le proxy comparait la chaîne brute, absente de sa
  liste. N'importe quel collaborateur pouvait donc s'accorder `role = 'admin'`
  par un simple PATCH. La base n'ayant plus une seule policy RLS, ce contrôle
  était le seul
- **Le mot de passe SMTP était lisible par tout collaborateur.** Le proxy ne
  filtrait que les écritures ; `GET /rest/v1/cabinet_smtp_config` rendait le
  mot de passe en clair. L'écran est réservé aux administrateurs, mais c'est le
  navigateur qui masque l'entrée de menu — un menu masqué n'est pas un contrôle
  d'accès. Avec ce mot de passe, on écrit aux clients depuis le domaine du
  cabinet
- **Désactiver un compte ne coupait rien.** L'interface déconnectait bien
  l'intéressé, mais c'est un geste du navigateur : aucune garde ne relisait la
  base, et le cookie restait valable jusqu'à sept jours. La même session
  rejouée avec n'importe quel client HTTP gardait l'accès complet au CRM après
  le départ
- **Rien ne freinait les tentatives** sur les trois portes à secret — connexion
  par passkey, code d'enrôlement, clé du connecteur MCP

Et une correction qui n'en avait pas l'air : la politique de sécurité du
contenu n'existait qu'en `<meta>`, où les navigateurs **ignorent**
`frame-ancestors`. Elle est désormais servie aussi en en-tête par Caddy.

Ce qui ne fonctionnait pas, et que personne n'avait encore rencontré :

- **La reprise des dossiers d'un collaborateur qui part échouait en silence.**
  Les filtres visaient une colonne `status` qui n'existe sur aucune des trois
  tables concernées, pour une valeur absente de toutes les énumérations. Rien
  ne vérifiait l'erreur : l'écran annonçait le transfert, les tâches restaient
  au nom du partant
- **« Mon profil » répondait « Erreur lors de la mise à jour » à tout
  collaborateur non administrateur**, `profiles` étant réservée en écriture.
  Les modèles de checklist, personnels eux aussi, étaient inutilisables pour
  les mêmes raisons
- **Aucun libellé de formulaire n'était lié à son champ** : 255 `<Input>` et
  101 `<Select>`. Un lecteur d'écran annonçait des champs sans nom, et cliquer
  un libellé ne plaçait pas le curseur dans la case
- **Cliquer une carte du kanban ne faisait rien** : `Card` ne transmettait pas
  `onClick`, et React ne recopie pas les props qu'il ne connaît pas. Quatre
  écrans concernés
- Le bouton « copier » de l'annuaire copiait `undefined` ; l'écran des clés MCP
  envoyait `Bearer undefined` ; un badge et une modale employaient des valeurs
  que leur composant ne connaît pas ; une dépendance d'effet fondue en une
  expression qui ne désignait rien empêchait un écran de se recharger
- **Enregistrer une fiche client réécrivait son adresse.** Le formulaire renvoyait
  toutes les colonnes, dont une `adresse` que l'affichage avait normalisée au
  chargement — donc *différente* de la base pour les lignes restées au format
  JSON. Ouvrir puis enregistrer une fiche sans rien toucher suffisait à la
  modifier. L'enregistrement n'envoie désormais que ce qui a réellement changé,
  et jamais ce qui appartient à la base ou à une route serveur
- **La roue de synchronisation de l'en-tête ne s'arrêtait jamais.** Trois
  défauts se cumulaient, et chacun aurait suffi. La liste des travaux n'était
  **jamais lue en base** — la fonction de rechargement capturait un profil nul,
  celui du premier rendu. L'abonnement temps réel est un talon inerte depuis la
  refonte, donc une synchronisation terminée côté serveur restait « en cours »
  à l'écran jusqu'au prochain rechargement complet. Et le bouton pour retirer
  une tâche était masqué **exactement quand elle était active**, c'est-à-dire
  dans le seul cas où il sert. S'y ajoutait un trou côté serveur : le cycle de
  vie d'une synchronisation appartient au navigateur qui l'a lancée, si bien
  qu'un onglet fermé en cours de route laissait une ligne « en cours » que rien
  ne ramassait — la purge hebdomadaire ne touchait que les tâches terminées

Les 136 erreurs de compilation que le cliquet contenait sans les réduire ont
été résorbées : **le plafond est désormais à zéro**. C'est en les lisant une
par une que la plupart des défauts ci-dessus sont apparus.

### Performances

- **Cinq chaînes d'écritures séquentielles regroupées.** Réordonner une
  checklist de vingt lignes coûtait vingt allers-retours en file après chaque
  glisser-déposer ; assigner trois collaborateurs à vingt déclarations, soixante
  insertions. Le coût ne venait pas de la base mais du trajet, répété
- **Le premier chargement passe de 544 ko à 113 ko compressés.** jsPDF, qui ne
  sert qu'à l'export d'une fiche, était livré à chaque ouverture d'un client ;
  les seize sections de paramètres partaient ensemble pour qu'on en affiche une
- Deux dépendances déclarées mais jamais importées retirées, et vingt-trois
  paquets avec elles

### Outillage

- **Un parcours de bout en bout dans un vrai navigateur** (`tests/e2e.test.ts`).
  La connexion par passkey ne se script pas ; Chromium expose un
  authentificateur virtuel par le protocole DevTools, seul angle depuis lequel
  l'enrôlement et la connexion sont observables. C'est lui qui a trouvé les
  libellés non liés
- Le garde-fou de secrets ne se déclenche plus sur une phrase qui *parle* d'une
  clé — il était rouge depuis son écriture, et un garde-fou toujours rouge finit
  par être ignoré

### Vie privée

- **Aucun CDN** : Leaflet et ses icônes sont servis par l'instance. Un CDN voit
  l'adresse IP de chaque visiteur
- **Politique de sécurité du contenu resserrée** : ne restent que les deux API
  que le navigateur appelle réellement (`geo.api.gouv.fr`, BODACC). Retirées
  faute de code correspondant : Supabase, Sentry, OpenAI, unpkg, Google Fonts
- Les adresses IP ne sont pas conservées dans les journaux d'accès

### Exploitation

- **Docker** : quatre conteneurs, ~2 Go de RAM. Seul Caddy est publié
- `install.sh` : une commande, HTTPS automatique, secrets générés
- `maj.sh` : sauvegarde de la base **avant** toute modification, vérification
  après, commande de retour arrière affichée en cas d'échec
- Ordonnanceur interne : `pg_cron` et `pg_net` ne sont plus nécessaires
- **Une mise à jour peut désormais faire évoluer le schéma.** Le schéma complet
  n'est appliqué qu'à la première installation : une table ajoutée par une
  nouvelle version n'atteignait donc aucune instance déjà en service. Les
  fichiers de `schema/increments/` comblent ce trou, chacun dans sa propre
  transaction et **une seule fois** — un registre retient ce qui est passé.
  En cas d'échec, la base reste intacte, le journal nomme le fichier fautif, et
  **la sauvegarde prise par `maj.sh` juste avant est le point de retour**

### Retiré

- Assistant IA et les 3 fonctions associées (−5 563 lignes)
- Écran d'autorisation OAuth du connecteur MCP (~400 lignes) : OAuth sert à
  déléguer un accès à un tiers, alors que l'administrateur branche son propre
  client sur sa propre instance
- Suivi du cycle de vie des cabinets (essais, suspensions) : sans objet en
  mono-cabinet
- Écrans de mot de passe, `public/_headers` et `public/_redirects` (conventions
  Netlify, sans effet derrière Caddy), `src/lib/adminRpc.ts` (aucun appelant)
