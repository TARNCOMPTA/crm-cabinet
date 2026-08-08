/**
 * Campagnes — construction du courriel et sélection des destinataires.
 * ---------------------------------------------------------------------------
 * Tout ce qui décide de quelque chose vit ici, et rien d'autre : la substitution
 * des variables, l'échappement, la validité d'une adresse, le dédoublonnage, et la
 * signature du lien de désinscription.
 *
 * SANS DÉPENDANCE, pour la même raison que `mcp/oauth-regles.ts` : `config.ts`
 * lève à l'import quand le `.env` manque, et une règle qu'on ne peut pas tester
 * est une règle qu'on ne vérifie pas. Le fichier n'importe que `node:crypto` et
 * `../html.js`.
 *
 * ⚠️ CE QUE CE FICHIER PROTÈGE.
 *
 * Un corps de campagne est écrit par un administrateur, mais les VALEURS
 * substituées viennent des fiches clients — donc d'une saisie libre, parfois
 * reprise de l'INPI. Une raison sociale contenant `<` casserait le courriel au
 * mieux, y injecterait du balisage au pire. Chaque valeur est donc échappée à la
 * substitution, jamais avant, jamais après.
 */

import { createHmac, timingSafeEqual } from 'node:crypto';
import { echapperHtml } from '../html.js';

/** Les champs qu'une campagne peut insérer. Volontairement peu nombreux. */
export const VARIABLES = [
  'nom_entreprise',
  'dirigeant',
  'numero_dossier',
  'date_cloture',
  'regime_fiscal',
] as const;

export type Variable = (typeof VARIABLES)[number];

export interface ClientDestinataire {
  id: string;
  nom_entreprise: string | null;
  dirigeant: string | null;
  numero_dossier: string | null;
  date_cloture: string | null;
  regime_fiscal: string | null;
  email: string | null;
}

// ------------------------------------------------------------------ code NAF

/**
 * Un code NAF réduit à ce qui se compare.
 *
 * ⚠️ LA MÊME ACTIVITÉ S'ÉCRIT DE TROIS FAÇONS dans le portefeuille : `6201Z`
 * saisi à la main, `62.01Z` repris d'un avis de situation, `62.01 Z` collé
 * depuis un extrait. Comparer les chaînes brutes ferait manquer des clients
 * SANS RIEN DIRE — le pire défaut possible pour un filtre, qui annonce alors un
 * effectif crédible mais faux.
 *
 * On réduit donc les deux côtés de la comparaison : le filtre saisi ici, la
 * colonne `code_ape` en SQL (`clientsVises`, routes/campagnes.ts).
 */
export function normaliserCodeNaf(brut: string | null | undefined): string {
  return (brut ?? '')
    .replace(/[^a-z0-9]/gi, '')
    .toUpperCase()
    // Un code NAF fait cinq caractères : quatre chiffres et une lettre. Au-delà,
    // la saisie n'est pas un code, et tronquer vaut mieux que viser large.
    .slice(0, 5);
}

/**
 * Les préfixes retenus d'une sélection, du plus large au plus fin.
 *
 * UN PRÉFIXE, PAS UNE ÉGALITÉ, et c'est tout l'intérêt : `6201Z` vise une
 * classe, `62` toute la division. « Écrire à mes clients du bâtiment » se dit
 * alors 41, 42, 43 — et non trente codes énumérés à la main, dont on oublierait
 * les deux qui comptent.
 *
 * Un code COUVERT par un autre déjà retenu est écarté : `62` et `6201Z`
 * ensemble ne visent rien de plus que `62`. Les garder tous deux afficherait
 * deux filtres là où un seul agit, et l'utilisateur croirait avoir restreint sa
 * cible en ajoutant le second.
 */
