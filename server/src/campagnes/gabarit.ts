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
import { valeurVariable, type ContexteVariables } from './variables.js';

/*
 * Le catalogue des variables — ce qu'on peut insérer, et sous quel format —
 * vit dans `variables.ts`. Ici on ne fait que les substituer, en protégeant
 * chaque valeur selon l'endroit où elle va.
 */
export type { ContexteVariables } from './variables.js';

export interface ClientDestinataire {
  id: string;
  nom_entreprise: string | null;
  email: string | null;
  /**
   * La seconde adresse de la fiche. Facultative, et jamais privilégiée : elle
   * vient APRÈS `email` dans l'ordre d'envoi, et le dédoublonnage la traite
   * exactement comme la première.
   */
  email_2: string | null;
  /**
   * Les autres colonnes lues pour les variables — voir `variables.ts`. Leur
   * liste suit le catalogue ; les dates y arrivent en texte `AAAA-MM-JJ`.
   */
  [colonne: string]: unknown;
}

/**
 * Un client ET l'adresse qu'on vise pour lui.
 *
 * UNE LIGNE PAR ADRESSE, PAS PAR CLIENT : un client à deux adresses produit
 * deux entrées, donc deux courriels. `email` y est une chaîne — l'adresse est
 * résolue, il n'y a plus rien à décider ni à vérifier en aval.
 *
 * `email_2` reste porté tel quel, sans signification pour l'envoi : c'est la
 * fiche, pas la cible. Lire `email` et lui seul.
 */
export interface Destinataire extends ClientDestinataire {
  email: string;
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
  /** Une entrée PAR ADRESSE, donc par courriel a envoyer. */
  retenus: Destinataire[];
  /** Une entrée PAR CLIENT qui ne recevra rien. Voir `resoudreDestinataires`. */
  exclus: Exclu[];
}

/**
 * Résout la liste finale : une adresse, un envoi.
 *
 * ⚠️ DEUX UNITÉS DIFFÉRENTES, ET LES CONFONDRE FAUSSE TOUS LES COMPTES.
 *
 *   · `retenus` se compte EN ADRESSES. Une fiche qui en porte deux produit deux
 *     entrées, donc deux courriels, donc deux lignes de file. C'est ce nombre
 *     que l'écran annonce et que `nb_destinataires` enregistre — et c'est le
 *     bon : ce qu'on veut savoir avant d'appuyer, c'est combien de messages
 *     partent ;
 *   · `exclus` se compte EN CLIENTS, et n'y figure QUE celui qui ne recevra
 *     RIEN, sur aucune de ses adresses. La liste répond à « pourquoi untel
 *     n'a-t-il rien reçu ? » ; un client servi sur sa première adresse a reçu,
 *     et n'a donc rien à y faire.
 *
 * COROLLAIRE ASSUMÉ : une seconde adresse invalide, sur une fiche dont la
 * première est bonne, est ÉCARTÉE SANS ÊTRE ANNONCÉE COMME UNE EXCLUSION — le
 * client reçoit. Elle reste visible là où elle compte : la liste nominative de
 * l'aperçu montre les adresses réellement visées, et celle-là n'y est pas.
 * L'inscrire dans `exclus` ferait mentir le compteur « n écarté(s) », qui
 * désignerait alors des clients servis.
 *
 * L'ORDRE DES EXCLUSIONS EST CELUI DU DIAGNOSTIC, pas du hasard. « Sans adresse »
 * avant « invalide » avant « désinscrit » avant « doublon » : on annonce à
 * l'utilisateur la cause la plus en amont, celle sur laquelle il peut agir. Avec
 * deux adresses, chaque motif porte donc sur LES DEUX — « sans adresse » veut
 * dire qu'aucune des deux n'est renseignée, « invalide » qu'aucune des deux
 * n'est utilisable.
 *
 * ⚠️ LE DÉDOUBLONNAGE N'EST PAS UN DÉTAIL. 23 adresses du portefeuille sont
 * partagées par 54 clients — un groupe, un dirigeant de plusieurs sociétés. Sans
 * cette étape, ces personnes reçoivent deux ou trois fois le même courriel, ce qui
 * est le signe le plus reconnaissable d'un publipostage mal fait.
 *
 * LA SECONDE ADRESSE PASSE PAR LE MÊME TAMIS, et le cas le plus fréquent est
 * qu'elle RÉPÈTE la première — recopiée dans les deux champs. Le dédoublonnage
 * l'absorbe sans un mot : le client est déjà servi, il n'y a rien à signaler.
 *
 * Le premier retenu l'emporte : l'appelant trie donc la liste comme il veut la
 * voir décidée (par nom, en pratique). Pour un même client, la première adresse
 * l'emporte sur la seconde.
 */
