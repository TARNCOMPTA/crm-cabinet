/**
 * Configuration de l'instance, lue une fois au démarrage.
 *
 * Tout vient de l'environnement : une instance = un cabinet, et son .env est la
 * seule source de configuration serveur. Rien de secret ne doit atteindre le
 * navigateur — c'est /api/config qui décide ce qui est exposé au front, et il
 * n'expose que des valeurs publiques.
 */

function requis(nom: string): string {
  const v = process.env[nom];
  if (!v) throw new Error(`Variable d'environnement manquante : ${nom}`);
  return v;
}

/**
 * Un secret dont on exige la ROBUSTESSE, et pas seulement la présence.
 *
 * ⚠️ POURQUOI CE CONTRÔLE EXISTE, et pourquoi il porte sur `SESSION_SECRET` en
 * particulier. Ce secret ne signe pas seulement les sessions : c'est le MÊME que
 * `PGRST_JWT_SECRET` (docker-compose.yml), choix délibéré qui évite de forger un
 * second jeton. Conséquence directe : qui devine ce secret forge un jeton portant
 * `role: authenticated` et atteint PostgREST — donc TOUTES les données du
 * cabinet, sans passer par `app` et sans laisser de trace d'authentification.
 *
 * `installation/install.sh` génère 64 caractères (`openssl rand -hex 32`) : une
 * installation par le script n'a jamais été concernée. Le trou était l'édition
 * du `.env` à la main — un secret recopié, raccourci « pour essayer », ou repris
 * d'un exemple. Rien ne le refusait.
 *
 * 32 caractères est un PLANCHER, pas une cible. Le message nomme la commande de
 * génération : un contrôle qui bloque sans dire comment repartir se contourne.
 */
function secretRobuste(nom: string, minimum = 32): string {
  const v = requis(nom);
  if (v.length < minimum) {
    throw new Error(
      `${nom} fait ${v.length} caractères, ${minimum} au minimum sont exigés. ` +
        'Ce secret signe les sessions ET les jetons transmis a PostgREST : ' +
        "un secret faible ouvre l'acces a toute la base. " +
        `Generez-en un : openssl rand -hex 32`
    );
  }
  return v;
}

function optionnel(nom: string, defaut = ''): string {
  return process.env[nom] ?? defaut;
}

function entier(nom: string, defaut: number): number {
  const v = process.env[nom];
  if (!v) return defaut;
  const n = Number.parseInt(v, 10);
  if (Number.isNaN(n)) throw new Error(`${nom} doit être un entier, reçu « ${v} »`);
  return n;
}

/**
 * Un booléen du `.env`, et ce qu'il fait d'une valeur qu'il ne comprend pas.
 *
 * ⚠️ IL RENDAIT `false` EN SILENCE. `JEDECLARE_MARQUAGE_AUTORISE_2=oui` — ou la
 * même valeur suivie d'une espace, ce qu'une saisie à la main produit sans
 * qu'on la voie — donnait exactement le même résultat qu'une variable absente :
 * le réglage était ignoré, sans une ligne de journal. Dans un fichier dont tous
 * les commentaires sont en français, `oui` n'est pas une faute de l'exploitant.
 *
 * Trois corrections, du même défaut :
 *   · la valeur est ÉLAGUÉE — `« 1 »` vaut `1` ;
 *   · le vocabulaire est élargi à ce qu'on écrit vraiment (`oui`, `vrai`,
 *     `yes`, `on`), dans les deux sens ;
 *   · ce qui reste incompris est SIGNALÉ, au lieu de retomber sur le défaut
 *     sans rien dire. On ne lève pas : refuser de démarrer pour un réglage
 *     facultatif serait pire que de l'ignorer. Mais on le dit.
 */
const VRAI = new Set(['1', 'true', 'oui', 'vrai', 'yes', 'on']);
const FAUX = new Set(['0', 'false', 'non', 'faux', 'no', 'off', '']);