export function prefixesNaf(bruts: readonly string[] | undefined | null): string[] {
  const codes = [...new Set((bruts ?? []).map(normaliserCodeNaf).filter(Boolean))].sort(
    (a, b) => a.length - b.length || a.localeCompare(b)
  );

  const retenus: string[] = [];
  for (const code of codes) {
    if (!retenus.some((deja) => code.startsWith(deja))) retenus.push(code);
  }
  return retenus;
}

// ------------------------------------------------------------------- adresses

/** `  Jean@Exemple.FR ` et `jean@exemple.fr` sont la même boîte. */
export function normaliserAdresse(brut: string | null | undefined): string {
  return (brut ?? '').trim().toLowerCase();
}

/**
 * Une adresse manifestement envoyable.
 *
 * Volontairement PERMISSIF : on ne cherche pas à valider la RFC 5322, qui autorise
 * des formes que personne n'écrit, mais à écarter ce qui échouera à coup sûr — une
 * adresse sans arobase, sans domaine, sans extension, ou avec une espace. Cinq
 * fiches du portefeuille sont dans ce cas ; les laisser passer produirait cinq
 * échecs définitifs au lieu de cinq avertissements avant envoi.
 */
export function adresseValide(brut: string | null | undefined): boolean {
  const a = normaliserAdresse(brut);
  if (!a || a.length > 254) return false;
  return /^[^@\s]+@[^@\s]+\.[a-z]{2,}$/.test(a);
}

export type MotifExclusion =
  | 'sans-adresse'
  | 'adresse-invalide'
  | 'desinscrit'
  | 'retire-a-la-main'
  | 'doublon';

export interface Exclu {
  clientId: string;
  nom: string;
  motif: MotifExclusion;
  /** Pour un doublon : le client qui garde l'adresse. */
  auProfitDe?: string;
}

export interface Selection {
  retenus: ClientDestinataire[];
  exclus: Exclu[];
}

/**
 * Résout la liste finale : une adresse, un envoi.
 *
 * L'ORDRE DES EXCLUSIONS EST CELUI DU DIAGNOSTIC, pas du hasard. « Sans adresse »
 * avant « invalide » avant « désinscrit » avant « doublon » : on annonce à
 * l'utilisateur la cause la plus en amont, celle sur laquelle il peut agir.
 *
 * ⚠️ LE DÉDOUBLONNAGE N'EST PAS UN DÉTAIL. 23 adresses du portefeuille sont
 * partagées par 54 clients — un groupe, un dirigeant de plusieurs sociétés. Sans
 * cette étape, ces personnes reçoivent deux ou trois fois le même courriel, ce qui
 * est le signe le plus reconnaissable d'un publipostage mal fait.
 *
 * Le premier retenu l'emporte : l'appelant trie donc la liste comme il veut la
 * voir décidée (par nom, en pratique).
 */
export function resoudreDestinataires(
  clients: ClientDestinataire[],
  desinscrits: ReadonlySet<string>,
  retiresALaMain: ReadonlySet<string> = new Set()
): Selection {
  const retenus: ClientDestinataire[] = [];
  const exclus: Exclu[] = [];
  const vues = new Map<string, string>();

  for (const c of clients) {
    const nom = c.nom_entreprise ?? '(sans nom)';

    if (!normaliserAdresse(c.email)) {
      exclus.push({ clientId: c.id, nom, motif: 'sans-adresse' });
      continue;
    }
    if (!adresseValide(c.email)) {
      exclus.push({ clientId: c.id, nom, motif: 'adresse-invalide' });
      continue;
    }
    if (desinscrits.has(c.id)) {
      exclus.push({ clientId: c.id, nom, motif: 'desinscrit' });
      continue;
    }

    /**
     * Le retrait manuel se place AVANT le dédoublonnage, et cet ordre a une
     * conséquence voulue.
     *
     * Deux sociétés d'un même groupe partagent souvent une adresse ; le
     * dédoublonnage n'en garde qu'une. Si l'utilisateur retire précisément
     * celle-là, sa jumelle doit alors pouvoir prendre sa place — c'est ce qu'on
     * attend d'un retrait ciblé. En plaçant ce test après le dédoublonnage, le
     * retrait aurait au contraire fait disparaître le groupe entier.
     */
    if (retiresALaMain.has(c.id)) {
      exclus.push({ clientId: c.id, nom, motif: 'retire-a-la-main' });
      continue;
    }

    const cle = normaliserAdresse(c.email);
    const dejaVue = vues.get(cle);
    if (dejaVue) {
      exclus.push({ clientId: c.id, nom, motif: 'doublon', auProfitDe: dejaVue });
      continue;
    }

    vues.set(cle, nom);
    retenus.push(c);
  }

  return { retenus, exclus };
}