export function resoudreDestinataires(
  clients: ClientDestinataire[],
  desinscrits: ReadonlySet<string>,
  retiresALaMain: ReadonlySet<string> = new Set()
): Selection {
  const retenus: Destinataire[] = [];
  const exclus: Exclu[] = [];
  const vues = new Map<string, string>();

  for (const c of clients) {
    const nom = c.nom_entreprise ?? '(sans nom)';

    // Les deux adresses de la fiche, dans l'ordre : la première d'abord.
    // `renseignees` sépare « le champ est vide » de « le champ est faux », qui
    // sont deux motifs distincts et deux corrections distinctes.
    const renseignees = [c.email, c.email_2].filter(
      (a): a is string => normaliserAdresse(a) !== ''
    );
    const utilisables = renseignees.filter((a) => adresseValide(a));

    if (renseignees.length === 0) {
      exclus.push({ clientId: c.id, nom, motif: 'sans-adresse' });
      continue;
    }
    if (utilisables.length === 0) {
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

    // Le dédoublonnage porte sur CHAQUE adresse de la fiche, et le compteur sur
    // le CLIENT : tant qu'une seule de ses adresses est retenue, il est servi et
    // n'a rien à faire dans les exclus.
    let servi = 0;
    let premierDoublon: string | undefined;

    for (const adresse of utilisables) {
      const cle = normaliserAdresse(adresse);
      const dejaVue = vues.get(cle);
      if (dejaVue) {
        premierDoublon ??= dejaVue;
        continue;
      }
      vues.set(cle, nom);
      // `email` porte l'adresse VISEE, et non plus celle de la fiche : c'est
      // elle que l'appelant met en file, sans avoir a savoir de quel champ elle
      // sort.
      retenus.push({ ...c, email: adresse });
      servi += 1;
    }

    // Aucune des deux n'a passé : toutes sont déjà servies ailleurs. Un seul
    // motif pour le client, au profit du premier qui a pris l'adresse.
    if (servi === 0) {
      exclus.push({ clientId: c.id, nom, motif: 'doublon', auProfitDe: premierDoublon });
    }
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
 *
 * Pour du HTML : chaque valeur est échappée. Le sujet a sa propre fonction,
 * `substituerTexte`, parce qu'un en-tête n'est pas du HTML.
 */
export function substituer(
  corps: string,
  client: ClientDestinataire,
  contexte: ContexteVariables = {}
): string {
  return corps.replace(MARQUEUR, (entier, nom: string) => {
    const valeur = valeurVariable(nom, client, contexte);
    return valeur === null ? entier : echapperHtml(valeur);
  });
}

const MARQUEUR = /\{\{\s*([a-z_]+)\s*\}\}/gi;

/**
 * La même substitution, pour un SUJET : les valeurs arrivent telles quelles.
 *
 * ⚠️ LE SUJET PASSAIT PAR `substituer`, DONC PAR L'ÉCHAPPEMENT HTML. « L'Atelier
 * Dupont & Fils » arrivait dans la boîte de réception du client écrit
 * `L&#39;Atelier Dupont &amp; Fils` — une apostrophe suffit, et le français en
 * met partout. Constaté le 2026-09-23 en rendant le sujet d'un client réel du
 * harnais. Un sujet est un en-tête SMTP : il n'a rien à craindre du balisage,
 * tout à craindre des retours chariot. C'est `nettoyerSujet`, appliqué APRÈS
 * cette fonction, qui l'en protège.
 */
export function substituerTexte(
  texte: string,
  client: ClientDestinataire,
  contexte: ContexteVariables = {}
): string {
  return texte.replace(MARQUEUR, (entier, nom: string) => {
    const valeur = valeurVariable(nom, client, contexte);
    return valeur === null ? entier : valeur;
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
export function corpsEnHtml(
  corps: string,
  client: ClientDestinataire,
  contexte: ContexteVariables = {}
): string {
  const substitue = substituer(echapperHtml(corps), client, contexte);
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
  /** Ce qu'il faut pour écrire certaines variables — le libellé des régimes. */
  contexte?: ContexteVariables;
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
        ${corpsEnHtml(o.corps, o.client, o.contexte)}
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

// ---------------------------------------------------------------------------
// Les pièces jointes
// ---------------------------------------------------------------------------

/** Le seul bucket où une pièce de campagne a le droit d'être. */
export const BUCKET_PIECES = 'campagne-attachments';

/**
 * Ce que l'écran envoie pour chaque pièce déjà déposée dans le stockage.
 * Le contenu n'est jamais transmis ici : il est monté séparément par la route
 * de stockage, et seule sa référence remonte.
 */
export interface PieceCampagne {
  nom: string;
  bucket: string;
  chemin: string;
  type?: string | null;
  taille?: number | null;
}

export type ValidationPieces =
  | { ok: true; pieces: PieceCampagne[] }
  | { ok: false; message: string };

/**
 * Contrôle des pièces avant la mise en file.
 *
 * ⚠️ CE CONTRÔLE NE REMPLACE PAS CELUI DE `resoudrePieces` (mail.ts), IL LE
 * DOUBLE À UN AUTRE MOMENT. Celui-ci refuse une saisie ; l'autre refuse une
 * LECTURE, des jours plus tard, sur une valeur qui a pu changer entre-temps.
 * Supprimer l'un des deux en croyant l'autre suffisant laisserait un trou : le
 * premier ne protège pas la base, le second ne protège pas l'utilisateur.
 *
 * ⚠️ LE PLAFOND PORTE SUR LE TOTAL, PAS SUR CHAQUE PIÈCE. Cinq fichiers de
 * quatre mégaoctets passeraient un contrôle par pièce et feraient un message de
 * vingt — refusé par Microsoft 365, après avoir occupé la file.
 *
 * Fonction pure : ni disque, ni base, ni réseau.
 */
export function validerPieces(
  brutes: unknown,
  limites: { nombreMax: number; octetsMax: number }
): ValidationPieces {
  // Absent et vide sont ici la même chose — une campagne sans pièce jointe est
  // le cas normal, pas une anomalie à signaler.
  if (brutes === undefined || brutes === null) return { ok: true, pieces: [] };
  if (!Array.isArray(brutes)) {
    return { ok: false, message: 'Les pieces jointes doivent etre une liste.' };
  }
  if (brutes.length === 0) return { ok: true, pieces: [] };

  if (brutes.length > limites.nombreMax) {
    return {
      ok: false,
      message: `Pas plus de ${limites.nombreMax} pieces jointes par campagne (${brutes.length} fournies).`,
    };
  }

  const pieces: PieceCampagne[] = [];
  let total = 0;

  for (const brute of brutes) {
    if (typeof brute !== 'object' || brute === null) {
      return { ok: false, message: 'Piece jointe mal formee.' };
    }
    const p = brute as Record<string, unknown>;

    const nom = typeof p.nom === 'string' ? p.nom.trim() : '';
    const chemin = typeof p.chemin === 'string' ? p.chemin.trim() : '';
    if (!nom || !chemin) {
      return { ok: false, message: 'Chaque piece jointe doit porter un nom et un chemin.' };
    }

    /*
     * ⚠️ CE CONTROLE DE FORME N'EST PAS LA VRAIE GARDE, ET IL NE DOIT PAS EN
     * TENIR LIEU. Filtrer « .. » se contourne par les encodages ; la seule
     * verification qui resiste est la resolution du chemin absolu, faite par
     * `stockage-chemin.ts` au moment d'ouvrir le fichier.
     *
     * Il sert a REFUSER TOT. Sans lui, un chemin aberrant serait accepte ici,
     * recopie sur trois cents lignes de file, et chacune echouerait a l'envoi :
     * trois cents echecs pour une faute que le serveur pouvait voir a la
     * premiere requete. Une erreur immediate vaut mieux qu'une campagne morte.
     */
    if (chemin.startsWith('/') || chemin.split('/').includes('..') || chemin.includes('\0')) {
      return { ok: false, message: 'Chemin de piece jointe invalide.' };
    }

    // Le bucket est IMPOSÉ, jamais repris de la requête. L'accepter laisserait
    // l'appelant désigner « tax-exemption-docs » et joindre à une campagne un
    // justificatif d'exonération déposé pour un autre client.
    if (typeof p.bucket === 'string' && p.bucket !== BUCKET_PIECES) {
      return { ok: false, message: 'Une piece de campagne ne peut venir que du stockage des campagnes.' };
    }

    const taille = typeof p.taille === 'number' && Number.isFinite(p.taille) ? p.taille : 0;
    if (taille < 0) {
      return { ok: false, message: 'Taille de piece jointe invalide.' };
    }
    total += taille;

    pieces.push({
      nom,
      bucket: BUCKET_PIECES,
      chemin,
      type: typeof p.type === 'string' && p.type ? p.type : null,
      taille: taille || null,
    });
  }

  if (total > limites.octetsMax) {
    const mo = (n: number) => (n / (1024 * 1024)).toFixed(1).replace('.', ',');
    return {
      ok: false,
      message: `Les pieces jointes pesent ${mo(total)} Mo au total, le maximum est ${mo(limites.octetsMax)} Mo.`,
    };
  }

  return { ok: true, pieces };
}