function booleen(nom: string, defaut: boolean): boolean {
  const brut = process.env[nom];
  if (brut === undefined) return defaut;
  const v = brut.trim().toLowerCase();
  if (VRAI.has(v)) return true;
  if (FAUX.has(v)) return false;
  console.warn(
    `[config] ${nom}=« ${brut} » n'est ni vrai ni faux : valeur ignoree, ` +
      `${nom}=${defaut ? '1' : '0'} retenu. Ecrivez 1 ou 0.`
  );
  return defaut;
}

/** Un compte de flux jedeclare. */
export interface CompteJedeclare {
  login: string;
  motDePasse: string;
  /** Ne sert qu'à la liste des dossiers ; son absence n'empêche rien. */
  idCompte: string;
  /**
   * Autorise la LECTURE d'accusés non encore récupérés sur ce compte.
   *
   * ⚠️ CE RÉGLAGE REND UNE OPÉRATION DESTRUCTRICE POSSIBLE, et il ne s'active
   * donc que dans le `.env` du serveur — jamais d'un clic dans l'application.
   * Lire un accusé le marque « récupéré » chez jedeclare : le logiciel de
   * production du cabinet, qui filtre sur « non récupérés », ne le verra alors
   * plus jamais comme nouveau.
   *
   * Il n'a de sens que dans deux cas, et le cabinet est seul à pouvoir en juger :
   *
   *   · AUCUN autre logiciel ne dépose ni ne relève sur ce compte — le marquage
   *     ne lèse personne ;
   *   · le couple éditeur/logiciel est inscrit en exception de marquage auprès
   *     de `contacts.editeurs@jedeclare.info`, auquel cas la lecture ne marque
   *     plus rien du tout.
   *
   * Par compte, et non global : un cabinet a rarement la même réponse pour tous
   * les siens. C'est précisément le cas qui a motivé ce réglage — un compte
   * traité par un logiciel de production, un autre que personne ne relève.
   */
  marquageAutorise: boolean;
}

/**
 * Les comptes de flux jedeclare du cabinet — il peut en avoir plusieurs.
 * ---------------------------------------------------------------------------
 * Une requête « Communication V2 » est cadrée par le compte authentifié : il n'y
 * a aucun paramètre pour en désigner un autre. Un cabinet qui dépose ses flux
 * sous deux comptes ne voyait donc que la moitié de ses télétransmissions, sans
 * que rien ne le signale — l'écran paraissait simplement incomplet.
 *
 * Le premier compte se déclare sans suffixe, les suivants en `_2`, `_3`… :
 *
 *     JEDECLARE_LOGIN=…            JEDECLARE_MDP=…            JEDECLARE_ID_COMPTE=…
 *     JEDECLARE_LOGIN_2=…          JEDECLARE_MDP_2=…          JEDECLARE_ID_COMPTE_2=…
 *
 * Une variable par valeur, et non une liste séparée par des virgules ou des
 * deux-points : un mot de passe a le droit de contenir n'importe quel
 * caractère, séparateur compris. La leçon vient d'`INPI_PASSWORD`, qui contient
 * un caractère non imprimable et cassait `maj.sh` quand celui-ci sourçait le
 * `.env` (voir installation/maj.sh).
 *
 * Un trou dans la numérotation n'interrompt pas la lecture : `_3` est pris en
 * compte même si `_2` manque. Un compte à moitié renseigné — login sans mot de
 * passe — est ignoré, faute de pouvoir s'authentifier.
 *
 * `JEDECLARE_MARQUAGE_AUTORISE{suffixe}` suit la même numérotation, et vaut faux
 * tant qu'on ne l'écrit pas : la prudence est l'état par défaut, y compris sur un
 * compte ajouté plus tard par quelqu'un qui ignore ce réglage.
 */
function comptesJedeclare(): CompteJedeclare[] {
  const comptes: CompteJedeclare[] = [];
  for (let n = 1; n <= 9; n++) {
    const suffixe = n === 1 ? '' : `_${n}`;
    const login = optionnel(`JEDECLARE_LOGIN${suffixe}`).trim();
    const motDePasse = optionnel(`JEDECLARE_MDP${suffixe}`);
    if (!login || !motDePasse) continue;
    comptes.push({
      login,
      motDePasse,
      idCompte: optionnel(`JEDECLARE_ID_COMPTE${suffixe}`).trim(),
      marquageAutorise: booleen(`JEDECLARE_MARQUAGE_AUTORISE${suffixe}`, false),
    });
  }
  return comptes;
}