// ------------------------------------------------------------------ variables

/**
 * Remplace les marqueurs `{{variable}}` par les valeurs du client, échappées.
 *
 * Une variable INCONNUE est laissée telle quelle, et c'est délibéré : la faire
 * disparaître donnerait un courriel amputé sans que personne ne s'en aperçoive,
 * alors qu'un `{{dirigeant2}}` bien visible dans l'aperçu se corrige avant l'envoi.
 *
 * Une variable connue mais VIDE devient une chaîne vide — un client sans dirigeant
 * renseigné ne doit pas recevoir « Bonjour {{dirigeant}} ».
 */
export function substituer(corps: string, client: ClientDestinataire): string {
  return corps.replace(/\{\{\s*([a-z_]+)\s*\}\}/gi, (entier, nom: string) => {
    const cle = nom.toLowerCase() as Variable;
    if (!(VARIABLES as readonly string[]).includes(cle)) return entier;
    return echapperHtml(client[cle] ?? '');
  });
}

/**
 * Le sujet d'un courriel, débarrassé de tout caractère de contrôle.
 *
 * ⚠️ INJECTION D'EN-TÊTE. Un sujet voyage dans un en-tête SMTP, et les en-têtes
 * sont séparés par des retours chariot. Un `\r\n` dans le sujet permet donc d'en
 * ajouter d'autres — un `Bcc:` vers un tiers, par exemple, sur un serveur qui
 * écrit au nom du cabinet.
 *
 * Le sujet est saisi par un administrateur, mais `substituer` y insère des
 * VALEURS DE FICHES CLIENTS : `{{nom_entreprise}}` vient d'une saisie libre,
 * parfois reprise de l'INPI. `echapperHtml` ne touche pas aux retours chariot —
 * il protège le HTML, pas les en-têtes. C'est donc ici que la coupure se fait.
 *
 * Trouvé par audit le 2026-08-06. Aucune fiche du portefeuille ne contient de
 * retour chariot aujourd'hui — vérifié en base — donc rien n'était exploitable ;
 * mais rien ne l'empêchait, et `nodemailer` accumule les avis de sécurité sur
 * exactement cette classe de faille.
 */
