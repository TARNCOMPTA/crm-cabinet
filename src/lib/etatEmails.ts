/**
 * « Les mails ne partent plus » — dit par le produit, et non découvert un mois
 * après.
 * ---------------------------------------------------------------------------
 * ⚠️ CE MODULE EXISTE À CAUSE D'UNE PANNE DE VINGT-QUATRE JOURS QUE PERSONNE
 * N'A VUE.
 *
 * Le 2026-09-08, un cabinet s'étonne de ne pas recevoir de courriel à la
 * création d'une tâche. La chaîne fonctionnait pourtant de bout en bout : le
 * déclencheur posait la notification, la notification remplissait
 * `email_queue`, l'ordonnanceur vidait la file toutes les deux minutes. Tout
 * marchait, sauf la dernière marche — Microsoft 365 refusait l'authentification
 * depuis le 15 août :
 *
 *     535 5.7.139 Authentication unsuccessful, the user credentials were incorrect
 *
 * Dix courriels en erreur, aucun envoyé depuis vingt-quatre jours, et RIEN à
 * l'écran ne le disait. Ni les tâches, ni les récapitulatifs, ni les relances ne
 * partaient. Le seul endroit qui portait l'information était un compteur sur
 * l'écran des réglages SMTP — c'est-à-dire un écran qu'on n'ouvre que lorsqu'on
 * soupçonne déjà quelque chose.
 *
 * C'est la même famille de défaut que ceux corrigés la veille : une panne qui
 * réussit silencieusement. Un envoi qui échoue sans le dire est pire qu'un
 * envoi qui n'existe pas, parce qu'on compte dessus.
 *
 * ⚠️ LE VERDICT SE CALCULE SUR LES ÉCHECS DEPUIS LE DERNIER ENVOI RÉUSSI, et
 * non sur tout l'historique. Une adresse invalide d'il y a six mois est un
 * incident clos ; la compter reviendrait à afficher un bandeau d'alarme
 * permanent, que plus personne ne lirait au bout d'une semaine. Le corollaire
 * est que le bandeau S'EFFACE TOUT SEUL dès qu'un courriel repart.
 */

export interface EtatEnvoiEmails {
  /** Courriels en erreur DEPUIS le dernier envoi réussi. */
  enEchec: number;
  /** Date du plus ancien de ces échecs, en ISO. */
  depuis: string | null;
  /** Dernier envoi réussi, en ISO. `null` si aucun n'a jamais abouti. */
  dernierEnvoi: string | null;
  /** Message du serveur SMTP sur le plus récent échec. */
  derniereErreur: string | null;
}

export type VerdictEnvoiEmails =
  | { enPanne: false }
  | {
      enPanne: true;
      titre: string;
      detail: string;
      /**
       * Le serveur refuse les identifiants — l'administrateur a quelque chose à
       * corriger, et l'attente n'y changera rien. Distinguer ce cas d'une panne
       * réseau change ce qu'on dit à l'écran : « vos identifiants sont refusés »
       * appelle une action, « le relais est injoignable » appelle la patience.
       */
      authentification: boolean;
      /** Ancienneté du plus vieil échec, en jours pleins. */
      jours: number;
    };

/**
 * Les signatures d'un refus d'identifiants, tous serveurs confondus.
 *
 * ⚠️ `/i` EST INSENSIBLE À LA CASSE, JAMAIS AUX ACCENTS. Ces motifs visent des
 * messages de serveurs SMTP, qui sont en anglais et sans accent — c'est ce qui
 * rend la casse suffisante ICI. Le jour où l'on y ajoute un message français,
 * il faudra écrire la forme accentuée : ce piège a déjà fait tomber sept
 * assertions dans ce dépôt.
 */
const SIGNATURES_AUTH = [
  /\b5\.7\.\d+\b/,
  /\b53[0-5]\b/,
  /invalid login/i,
  /authentication unsuccessful/i,
  /authentication failed/i,
  /\bEAUTH\b/,
  /username and password not accepted/i,
];

/** Vrai quand le message du serveur désigne un refus d'identifiants. */
export function estRefusIdentifiants(message: string | null): boolean {
  if (!message) return false;
  return SIGNATURES_AUTH.some((s) => s.test(message));
}

/** Jours pleins écoulés entre deux instants. Négatif ramené à zéro. */
function joursDepuis(iso: string, maintenant: Date): number {
  const debut = new Date(iso).getTime();
  if (Number.isNaN(debut)) return 0;
  return Math.max(0, Math.floor((maintenant.getTime() - debut) / 86_400_000));
}

/** Une date, telle qu'un humain la lit. */
function enFrancais(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString('fr-FR');
}

/**
 * Ce que l'écran doit annoncer, ou rien.
 *
 * `maintenant` est injecté : sans cela le test dépendrait de l'heure à laquelle
 * on le lance, et l'ancienneté est justement ce que ce verdict porte.
 */
export function verdictEnvoiEmails(
  etat: EtatEnvoiEmails,
  maintenant: Date = new Date()
): VerdictEnvoiEmails {
  if (etat.enEchec <= 0) return { enPanne: false };

  const authentification = estRefusIdentifiants(etat.derniereErreur);
  const jours = etat.depuis ? joursDepuis(etat.depuis, maintenant) : 0;

  const combien =
    etat.enEchec === 1 ? "Un courriel n'est pas parti" : `${etat.enEchec} courriels ne sont pas partis`;

  // « Depuis le … » plutôt que « depuis N jours » quand la panne est ancienne :
  // une date se vérifie contre un souvenir — « tiens, c'est le jour où j'ai
  // changé le mot de passe » — là où un nombre de jours ne se raccroche à rien.
  const quand = etat.depuis ? ` depuis le ${enFrancais(etat.depuis)}` : '';

  const titre = authentification
    ? `Les courriels ne partent plus : le serveur refuse les identifiants${quand}`
    : `${combien}${quand}`;

  const detail = authentification
    ? "Le serveur de messagerie rejette la connexion. Vérifiez les identifiants dans Paramètres → Emails, puis utilisez « Tester » : tant qu'ils sont refusés, aucun courriel ne partira — ni les tâches, ni les récapitulatifs, ni les relances."
    : etat.dernierEnvoi
      ? `Dernier envoi réussi le ${enFrancais(etat.dernierEnvoi)}. Le détail est dans Paramètres → Emails.`
      : "Aucun courriel n'a jamais été envoyé depuis cette instance. Le détail est dans Paramètres → Emails.";

  return { enPanne: true, titre, detail, authentification, jours };
}