export const config = {
  env: optionnel('NODE_ENV', 'development'),
  port: entier('PORT', 3000),

  /** URL publique de l'instance. Sert d'origine WebAuthn et de base des liens. */
  publicUrl: optionnel('PUBLIC_URL', 'http://localhost:3000').replace(/\/$/, ''),

  db: {
    url: requis('DATABASE_URL'),
  },

  /** PostgREST, joint en interne. Jamais exposé directement au réseau. */
  postgrest: {
    url: optionnel('POSTGREST_URL', 'http://localhost:3001').replace(/\/$/, ''),
  },

  session: {
    /** Signe les jetons de session ET ceux transmis à PostgREST : même secret. */
    secret: secretRobuste('SESSION_SECRET'),
    /** Durée d'une session, en secondes. Sept jours par défaut. */
    dureeSecondes: entier('SESSION_TTL', 60 * 60 * 24 * 7),
    nomCookie: 'crm_session',
  },

  /**
   * WebAuthn. Le RP ID est le domaine, sans schéma ni port : il est LIÉ au
   * domaine, et le changer invalide toutes les passkeys déjà enrôlées.
   */
  webauthn: {
    rpName: optionnel('WEBAUTHN_RP_NAME', 'CRM Cabinet'),
    get rpId(): string {
      const explicite = process.env.WEBAUTHN_RP_ID;
      if (explicite) return explicite;
      return new URL(config.publicUrl).hostname;
    },
    get origine(): string {
      return process.env.WEBAUTHN_ORIGIN ?? config.publicUrl;
    },
  },

  /** Fichiers déposés dans l'application. Volume Docker, jamais dans l'image. */
  storage: {
    racine: optionnel('STORAGE_DIR', './data/storage'),
    tailleMaxOctets: entier('STORAGE_MAX_FILE_SIZE', 10 * 1024 * 1024),
  },

  smtp: {
    host: optionnel('SMTP_HOST'),
    port: entier('SMTP_PORT', 465),
    secure: booleen('SMTP_SECURE', true),
    user: optionnel('SMTP_USER'),
    password: optionnel('SMTP_PASSWORD'),
    from: optionnel('SMTP_FROM'),
    get configure(): boolean {
      return Boolean(config.smtp.host && config.smtp.from);
    },
  },

  inpi: {
    username: optionnel('INPI_USERNAME'),
    password: optionnel('INPI_PASSWORD'),
    get configure(): boolean {
      return Boolean(config.inpi.username && config.inpi.password);
    },
  },

  /**
   * jedeclare.com — comptes rendus de télétransmission, en LECTURE SEULE.
   *
   * Même parti pris que l'INPI : les identifiants viennent du `.env` de
   * l'instance et n'atteignent jamais le navigateur. C'est le cabinet qui
   * fournit son propre compte de flux, comme il fournit son SMTP — la promesse
   * « aucun service tiers imposé » tient donc toujours.
   *
   * `editeur` et `logiciel` ne sont pas décoratifs : jedeclare exige ce couple
   * dans chaque requête, et c'est LUI qui décide si la lecture d'un accusé
   * marque la pièce comme « récupérée ». Un cabinet dont le logiciel de
   * production dépose les flux doit faire déclarer ce couple en exception
   * auprès de jedeclare, sans quoi la lecture ici prive son logiciel de ses
   * propres accusés. Voir le commentaire en tête de jedeclare/client.ts.
   *
   * `idCompte` ne sert qu'à la liste des dossiers (service REST distinct) :
   * son absence n'empêche pas le suivi de fonctionner.
   */
  jedeclare: {
    login: optionnel('JEDECLARE_LOGIN'),
    motDePasse: optionnel('JEDECLARE_MDP'),
    /**
     * ⚠️ CE N'EST PAS UN CODE ATTRIBUÉ PAR JEDECLARE, mais une CHAÎNE LIBRE que
     * l'appelant se donne pour s'identifier. Le connecteur d'origine
     * (`ecritures-api`) la code en dur à « TARN COMPTA », et n'exige que le
     * login et le mot de passe.
     *
     * Elle a donc un défaut, et `configure` ne la réclame pas : un cabinet dont
     * les identifiants sont bons ne doit pas voir « non configuré » parce qu'il
     * n'a pas rempli un champ dont il ne peut pas deviner la valeur.
     *
     * Elle mérite quand même d'être renseignée : c'est le couple
     * ÉDITEUR / LOGICIEL que jedeclare inscrit sur sa liste d'exclusion de
     * marquage. Un cabinet qui demande cette exclusion doit y mettre son propre
     * nom, et demander l'exclusion pour CE couple-là.
     */
    editeur: optionnel('JEDECLARE_EDITEUR', 'crmcabinet'),
    logiciel: optionnel('JEDECLARE_LOGICIEL', 'crmcabinet'),
    version: optionnel('JEDECLARE_VERSION', '1.0.0'),
    comptes: comptesJedeclare(),
    urlCommunication: optionnel(
      'JEDECLARE_URL_COMMUNICATION',
      'https://www.jedeclare.com/webservices/wspid_spring/CommunicationV2Service/'
    ),
    urlGestion: optionnel(
      'JEDECLARE_URL_GESTION',
      'https://www.jedeclare.com/webservice/gestion'
    ).replace(/\/$/, ''),
    /** Un compte utilisable suffit : tout le reste a un défaut. */
    get configure(): boolean {
      return config.jedeclare.comptes.length > 0;
    },
  },

  /**
   * VIES — registre européen des numéros de TVA intracommunautaire.
   *
   * ACTIF PAR DÉFAUT, contrairement à INPI et SMTP qui exigent des identifiants :
   * le service de la Commission est ouvert, sans clé ni compte. Un CRM qui
   * refuserait de vérifier un numéro de TVA faute de configuration serait cassé
   * par défaut.
   *
   * Ce que cela ajoute à la promesse du README — « les seuls appels sortants sont
   * ceux que vous configurez » — est un appel de plus, et il est listé là comme
   * les autres. Ce qui rend la promesse tenable : RIEN NE PART SANS UN CLIC.
   * Aucune tâche dans `planificateur.ts`, aucune vérification périodique, aucun
   * traitement par lot. `VIES_DISABLED=1` coupe même cette possibilité.
   */
  vies: {
    desactivee: booleen('VIES_DISABLED', false),
  },

  /**
   * Manifeste de version lu sur GitHub, seul flux sortant du produit.
   *
   * ⚠️ L'ADRESSE VISE LE DÉPÔT PUBLIC, ET ELLE NE PEUT PAS VISER AUTRE CHOSE.
   * Elle pointait sur `TARNCOMPTA/crmcabinet`, qui est privé :
   * `raw.githubusercontent.com` ne sert pas les dépôts privés, et l'instance
   * interroge sans jeton — c'est tout l'intérêt, elle n'envoie rien, pas même
   * une identité. L'adresse répondait donc 404 pour tout le monde, et AUCUNE
   * instance ne pouvait voir une mise à jour.
   *
   * Le mode de défaillance est silencieux et total : rien ne casse, personne ne
   * se plaint, les cabinets restent sur une version périmée. Un tiret séparait
   * les deux dépôts.
   */
  maj: {
    manifesteUrl: optionnel(
      'UPDATE_MANIFEST_URL',
      'https://raw.githubusercontent.com/TARNCOMPTA/crm-cabinet/main/update/version.json'
    ),
    desactivee: booleen('UPDATE_DISABLED', false),
  },
};

/** Ce que le front est autorisé à connaître. Aucun secret ici. */
export function configPublique() {
  return {
    publicUrl: config.publicUrl,
    webauthn: { rpId: config.webauthn.rpId, rpName: config.webauthn.rpName },
    fonctionnalites: {
      email: config.smtp.configure,
      inpi: config.inpi.configure,
      jedeclare: config.jedeclare.configure,
    },
    storage: { tailleMaxOctets: config.storage.tailleMaxOctets },
  };
}