export function nettoyerSujet(sujet: string): string {
  return sujet
    // Tout caractère de contrôle, pas seulement CR et LF : un `\0` ou un `\x0b`
    // suffisent à faire divaguer certains relais.
    .replace(/[\u0000-\u001F\u007F]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    // Un sujet démesuré est tronqué par les serveurs de façon imprévisible.
    .slice(0, 300);
}

// -------------------------------------------------------- lien de desinscription

/**
 * Signe l'identifiant du client pour le lien de désinscription.
 *
 * ⚠️ UNE SIGNATURE, PAS UN IDENTIFIANT. Un lien qui ne contiendrait que
 * `?c=<uuid>` laisserait n'importe qui désinscrire n'importe quel client en
 * essayant des identifiants — et un uuid se retrouve dans les URL de
 * l'application. La signature rend l'opération impossible sans le secret du
 * serveur.
 *
 * Conséquence à connaître : une rotation de `SESSION_SECRET` invalide les liens
 * des courriels DÉJÀ partis. C'est le prix de ne rien stocker, et il est
 * acceptable — un client dont le lien ne marche plus écrit au cabinet.
 */
export function signerDesinscription(secret: string, clientId: string): string {
  return createHmac('sha256', secret).update(`desinscription:${clientId}`).digest('base64url');
}

/** Comparaison à temps constant : une signature se devine octet par octet. */
export function verifierSignatureDesinscription(
  secret: string,
  clientId: string,
  signature: string
): boolean {
  if (!clientId || !signature) return false;
  const attendue = Buffer.from(signerDesinscription(secret, clientId));
  const fournie = Buffer.from(signature);
  return attendue.length === fournie.length && timingSafeEqual(attendue, fournie);
}

// ------------------------------------------------------------------- le courriel

/**
 * Le corps saisi est du TEXTE, pas du HTML.
 *
 * Il est donc échappé en entier, puis ses sauts de ligne deviennent des
 * paragraphes. C'est ce qui permet à l'administrateur d'écrire une apostrophe ou
 * un « < » sans y penser, et ce qui garantit qu'aucun balisage ne peut être
 * injecté par le corps — pas même involontairement.
 *
 * L'ORDRE EST CRITIQUE : échapper le corps, PUIS substituer les variables (dont
 * les valeurs sont échappées à leur tour), PUIS convertir les sauts de ligne.
 * Substituer avant d'échapper ferait passer une raison sociale contenant du
 * balisage à travers l'échappement du corps.
 */
export function corpsEnHtml(corps: string, client: ClientDestinataire): string {
  const substitue = substituer(echapperHtml(corps), client);
  return substitue
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => `<p style="margin:0 0 16px">${p.replace(/\n/g, '<br />')}</p>`)
    .join('');
}

export interface OptionsCourriel {
  corps: string;
  client: ClientDestinataire;
  urlDesinscription: string;
  nomCabinet: string;
}

/**
 * Le courriel complet, aux couleurs du cabinet.
 *
 * Tableaux et styles en ligne, pas de feuille de style ni de flexbox : les
 * logiciels de messagerie — Outlook en tête — n'en tiennent pas compte. C'est laid
 * à écrire et c'est la seule mise en page qui arrive intacte partout.
 *
 * Le pied de désinscription n'est pas optionnel : c'est lui qui rend l'envoi
 * défendable, et il doit être lisible, pas caché en gris clair sur blanc.
 */
export function construireCourriel(o: OptionsCourriel): string {
  const cabinet = echapperHtml(o.nomCabinet);
  const lien = echapperHtml(o.urlDesinscription);

  return `<!doctype html>
<html lang="fr"><head><meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" /></head>
<body style="margin:0;padding:0;background-color:#faf8f7">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#faf8f7">
  <tr><td align="center" style="padding:24px 12px">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
           style="max-width:600px;background-color:#ffffff;border:1px solid #e7e5e4;border-radius:12px">
      <tr><td style="padding:24px 32px 0 32px">
        <p style="margin:0;font:600 15px/1.4 Arial,Helvetica,sans-serif;color:#7c2d5e">${cabinet}</p>
      </td></tr>
      <tr><td style="padding:20px 32px 8px 32px;font:15px/1.6 Arial,Helvetica,sans-serif;color:#292524">
        ${corpsEnHtml(o.corps, o.client)}
      </td></tr>
      <tr><td style="padding:8px 32px 24px 32px;border-top:1px solid #f5f5f4">
        <p style="margin:16px 0 0;font:12px/1.5 Arial,Helvetica,sans-serif;color:#78716c">
          Vous recevez ce message en tant que client du cabinet ${cabinet}.<br />
          <a href="${lien}" style="color:#7c2d5e;text-decoration:underline">Ne plus recevoir ces informations</a>
        </p>
      </td></tr>
    </table>
  </td></tr>
</table>
</body></html>`;
}
