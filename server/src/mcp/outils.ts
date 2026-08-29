/**
 * Outils exposés au connecteur MCP.
 * ---------------------------------------------------------------------------
 * Les treize outils de l'Edge Function `mcp-connector`, en SQL direct, plus
 * trois qui n'en viennent pas :
 *
 *   · `get_client_statuts`, le seul a sortir de la base pour interroger le
 *     registre — il rend le TEXTE du document depose au greffe ;
 *   · `get_client_repartition`, qui rend la repartition des parts SAISIE PAR LE
 *     CABINET. Les deux repondent a la meme question et ne se remplacent pas :
 *     les statuts temoignent d'une date, la repartition dit l'etat courant.
 *     C'est la seconde qui fait autorite.
 *   · `set_client_repartition`, LE SEUL QUI ECRIVE.
 *
 * ⚠️ CE FICHIER A LONGTEMPS DIT « TOUS SONT EN LECTURE SEULE », et ce n'est plus
 * vrai. Il ajoutait : « si une écriture devient nécessaire un jour, ce sera une
 * décision à prendre explicitement, pas un effet de bord ». La décision a été
 * prise — remplir la repartition des parts a la main, client par client, n'etait
 * pas tenable a l'echelle d'un portefeuille. Voici ce qui l'encadre, et rien
 * n'est laisse au hasard de la relecture :
 *
 *   · UN SEUL outil ecrit, et sur UNE SEULE table — `client_associes`, plus les
 *     personnes qu'il faut creer pour la renseigner. Ni les clients, ni les
 *     taches, ni les bilans, ni quoi que ce soit d'autre ne devient modifiable.
 *   · RIEN NE S'EFFACE : l'outil refuse par defaut si le client a deja une
 *     repartition, et il faut le lui demander explicitement pour la remplacer.
 *   · LE DROIT D'ECRIRE N'EST PAS ACQUIS : il vient d'une case cochee au
 *     consentement OAuth, ou de `mcp_api_keys.peut_ecrire` pour une cle
 *     statique. Faux par defaut des deux cotes, donc aucun acces deja accorde
 *     n'a gagne quoi que ce soit au deploiement.
 *   · CHAQUE ECRITURE EST ATTRIBUEE dans `audit_logs`, et une ecriture qu'on ne
 *     saurait pas attribuer est refusee plutot que journalisee a vide.
 *
 * Les quinze autres restent en LECTURE, et cela n'est pas un hasard de portage :
 * un assistant branché sur le CRM d'un cabinet comptable ne doit pas pouvoir
 * modifier un dossier client au fil de la conversation.
 *
 * Le filtre `cabinet_id` de l'original disparaît : une instance est à un seul
 * cabinet. Cela retire au passage un risque réel de l'original — les jointures
 * `client.cabinet_id` de PostgREST étaient faciles à oublier, et une seule
 * oubliée exposait les clients d'un autre cabinet.
 */

import { requete, requeteUne, transaction } from '../db.js';
import { construireSuivi } from '../jedeclare/suivi.js';
import {
  estHorsPortefeuille,
  indexerClients,
  rapprocher,
  type ClientRapprochable,
} from '../jedeclare/rapprochement.js';
import { echeanceTva, type ClientEcheance } from '../jedeclare/echeance.js';
import { listerPieces, telechargerPiece } from '../inpi/service.js';
import { choisirStatuts } from '../inpi/statuts.js';
import { extraireTexte, pagesSansTexte, reperes } from '../inpi/statuts-texte.js';
import { imagesDesPages, pagesDemandees } from '../inpi/statuts-images.js';
import { urlPortail } from '../inpi/client.js';
import { config } from '../config.js';
import { consommer } from '../limiteur.js';

export interface Outil {
  nom: string;
  titre: string;
  description: string;
  /** Schéma JSON des paramètres, tel que le protocole MCP l'attend. */
  parametres: {
    type: 'object';
    properties: Record<string, unknown>;
    required?: string[];
  };
  executer: (args: Record<string, unknown>, contexte?: ContexteAppel) => Promise<unknown>;
}

/**
 * Ce que l'outil sait de son appelant.
 *
 * Optionnel dans la signature : les seize outils de lecture n'en ont aucun
 * usage et ne le declarent pas. Seul l'outil d'ecriture le lit, et il REFUSE
 * d'ecrire en son absence — un appel sans contexte est un appel dont on ne sait
 * rien, pas un appel de confiance.
 */
export interface ContexteAppel {
  peutEcrire: boolean;
  userId: string | null;
  /** Le nom de la cle ou du client OAuth, pour le journal. */
  cle: string;
}

/** Borne la pagination : un assistant qui demande 100 000 lignes est une erreur. */
function borne(v: unknown, defaut: number, max = 200): number {
  const n = typeof v === 'number' ? v : Number.parseInt(String(v ?? ''), 10);
  if (!Number.isFinite(n) || n <= 0) return defaut;
  return Math.min(n, max);
}

function decalage(v: unknown): number {
  const n = typeof v === 'number' ? v : Number.parseInt(String(v ?? ''), 10);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

function texte(v: unknown): string | null {
  return typeof v === 'string' && v.trim() !== '' ? v.trim() : null;
}

const PAGINATION = {
  limit: { type: 'number', description: 'Nombre maximum de resultats' },
  offset: { type: 'number', description: 'Decalage pour la pagination' },
};

/**
 * Ordonne deux echeances par jour du mois croissant, les jours inconnus en
 * queue de liste.
 *
 * Extraite et exportee pour etre testee seule : c'est la seule piece de LOGIQUE
 * NOUVELLE de `list_fiscal_deadlines`, le reste n'etant que la reprise, testee
 * ailleurs, de `construireSuivi()` et `echeanceTva()`. Une inversion ici
 * mettrait les echeances indeterminees EN TETE de la reponse d'un assistant —
 * exactement l'ordre le moins utile a un cabinet qui demande « quelles sont mes
 * prochaines echeances ».
 */
export function compareParJourEcheance(
  x: { jour_echeance: number | null },
  y: { jour_echeance: number | null }
): number {
  if (x.jour_echeance === null && y.jour_echeance === null) return 0;
  if (x.jour_echeance === null) return 1;
  if (y.jour_echeance === null) return -1;
  return x.jour_echeance - y.jour_echeance;
}

/**
 * Les statuts d'un client : le texte du document déposé, et ses repères.
 * ---------------------------------------------------------------------------
 * ⚠️ CINQ ÉTATS, ET SURTOUT PAS TROIS. Le parti pris est celui de
 * `src/lib/statutsService.ts`, dont le commentaire explique pourquoi : « le
 * registre est injoignable » et « cette société n'a pas déposé de statuts »
 * aboutiraient sinon à la même réponse vide, et c'est le premier des deux qui
 * passerait inaperçu — indéfiniment, puisque personne ne va vérifier une
 * absence. Un modèle qui lit la réponse doit pouvoir les distinguer :
 *
 *   sans-siren    la fiche n'a ni SIREN ni SIRET : il n'y a rien à interroger
 *   aucun         le registre répond, et ne porte pas de statuts
 *   extrait       le document a une couche texte, la voici
 *   scanne-image  c'est un scan, voici ses pages EN IMAGE — à lire, pas à deviner
 *   scanne        c'est un scan, et ses pages n'ont pas pu être extraites
 *   erreur        on n'a PAS pu savoir
 *
 * ⚠️ `scanne` ÉTAIT UN CUL-DE-SAC, signalé par un utilisateur du connecteur : il
 * répondait « c'est une image, ouvrez-la vous-même » — sans même dire où. Il se
 * dédouble donc : `scanne-image` rend les pages, et `scanne` ne subsiste que
 * pour le cas où l'extraction échoue. Les deux portent désormais un lien vers la
 * fiche et vers le portail INPI.
 *
 * ⚠️ LE CHOIX DE LA PIÈCE PASSE PAR `choisirStatuts` ET RIEN D'AUTRE. Ce module
 * a une jumelle côté front (`src/lib/statuts.ts`) ; les deux doivent désigner
 * les mêmes pièces, et une troisième règle écrite ici les ferait diverger sans
 * que rien ne le signale.
 */
const PLAFOND_TEXTE = 200_000;

/**
 * La cadence des appels au registre, pour cet outil seul.
 *
 * ⚠️ LE COMPTEUR EST GLOBAL, PAS PAR APPELANT, et c'est voulu : la ressource
 * protégée n'est pas le serveur, c'est le QUOTA INPI DU CABINET — un seul,
 * partagé par tout le monde. Un compteur par clé MCP laisserait deux
 * assistants le vider à eux deux.
 *
 * Le limiteur de la route MCP (`souscontrole`) reste en amont : il protège
 * contre l'abus, celui-ci contre l'usage normal mais trop dense. Un appel coûte
 * un téléchargement et jusqu'à une minute.
 */
const CADENCE_REGISTRE = { max: 20, fenetreMs: 60 * 60 * 1000 };

const AVERTISSEMENT =
  "Les statuts deposes ne refletent PAS les cessions de parts posterieures au depot : " +
  'toute repartition qui en est deduite est datee de ce depot et reste a confirmer ' +
  "aupres du cabinet avant d'etre reprise dans un document signe.";

interface LigneStatuts {
  id: string;
  nom_entreprise: string | null;
  siren: string | null;
  siret: string | null;
  capital_social: string | number | null;
}

/** `pages` a-t-il ete demande ? Une chaine vide vaut « non ». */
function texte20(v: unknown): string | null {
  return typeof v === 'string' && v.trim() !== '' ? v.trim() : null;
}

async function statutsDuClient(
  clientId: string,
  inclureTexte: boolean,
  a_pages: unknown,
  a_reference?: unknown
) {
  const client = await requeteUne<LigneStatuts>(
    'SELECT id, nom_entreprise, siren, siret, capital_social FROM clients WHERE id = $1',
    [clientId]
  );
  if (!client) return { erreur: 'Client introuvable.' };

  // ⚠️ CE DRAPEAU VOYAGE DANS TOUS LES ÉTATS, Y COMPRIS `erreur`, et c'est
  // voulu : quand le registre est injoignable, apprendre que le CRM connaît
  // déjà la répartition est l'information la plus utile qu'on puisse rendre.
  // Un document déposé au greffe est daté ; la saisie du cabinet, non — elle
  // tient compte des cessions que le dépôt ignore, et elle prime.
  const saisie = await requeteUne<{ n: string }>(
    'SELECT count(*)::int AS n FROM client_associes WHERE client_id = $1',
    [clientId]
  );
  /**
   * ⚠️ LES LIENS VOYAGENT DANS TOUS LES ETATS, y compris `scanne` et `erreur`.
   * Le message disait « il faut ouvrir le PDF depuis la fiche client » SANS
   * dire ou : un cul-de-sac, signale par un utilisateur du connecteur. Un
   * modele qui ne peut pas lire un document doit au moins pouvoir indiquer
   * exactement ou le trouver.
   */
  const fiche = {
    id: client.id,
    nom: client.nom_entreprise,
    siren: client.siren,
    repartition_saisie: Number(saisie?.n ?? 0) > 0,
    lien_fiche: `${config.publicUrl}/clients/${client.id}`,
  };
  const siren = (client.siren ?? client.siret?.slice(0, 9) ?? '').replace(/\s/g, '');
  if (!/^\d{9}$/.test(siren)) {
    return {
      etat: 'sans-siren',
      client: fiche,
      message: "Cette fiche ne porte ni SIREN ni SIRET : le registre ne peut pas etre interroge.",
    };
  }

  try {
    // Les actes déjà connus d'abord : c'est gratuit. Le registre n'est appelé
    // que si la base n'en connaît AUCUN — sinon un client jamais synchronisé
    // répondrait « aucun statut », ce qui serait faux.
    const connus = await requete<{
      act_type: string;
      act_category: string | null;
      act_date: string | null;
      deposit_date: string | null;
      inpi_reference: string | null;
    }>(
      // Dates en texte, pour la raison detaillee dans `repartitionDuClient` :
      // une colonne `date` rendue par `pg` puis serialisee en JSON recule d'un
      // jour sous `TZ=Europe/Paris`, celle du conteneur.
      `SELECT act_type, act_category, inpi_reference,
              to_char(act_date, 'YYYY-MM-DD') AS act_date,
              to_char(deposit_date, 'YYYY-MM-DD') AS deposit_date
         FROM legal_acts WHERE client_id = $1`,
      [clientId]
    );

    const duRegistre = async () =>
      (await listerPieces(siren)).map((p) => ({
        id: p.id ?? p.reference,
        type: p.type,
        category: p.category,
        date: p.date,
        depositDate: p.depositDate,
      }));

    let pieces = connus.map((a) => ({
      id: a.inpi_reference,
      type: a.act_type,
      category: a.act_category ?? '',
      date: a.act_date,
      depositDate: a.deposit_date,
    }));
    let origine = 'CRM';
    let choisie = choisirStatuts(pieces);

    /**
     * ⚠️ LE CACHE POUVAIT DIRE « AUCUN STATUT AU REGISTRE » SANS AVOIR DEMANDE
     * AU REGISTRE.
     *
     * La regle etait : interroger l'INPI seulement si `legal_acts` est VIDE.
     * Elle couvrait le client jamais synchronise, et laissait grand ouvert le
     * cas inverse — une base qui connait des actes, mais pas les bons. Un SAS
     * dont le CRM n'a retenu qu'un depot de comptes se voyait alors repondre
     * « Aucun statut depose au registre pour cette entreprise », une affirmation
     * sur le REGISTRE tiree d'une lecture du CACHE. Constate sur une SAS de
     * 2023, qui a forcement depose des statuts a sa constitution.
     *
     * C'est la confusion que tout ce chantier combat : « nous n'avons pas » et
     * « il n'existe pas » ne sont pas la meme phrase. On redemande donc au
     * registre avant de conclure, et le champ `origine` dit d'ou vient la
     * reponse.
     */
    if (!choisie?.id) {
      pieces = await duRegistre();
      origine = 'registre';
      choisie = choisirStatuts(pieces);
    }

    /**
     * ⚠️ UNE PIECE DEMANDEE NOMMEMENT PASSE AVANT LA RECONNAISSANCE AUTOMATIQUE.
     *
     * Constate sur une SAS de 2023 : le registre renvoyait trois actes que
     * l'INPI ne libelle pas — `type`, `nature`, `typeRdd` tous vides, d'ou un
     * « Document » generique — et aucune regle ne pouvait y reconnaitre les
     * statuts. Les documents existaient pourtant, et etaient telechargeables.
     *
     * Sans ce parametre, l'outil constatait son echec et s'arretait la. Avec
     * lui, il rend la liste des pieces (voir la reponse `aucun`) et l'appelant
     * en demande une : c'est le lecteur qui identifie les statuts, faute
     * d'etiquette. On ne devine toujours rien — on rend le document accessible.
     *
     * ⚠️ LA REFERENCE EST VERIFIEE CONTRE LA LISTE, jamais transmise telle
     * quelle. Elle part sinon dans l'URL d'un appel sortant authentifie : une
     * chaine arbitraire y ferait de cet outil un relais vers n'importe quel
     * chemin du registre.
     */
    // `texte()` est declare plus bas dans le fichier : on coerce sur place.
    const reference = typeof a_reference === 'string' ? a_reference.trim() : '';
    if (reference) {
      if (connus.length > 0 && origine === 'CRM') {
        // La reference demandee peut ne pas etre dans le cache : on prend la
        // liste du registre, qui fait foi.
        pieces = await duRegistre();
        origine = 'registre';
      }
      const nommee = pieces.find((p) => p.id === reference);
      if (!nommee) {
        return {
          etat: 'aucun',
          client: fiche,
          origine,
          pieces_vues: pieces.length,
          pieces: pieces.map((p) => ({ reference: p.id, type: p.type, date_depot: p.depositDate })),
          url_portail: urlPortail(siren),
          message:
            `La reference « ${reference} » ne figure pas parmi les pieces de ce SIREN. ` +
            'Choisissez-en une dans `pieces`.',
        };
      }
      choisie = nommee;
    }

    if (!choisie?.id) {
      /**
       * ⚠️ ON DIT CE QU'ON A VU. « Aucun statut » sans rien d'autre laissait
       * l'appelant sans recours : impossible de savoir si le registre est muet
       * pour ce SIREN, ou s'il repond avec des pieces qu'on n'a pas su
       * reconnaitre. Les deux se corrigent, mais pas de la meme facon.
       */
      const types = [...new Set(pieces.map((p) => p.type).filter(Boolean))];
      const sansReference = choisie != null && !choisie.id;
      return {
        etat: 'aucun',
        client: fiche,
        origine,
        pieces_vues: pieces.length,
        types_vus: types.slice(0, 15),
        /**
         * ⚠️ LES PIECES SONT RENDUES ADRESSABLES, pas seulement comptees. Un
         * registre qui ne libelle rien laissait l'outil sans issue : ici,
         * chaque piece porte sa reference, et `reference` la redemande.
         */
        pieces: pieces
          .slice(0, 15)
          .map((p) => ({ reference: p.id, type: p.type, date_depot: p.depositDate })),
        url_portail: urlPortail(siren),
        message: sansReference
          ? `Une piece ressemble aux statuts (« ${choisie?.type} ») mais ne porte aucune ` +
            'reference de telechargement : elle ne peut pas etre recuperee automatiquement. ' +
            'Ouvrez-la depuis le portail INPI (`url_portail`) ou la fiche client.'
          : pieces.length === 0
            ? 'Le registre ne renvoie AUCUNE piece pour ce SIREN. Cela arrive sur une ' +
              "societe recente dont les actes ne sont pas encore publies, ou lorsque l'INPI " +
              'ne les a pas numerises. Verifiez sur le portail (`url_portail`).'
            : `Le registre renvoie ${pieces.length} piece(s) pour ce SIREN, mais aucune n'est ` +
              'identifiee comme des statuts ni comme un acte de constitution. Les types vus ' +
              'figurent dans `types_vus` : si les statuts y sont sous un libelle inattendu, ' +
              "c'est la regle de reconnaissance du CRM qui est a corriger, pas le registre.",
      };
    }

    const acte = {
      type: choisie.type,
      date_acte: choisie.date,
      date_depot: choisie.depositDate,
      reference: choisie.id,
    };

    // La garde est posée ICI et pas plus haut : lire `legal_acts` ou répondre
    // « sans-siren » ne coûte rien au registre. Seul le téléchargement compte.
    if (!consommer('inpi:statuts', CADENCE_REGISTRE)) {
      return {
        etat: 'erreur',
        client: fiche,
        acte,
        message:
          'Trop de telechargements au registre sur la derniere heure. Reessayez plus tard, ' +
          "ou ouvrez le document depuis la fiche client.",
      };
    }

    const piece = await telechargerPiece(siren, choisie.id);
    if (!piece.ok || !piece.contenu) {
      return {
        etat: 'erreur',
        client: fiche,
        acte,
        message: piece.message,
        url_portail: piece.urlPortail,
      };
    }

    const { texte, pages, parPage } = await extraireTexte(piece.contenu);
    const sansTexte = pagesSansTexte(parPage);

    /**
     * ⚠️ LA DÉCISION N'EST PLUS « TEXTE OU IMAGE », ELLE EST PAGE PAR PAGE.
     *
     * Un dépôt de greffe est souvent MIXTE : une page de garde générée, qui a
     * une couche texte, puis les pages du document, qui sont un scan. L'ancienne
     * version testait le texte FUSIONNÉ : deux lignes d'en-tête suffisaient à le
     * déclarer lisible, et l'outil rendait la page de garde en croyant rendre
     * les statuts. Signalé à l'usage — « le document ne contient que la page de
     * garde du greffe, page 1 sur 22 ».
     *
     * Dès qu'une page manque de texte, on rend les images DE CES PAGES-LÀ, et le
     * texte de celles qui en ont. Le document arrive alors entier, chaque page
     * sous la forme où elle est lisible.
     */
    if (sansTexte.length > 0) {
      /**
       * ⚠️ UN SCAN N'EST PLUS UN CUL-DE-SAC. Sa page EST une image : on la rend
       * telle quelle, pour que le modele la LISE. Ce n'est pas de l'OCR — on ne
       * devine rien, on montre le document.
       *
       * Le cas n'est pas marginal : les statuts scannes sont ceux des societes
       * les plus anciennes, donc precisement celles dont personne ne se
       * rappelle la repartition.
       */
      /**
       * On ne rend en image que les pages SANS texte : montrer une page déjà
       * lisible gaspillerait le contexte du modèle pour rien.
       *
       * ⚠️ SANS DEMANDE EXPLICITE, ON PREND LES HUIT PREMIÈRES PAGES QUI EN ONT
       * BESOIN — et non les huit premières du document, filtrées ensuite. La
       * différence compte : sur un dépôt dont les trois premières pages sont
       * une page de garde et un bordereau, le filtrage n'aurait rendu que cinq
       * pages de contenu au lieu de huit.
       */
      const aRendre =
        texte20(a_pages) === null
          ? sansTexte.slice(0, 8)
          : pagesDemandees(a_pages, pages).filter((n) => sansTexte.includes(n));
      const rendu = await imagesDesPages(piece.contenu, {
        pages: aRendre.length > 0 ? aRendre : sansTexte.slice(0, 8),
      });

      if (rendu.images.length === 0) {
        return {
          etat: 'scanne',
          client: fiche,
          acte,
          pages,
          url_portail: urlPortail(siren),
          message:
            `Le document compte ${pages} page(s), dont ${sansTexte.length} sans couche texte, ` +
            "et aucune n'a pu etre extraite en image. " +
            'Ouvrez le PDF depuis la fiche client (voir `client.lien_fiche`) ou depuis le ' +
            'portail INPI (`url_portail`).',
          /**
           * ⚠️ C'EST ICI QUE LE DIAGNOSTIC SERT LE PLUS, ET IL Y MANQUAIT.
           *
           * Cette branche est celle du « rien ne sort » — exactement le cas
           * qu'on a mis trois tours à comprendre. Il n'était renseigné que dans
           * la branche du succès partiel, donc jamais quand tout échouait. Le
           * champ `avertissements` de chaque page y porte le message de pdf.js,
           * seul endroit où un codec non décodable se déclare.
           */
          diagnostic: rendu.diagnostic.slice(0, 4),
          avertissement: AVERTISSEMENT,
        };
      }

      const rendues = rendu.images.map((i) => i.page);
      const restantes = sansTexte.filter((n) => !rendues.includes(n));
      const lus = reperes(texte);

      const entete = {
        etat: sansTexte.length === pages ? 'scanne-image' : 'mixte',
        client: fiche,
        acte,
        pages,
        pages_avec_texte: pages - sansTexte.length,
        pages_rendues: rendues,
        // ⚠️ CE CHAMP EST LA REPONSE A « je n'ai que la page 1 ». Il dit
        // exactement quelles pages restent a demander, au lieu de laisser
        // deviner qu'il en manque.
        pages_restantes: restantes,
        tronque: rendu.tronque,
        /**
         * ⚠️ CE QU'ON A VU SUR LES PAGES QUI N'ONT RIEN DONNÉ.
         *
         * Trois correctifs successifs ont visé juste sur des documents
         * fabriqués ici et à côté sur les vrais. Sans accès aux dépôts réels,
         * la seule façon de savoir ce que contient une page est de le faire
         * dire à l'outil : opérateurs rencontrés, clés retenues, et ce que
         * chaque objet a rendu. Absent quand tout va bien.
         */
        diagnostic: rendu.diagnostic.length > 0 ? rendu.diagnostic.slice(0, 4) : undefined,
        url_portail: urlPortail(siren),
        // Le texte des pages qui en ont — souvent la seule page de garde, mais
        // parfois davantage. Il ne remplace pas les images, il s'y ajoute.
        texte: inclureTexte && texte.trim() !== '' ? texte.slice(0, PLAFOND_TEXTE) : null,
        reperes: {
          denomination: lus.denomination,
          forme: lus.forme,
          capital_social: lus.capitalSocial,
          duree_ans: lus.dureeAns,
          cloture: lus.cloture,
        },
        message:
          (sansTexte.length === pages
            ? "Ce document est un SCAN : aucune page n'a de couche texte. "
            : `Ce document est MIXTE : ${pages - sansTexte.length} page(s) ont une couche ` +
              'texte (souvent la page de garde du greffe), les autres sont un scan. ') +
          `Les pages ${rendues.join(', ')} sont données ci-dessous EN IMAGE — lisez-les pour ` +
          'répondre, elles portent le contenu réel des statuts. ' +
          (restantes.length > 0
            ? `Il reste ${restantes.length} page(s) non rendues (${restantes.join(', ')}) : ` +
              'rappelez cet outil avec `pages` — par exemple `pages: "' +
              `${restantes[0]}-${restantes[Math.min(restantes.length, 8) - 1]}` +
              '"` — pour la suite. LA REPARTITION DU CAPITAL FIGURE SOUVENT DANS LES ' +
              'ARTICLES « APPORTS » ET « CAPITAL SOCIAL », en debut de statuts, mais elle peut ' +
              'aussi se trouver plus loin : demandez les pages manquantes plutot que de conclure. '
            : '') +
          `Le document compte ${pages} page(s).`,
        avertissement: AVERTISSEMENT,
      };

      return {
        blocsMcp: [
          { type: 'text', text: JSON.stringify(entete, null, 2) },
          ...rendu.images.map((i) => ({
            type: 'image',
            mimeType: 'image/png',
            data: i.png.toString('base64'),
          })),
        ],
      };
    }

    const lus = reperes(texte);
    const capitalFiche =
      client.capital_social === null ? null : Number(client.capital_social);

    return {
      etat: 'extrait',
      client: fiche,
      acte,
      pages,
      reperes: {
        denomination: lus.denomination,
        forme: lus.forme,
        capital_social: lus.capitalSocial,
        capital_fiche: capitalFiche,
        // Un écart est une information en soi : les statuts déposés annoncent
        // un capital différent de la fiche, donc il y a eu une augmentation non
        // reportée — et probablement d'autres mouvements avec elle.
        capital_diverge:
          lus.capitalSocial !== null && capitalFiche !== null
            ? lus.capitalSocial !== capitalFiche
            : null,
        duree_ans: lus.dureeAns,
        cloture: lus.cloture,
      },
      texte: inclureTexte ? texte.slice(0, PLAFOND_TEXTE) : null,
      texte_tronque: inclureTexte && texte.length > PLAFOND_TEXTE,
      url_portail: urlPortail(siren),
      avertissement: AVERTISSEMENT,
    };
  } catch (e) {
    // ⚠️ NE JAMAIS REPLIER SUR « aucun ». Une panne du registre annoncée comme
    // une absence de statuts est exactement le défaut que les cinq états
    // existent pour empêcher.
    return {
      etat: 'erreur',
      client: fiche,
      message: e instanceof Error ? e.message : 'Le registre est injoignable.',
    };
  }
}

/**
 * La répartition des parts d'un client, telle que le cabinet l'a saisie.
 * ---------------------------------------------------------------------------
 * C'est la réponse à la réserve que porte `get_client_statuts` : les statuts
 * déposés ne reflètent pas les cessions postérieures au dépôt. Ce qui est saisi
 * ici, si, et c'est la seule version du chiffre qui puisse entrer dans une
 * attestation signée sans qu'un humain rouvre le PDF.
 *
 * ⚠️ LE POURCENTAGE SE CALCULE SUR `clients.parts_totales`, JAMAIS SUR LA SOMME
 * DES LIGNES. Diviser par la somme fait toujours tomber le total à 100 % — y
 * compris quand trois associés sur cinq manquent. Les pourcentages seraient
 * plausibles, faux, et personne ne les vérifierait. Quand le total est inconnu,
 * `pourcentage` vaut `null` : on ne remplace pas un chiffre manquant par zéro.
 *
 * ⚠️ `repartition_complete` EST UN BOOLÉEN NULLABLE, PAS UN ÉTAT À CINQ VALEURS.
 * L'écran, lui, en distingue cinq (`src/lib/repartitionParts.ts`). Les
 * réimplémenter ici en ferait une jumelle qui divergerait sans que rien ne le
 * signale — le dossier en a déjà une paire, `src/lib/statuts.ts` et
 * `inpi/statuts.ts`, et elle demande une vigilance permanente. Les nombres
 * bruts voyagent (`parts_totales`, `somme_parts`, `nb_lignes`) et le modèle
 * conclut. `null` veut dire « invérifiable », et surtout pas « incomplète ».
 */
const AVERTISSEMENT_REPARTITION =
  'Cette repartition est celle SAISIE PAR LE CABINET dans le CRM, et non celle lue dans les ' +
  'statuts : elle tient donc compte des cessions posterieures au dernier depot. Elle ne vaut ' +
  "toutefois que ce que vaut la saisie. N'ATTESTEZ JAMAIS UN NOMBRE DE PARTS lorsque " +
  '`repartition_complete` vaut false (la somme ne tombe pas juste) ou null (le nombre total de ' +
  "parts n'est pas renseigne sur la fiche) : dans ces deux cas le chiffre est a confirmer aupres " +
  'du cabinet avant toute signature.';

interface LigneRepartition {
  nb_parts: string | number;
  demembrement: string;
  source: string;
  date_effet: string | null;
  acte_source: string | null;
  notes: string | null;
  associe: unknown;
  acte_registre: unknown;
}

async function repartitionDuClient(clientId: string) {
  const client = await requeteUne<{
    id: string;
    nom_entreprise: string | null;
    siren: string | null;
    forme_juridique: string | null;
    capital_social: string | number | null;
    parts_totales: string | number | null;
  }>(
    `SELECT id, nom_entreprise, siren, forme_juridique, capital_social, parts_totales
       FROM clients WHERE id = $1`,
    [clientId]
  );
  if (!client) return { erreur: 'Client introuvable.' };

  const lignes = await requete<LigneRepartition>(
    // ⚠️ LES DATES SORTENT EN TEXTE, ET CE N'EST PAS UNE COQUETTERIE. Le pilote
    // `pg` rend une colonne `date` sous forme d'objet Date placé à MINUIT LOCAL,
    // que `JSON.stringify` réécrit ensuite en UTC. Le conteneur tourne en
    // `TZ=Europe/Paris` (Dockerfile:119) : le 12/03/2019 arrive donc au modèle
    // comme « 2019-03-11T23:00:00.000Z ». Constaté, pas supposé — et c'est une
    // date d'effet de détention, celle qui figurerait dans une attestation.
    `SELECT ca.nb_parts, ca.demembrement, ca.acte_source, ca.notes, ca.source,
            to_char(ca.date_effet, 'YYYY-MM-DD') AS date_effet,
            to_jsonb(co.*) - 'created_at' - 'updated_at' AS associe,
            CASE WHEN la.id IS NULL THEN NULL ELSE jsonb_build_object(
              'type', la.act_type, 'date_acte', to_char(la.act_date, 'YYYY-MM-DD'),
              'reference', la.inpi_reference) END AS acte_registre
       FROM client_associes ca
       JOIN company_officers co ON co.id = ca.officer_id
       LEFT JOIN legal_acts la ON la.id = ca.legal_act_id
      WHERE ca.client_id = $1
      ORDER BY ca.nb_parts DESC`,
    [clientId]
  );

  const total =
    client.parts_totales === null ? null : Number(client.parts_totales);
  // `> 0` et non `!== null` : un total à zéro ferait diviser par zéro, et ne
  // peut venir que d'une saisie erronée. Il vaut « inconnu ».
  const totalUtilisable = total !== null && Number.isFinite(total) && total > 0 ? total : null;

  const detentions = lignes.map((l) => {
    const parts = Number(l.nb_parts);
    return {
      associe: l.associe,
      nb_parts: parts,
      pourcentage: totalUtilisable === null ? null : (parts / totalUtilisable) * 100,
      demembrement: l.demembrement,
      date_effet: l.date_effet,
      acte_registre: l.acte_registre,
      acte_source: l.acte_source,
      // ⚠️ CE CHAMP DECIDE DE LA CONFIANCE, il n'est pas decoratif. `statuts`
      // veut dire : deduit du document depose au greffe, donc date du depot et
      // ignorant les cessions posterieures. Une attestation batie sur une ligne
      // `statuts` doit le dire.
      source: l.source,
      notes: l.notes,
    };
  });

  // ⚠️ L'USUFRUIT NE COMPTE PAS DANS LE CAPITAL. Il n'est pas une part, c'est
  // un DROIT SUR des parts dont quelqu'un d'autre est nu-propriétaire — les
  // mêmes parts, comptées une seconde fois. Le cas est celui de toute SCI
  // familiale après donation : le père donne la nue-propriété de 250 parts à
  // son fils et garde l'usufruit. Les sommer donnerait 500 pour 250 parts
  // réelles, et une répartition parfaitement régulière serait annoncée
  // incohérente. La règle est la même que dans `src/lib/repartitionParts.ts`.
  const somme = detentions
    .filter((d) => d.demembrement !== 'usufruit')
    .reduce((acc, d) => acc + d.nb_parts, 0);

  return {
    client: {
      id: client.id,
      nom: client.nom_entreprise,
      siren: client.siren,
      forme_juridique: client.forme_juridique,
      capital_social: client.capital_social === null ? null : Number(client.capital_social),
      parts_totales: total,
    },
    nb_lignes: detentions.length,
    /** Pleine propriete + nue-propriete SEULEMENT : l'usufruit n'est pas une part du capital. */
    somme_parts: somme,
    // Tolérance d'un millième de part : `nb_parts` est un `numeric` rendu en
    // flottant, et une répartition en parts décimales ne doit pas être déclarée
    // incohérente par une erreur d'arrondi.
    repartition_complete:
      totalUtilisable === null ? null : Math.abs(somme - totalUtilisable) <= 1e-6,
    detentions,
    avertissement: AVERTISSEMENT_REPARTITION,
  };
}


/**
 * Écrire la répartition des parts d'un client.
 * ---------------------------------------------------------------------------
 * ⚠️ LE SEUL OUTIL DU CONNECTEUR QUI ÉCRIVE, et tout ce qui suit existe pour
 * qu'il le reste. Les garde-fous ne sont pas décoratifs : chacun ferme un
 * chemin par lequel une écriture non voulue passerait.
 *
 *   1. SANS DROIT, RIEN. `contexte.peutEcrire` vient d'une case cochée au
 *      consentement OAuth, ou de `mcp_api_keys.peut_ecrire`. Faux par défaut
 *      des deux côtés. Un appel sans contexte du tout est refusé aussi : on ne
 *      sait rien de lui, ce n'est pas une raison de lui faire confiance.
 *
 *   2. SANS ATTRIBUTION, RIEN. `audit_logs.user_id` est NOT NULL, et c'est une
 *      bonne contrainte : une écriture qu'on ne saurait pas imputer ne doit pas
 *      avoir lieu. On refuse plutôt que de journaliser à vide.
 *
 *   3. RIEN NE S'EFFACE PAR SURPRISE. Si le client a déjà une répartition,
 *      l'outil REFUSE et rend ce qu'il a trouvé. Remplacer demande
 *      `remplacer: true` — donc une intention, formulée après avoir vu.
 *
 *   4. UNE SEULE TABLE, plus le strict nécessaire pour la renseigner : les
 *      personnes de `company_officers` qu'il faut créer, et `parts_totales` sur
 *      la fiche — cette dernière UNIQUEMENT si elle est vide, jamais en
 *      écrasement d'un nombre que le cabinet a posé.
 *
 *   5. TOUT OU RIEN. La suppression et les insertions vivent dans une seule
 *      transaction : une répartition à moitié remplacée serait pire que pas de
 *      répartition du tout, parce qu'elle aurait l'air d'en être une.
 */
interface DetentionDemandee {
  officer_id?: string;
  prenom?: string;
  nom?: string;
  denomination?: string;
  nb_parts?: unknown;
  demembrement?: string;
  date_effet?: string;
  acte_source?: string;
  notes?: string;
}

const DEMEMBREMENTS_VALIDES = new Set(['pleine-propriete', 'nue-propriete', 'usufruit']);

async function ecrireRepartition(
  args: Record<string, unknown>,
  contexte: ContexteAppel | undefined
) {
  // ---- 1. Le droit -------------------------------------------------------
  /**
   * ⚠️ CE MESSAGE A DEJA MENTI, ET IL A COUTE DEUX TENTATIVES.
   *
   * Il renvoyait vers « Parametres → Connecteur MCP » pour cocher une case du
   * consentement — or cette case ne s'affiche pas la, mais sur la page
   * d'autorisation, et seulement lors d'une NOUVELLE autorisation. Il affirmait
   * ensuite qu'une cle statique se voyait accorder l'ecriture « sur la meme
   * page » : aucun reglage de ce genre n'existait. Deux indications fausses
   * dans trois lignes, sur le seul ecran que l'utilisateur allait lire.
   *
   * Il designe desormais l'endroit ou le droit se donne VRAIMENT, et cet
   * endroit existe.
   */
  if (!contexte?.peutEcrire) {
    return {
      erreur: 'Ecriture non autorisee pour cet acces.',
      comment_faire:
        'Cet acces est en LECTURE. Ouvrez Parametres → Connecteur MCP dans le CRM : la liste ' +
        '« Autorisations » y indique, pour chaque connecteur, s il est en lecture seule, et un ' +
        "bouton y accorde l'ecriture de la repartition des parts. Meme chose cle par cle pour " +
        'un acces par cle statique (Claude Code, Cursor). Le droit prend effet immediatement, ' +
        "sans rebrancher le connecteur. C'est a l'utilisateur de faire ce geste, pas a vous.",
    };
  }
  if (!contexte.userId) {
    return {
      erreur: "Ecriture impossible : cet acces n'est rattache a aucun utilisateur.",
      comment_faire:
        "Une ecriture doit pouvoir etre imputee a quelqu'un. Utilisez un acces OAuth, ou une " +
        'cle MCP creee depuis Parametres → Connecteur MCP.',
    };
  }

  // ---- 2. Le client ------------------------------------------------------
  const clientId = String(args.client_id ?? '');
  const client = await requeteUne<{
    id: string;
    nom_entreprise: string | null;
    parts_totales: string | number | null;
  }>('SELECT id, nom_entreprise, parts_totales FROM clients WHERE id = $1', [clientId]);
  if (!client) return { erreur: 'Client introuvable.' };

  // ---- 3. Les detentions demandees ---------------------------------------
  const brutes = Array.isArray(args.detentions) ? (args.detentions as DetentionDemandee[]) : null;
  if (!brutes || brutes.length === 0) {
    return { erreur: 'Le parametre `detentions` doit contenir au moins une ligne.' };
  }
  if (brutes.length > 100) {
    return { erreur: 'Trop de detentions en un appel (100 au maximum).' };
  }

  const source = args.source === 'statuts' ? 'statuts' : 'manual';
  const lignes: {
    officerId: string | null;
    prenom: string;
    nom: string;
    denomination: string | null;
    nbParts: number;
    demembrement: string;
    dateEffet: string | null;
    acteSource: string | null;
    notes: string | null;
  }[] = [];

  for (const [i, d] of brutes.entries()) {
    const rang = `detentions[${i}]`;
    const nbParts = typeof d.nb_parts === 'number' ? d.nb_parts : Number(d.nb_parts);
    if (!Number.isFinite(nbParts) || nbParts <= 0) {
      return { erreur: `${rang} : nb_parts doit etre un nombre superieur a zero.` };
    }
    const demembrement = d.demembrement ?? 'pleine-propriete';
    if (!DEMEMBREMENTS_VALIDES.has(demembrement)) {
      return {
        erreur: `${rang} : demembrement inconnu « ${demembrement} ». Valeurs admises : ${[...DEMEMBREMENTS_VALIDES].join(', ')}.`,
      };
    }
    // Une date d'effet mal formee vaut mieux refusee que silencieusement perdue.
    const dateEffet = texte(d.date_effet);
    if (dateEffet !== null && !/^\d{4}-\d{2}-\d{2}$/.test(dateEffet)) {
      return { erreur: `${rang} : date_effet doit etre au format AAAA-MM-JJ.` };
    }

    const denomination = texte(d.denomination);
    const nom = texte(d.nom) ?? denomination;
    const officerId = texte(d.officer_id);
    if (!officerId && !nom) {
      return { erreur: `${rang} : il faut soit officer_id, soit nom (ou denomination).` };
    }

    lignes.push({
      officerId,
      prenom: texte(d.prenom) ?? '',
      nom: nom ?? '',
      denomination,
      nbParts,
      demembrement,
      dateEffet,
      acteSource: texte(d.acte_source),
      notes: texte(d.notes),
    });
  }

  // ---- 4. Ce qui existe deja ---------------------------------------------
  const existantes = await requete<{ n: string }>(
    'SELECT count(*)::int AS n FROM client_associes WHERE client_id = $1',
    [clientId]
  );
  const dejaLa = Number(existantes[0]?.n ?? 0);
  if (dejaLa > 0 && args.remplacer !== true) {
    return {
      erreur: `Ce client porte deja ${dejaLa} ligne(s) de repartition.`,
      comment_faire:
        'Rien n\'a ete modifie. Appelez `get_client_repartition` pour voir ce qui est en place, ' +
        'montrez-le a l\'utilisateur, puis rappelez cet outil avec `remplacer: true` s\'il ' +
        'confirme. Le remplacement efface les lignes existantes.',
      repartition_actuelle: await repartitionDuClient(clientId),
    };
  }

  // ---- 5. L'ecriture, en une transaction ---------------------------------
  const totalDemande =
    args.parts_totales === undefined || args.parts_totales === null
      ? null
      : Number(args.parts_totales);
  const totalAPoser =
    client.parts_totales === null && totalDemande !== null && Number.isFinite(totalDemande) && totalDemande > 0
      ? totalDemande
      : null;

  const posees = await transaction(async (cx) => {
    const ids: string[] = [];
    for (const l of lignes) {
      let officerId = l.officerId;
      if (!officerId) {
        // La personne existe peut-etre deja : l'index unique de
        // `company_officers` porte sur (prenom, nom, type, date de naissance)
        // en minuscules et sans espaces de bord. On le suit a la lettre, sinon
        // on creerait un doublon que la base refuserait.
        const personneMorale = l.denomination !== null;
        const type = personneMorale ? 'morale' : 'physique';
        const { rows: connue } = await cx.query<{ id: string }>(
          `SELECT id FROM company_officers
            WHERE lower(btrim(first_name)) = lower(btrim($1))
              AND lower(btrim(last_name)) = lower(btrim($2))
              AND person_type = $3
              AND COALESCE(birth_date, '1900-01-01'::date) = '1900-01-01'::date
            LIMIT 1`,
          [l.prenom, l.nom, type]
        );
        if (connue[0]) {
          officerId = connue[0].id;
        } else {
          const { rows: creee } = await cx.query<{ id: string }>(
            `INSERT INTO company_officers (first_name, last_name, person_type, denomination, source)
             VALUES ($1, $2, $3, $4, 'manual') RETURNING id`,
            [l.prenom, l.nom, type, l.denomination]
          );
          officerId = creee[0]!.id;
        }
      }
      ids.push(officerId);
    }

    await cx.query('DELETE FROM client_associes WHERE client_id = $1', [clientId]);

    for (const [i, l] of lignes.entries()) {
      await cx.query(
        `INSERT INTO client_associes
           (client_id, officer_id, nb_parts, demembrement, date_effet, acte_source, notes, source)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [clientId, ids[i], l.nbParts, l.demembrement, l.dateEffet, l.acteSource, l.notes, source]
      );
    }

    if (totalAPoser !== null) {
      // ⚠️ `parts_totales IS NULL` DANS LE WHERE, et pas seulement dans le test
      // plus haut : entre les deux, quelqu'un a pu renseigner la fiche a
      // l'ecran. La base tranche, pas la lecture qu'on en a faite.
      await cx.query(
        'UPDATE clients SET parts_totales = $2 WHERE id = $1 AND parts_totales IS NULL',
        [clientId, totalAPoser]
      );
    }

    await cx.query(
      `INSERT INTO audit_logs (user_id, action, entity_type, entity_id, details)
       VALUES ($1, 'set_client_repartition', 'client', $2, $3)`,
      [
        contexte.userId,
        clientId,
        JSON.stringify({
          via: 'connecteur MCP',
          acces: contexte.cle,
          source,
          lignes_posees: lignes.length,
          lignes_effacees: dejaLa,
          parts_totales_posees: totalAPoser,
        }),
      ]
    );

    return lignes.length;
  });

  const apres = await repartitionDuClient(clientId);
  return {
    ecrit: true,
    client: { id: client.id, nom: client.nom_entreprise },
    lignes_posees: posees,
    lignes_effacees: dejaLa,
    source,
    parts_totales_posees: totalAPoser,
    repartition: apres,
  };
}

export const OUTILS: Outil[] = [
  {
    nom: 'list_clients',
    titre: 'Lister les clients',
    description: 'Liste les clients du cabinet, avec recherche optionnelle par nom, SIREN, SIRET ou contact.',
    parametres: {
      type: 'object',
      properties: {
        search: { type: 'string', description: 'Recherche par nom, SIREN, SIRET ou contact' },
        ...PAGINATION,
      },
    },
    executer: async (a) => {
      const recherche = texte(a.search);
      // `ILIKE ANY` sur un seul motif : une seule expression pour quatre
      // colonnes, et le motif reste un paramètre — donc pas d'injection
      // possible, contrairement à la concaténation `.or()` de l'original.
      return requete(
        `SELECT id, nom_entreprise, siren, siret, email, telephone, forme_juridique,
                regime_fiscal, adresse, contact_principal, statut, numero_dossier, created_at
           FROM clients
          WHERE ($1::text IS NULL
                 OR nom_entreprise ILIKE '%' || $1 || '%'
                 OR contact_principal ILIKE '%' || $1 || '%'
                 OR siren ILIKE '%' || $1 || '%'
                 OR siret ILIKE '%' || $1 || '%')
          ORDER BY nom_entreprise
          LIMIT $2 OFFSET $3`,
        [recherche, borne(a.limit, 50), decalage(a.offset)]
      );
    },
  },

  {
    nom: 'get_client',
    titre: 'Detail client',
    description: "Detail complet d'un client, avec optionnellement ses dirigeants en fonction.",
    parametres: {
      type: 'object',
      properties: {
        client_id: { type: 'string', description: 'UUID du client' },
        include_officers: { type: 'boolean', description: 'Inclure les mandats actifs' },
      },
      required: ['client_id'],
    },
    executer: async (a) => {
      /**
       * ⚠️ `to_jsonb(c.*)` ET NON `SELECT *`, POUR LES DATES.
       *
       * Une colonne `date` lue en colonne native devient un objet `Date` place
       * a MINUIT LOCAL, que `JSON.stringify` reecrit en UTC : sous
       * `TZ=Europe/Paris`, le 24/04 sort en « 2020-04-23T22:00:00.000Z », soit
       * LA VEILLE. La fiche client en porte huit — cloture, immatriculation,
       * radiation, entree et sortie du cabinet… — toutes fausses d'un jour.
       *
       * PostgreSQL, lui, serialise une `date` en texte ISO quand elle traverse
       * `to_jsonb`. Envelopper la ligne entiere corrige donc les huit d'un coup,
       * et couvrira la neuvieme le jour ou elle arrivera — ce qu'une liste de
       * `to_char` colonne par colonne ne ferait pas.
       */
      const enveloppe = await requeteUne<{ fiche: Record<string, unknown> }>(
        'SELECT to_jsonb(c.*) AS fiche FROM clients c WHERE c.id = $1',
        [a.client_id]
      );
      if (!enveloppe) return { erreur: 'Client introuvable.' };
      const client = enveloppe.fiche;
      if (a.include_officers !== true) return client;

      const dirigeants = await requete(
        `SELECT oc.id, oc.role, oc.role_type,
                to_char(oc.start_date, 'YYYY-MM-DD') AS start_date,
                to_char(oc.end_date, 'YYYY-MM-DD') AS end_date,
                oc.is_active, oc.power_type, oc.notes,
                to_jsonb(co.*) - 'created_at' - 'updated_at' AS officer
           FROM officer_companies oc
           JOIN company_officers co ON co.id = oc.officer_id
          WHERE oc.client_id = $1 AND oc.is_active
          ORDER BY oc.role`,
        [a.client_id]
      );
      return { ...client, officers: dirigeants };
    },
  },

  {
    nom: 'list_tasks',
    titre: 'Lister les taches',
    description: 'Liste les taches du cabinet, avec filtre optionnel par statut.',
    parametres: {
      type: 'object',
      properties: {
        // ⚠️ « archived » N'EST PAS UN STATUT : l'archivage est un booleen a
        // part (`is_archived`). La description annoncait une valeur que la
        // contrainte CHECK refuse, et taisait `review`, qui existe.
        status: { type: 'string', description: 'todo, in_progress, review ou done' },
        ...PAGINATION,
      },
    },
    executer: async (a) =>
      requete(
        /**
         * ⚠️ CETTE REQUETE NE S'EST JAMAIS EXECUTEE. Elle demandait `title`,
         * `status`, `priority`, `due_date`, `assigned_to` — cinq colonnes
         * anglaises a une table qui les nomme en francais. PostgreSQL rendait
         * « column "title" does not exist », et `list_tasks` echouait a chaque
         * appel depuis sa mise en service. Quatre autres outils portaient la
         * meme erreur ; `tests/mcp-sql.test.ts` les fait desormais valider par
         * un vrai PostgreSQL, ce qui aurait suffi a les attraper.
         */
        `SELECT id, titre, description, statut, priorite,
                to_char(date_echeance, 'YYYY-MM-DD') AS date_echeance,
                assignee_id, category_id, client_id, progress, is_archived, created_at
           FROM tasks
          WHERE ($1::text IS NULL OR statut = $1)
          ORDER BY created_at DESC
          LIMIT $2 OFFSET $3`,
        [texte(a.status), borne(a.limit, 50), decalage(a.offset)]
      ),
  },

  {
    nom: 'get_task',
    titre: 'Detail tache',
    description: "Detail complet d'une tache.",
    parametres: {
      type: 'object',
      properties: { task_id: { type: 'string', description: 'UUID de la tache' } },
      required: ['task_id'],
    },
    executer: async (a) =>
      // `to_jsonb` et non `SELECT *` : voir `get_client`. `date_echeance` en
      // sortirait sinon datee de la veille.
      (
        await requeteUne<{ tache: Record<string, unknown> }>(
          'SELECT to_jsonb(t.*) AS tache FROM tasks t WHERE t.id = $1',
          [a.task_id]
        )
      )?.tache ?? { erreur: 'Tache introuvable.' },
  },

  {
    nom: 'list_fiscal_deadlines',
    titre: 'Lister les echeances fiscales',
    description:
      "Jour d'echeance TVA (calendrier CA3 : 16, 19, 21 ou 24 du mois) de chaque " +
      "societe suivie en TVA mensuelle ou trimestrielle. N'INCLUT PAS la TVA " +
      "annuelle (CA12), dont l'echeance depend de la cloture d'exercice et non " +
      "d'un jour fixe du mois, ni les autres declarations (liasses, DSN...), ni " +
      "les dates limites de declaration de revenus.",
    parametres: { type: 'object', properties: PAGINATION },
    /**
     * ⚠️ CE BLOC REPREND, A L'IDENTIQUE, LA LOGIQUE D'ENRICHISSEMENT DE
     * `GET /api/jedeclare/suivi` (routes/jedeclare.ts) : meme lecture du
     * portefeuille, meme rapprochement, meme appel a `echeanceTva()`. Cette
     * route reste la source de verite testee (pile complete, Chromium pilote) ;
     * la dupliquer ici plutot que d'appeler une fonction commune est un choix
     * delibere — un refactor qui fait glisser silencieusement le comportement de
     * l'ecran aurait un cout largement superieur a la trentaine de lignes
     * repetees.
     *
     * UNE SEULE EXCEPTION, ET ELLE EST DANS L'AUTRE SENS : QUI EST HORS
     * PORTEFEUILLE. `estHorsPortefeuille` est appelee, pas recopiee. Le
     * raisonnement ci-dessus protege contre un refactor qui ferait diverger les
     * deux ; ici c'est l'inverse qu'on craint — deux copies d'une regle a trois
     * clauses finiraient par ne plus dire la meme chose, et le cabinet lirait
     * deux portefeuilles selon qu'il regarde l'ecran ou interroge son assistant.
     *
     * fiscal_deadline_cards, que cet outil interrogeait jusqu'ici, n'existe
     * plus : c'etait la table d'un ecran Kanban « Echeances fiscales » retire du
     * produit. L'outil MCP n'avait pas ete mis a jour en meme temps, et rendait
     * « relation does not exist » a chaque appel.
     */
    executer: async (a) => {
      const clients = await requete<
        ClientRapprochable & ClientEcheance & { id: string; date_sortie_cabinet: string | null }
      >(
        // `date_sortie_cabinet` est une `date`, et le type declare ci-dessus dit
        // `string | null` : sans `to_char`, `pg` rendait un objet `Date` — un
        // mensonge de type que `estHorsPortefeuille` recevait en entree.
        `SELECT id, siren, siret, numero_dossier, statut, nom_entreprise,
                type_personne, forme_juridique, nom, tva_jour_echeance,
                to_char(date_sortie_cabinet, 'YYYY-MM-DD') AS date_sortie_cabinet
           FROM clients`
      );
      const index = indexerClients(clients);
      const parId = new Map(clients.map((c) => [c.id, c]));

      // Sorties, archivees, inactives : la MEME regle que l'ecran, parce que
      // c'est la meme fonction — voir `estHorsPortefeuille`.
      const horsPortefeuille = new Set(clients.filter(estHorsPortefeuille).map((c) => c.id));

      const manuels = new Map<string, string>();
      for (const l of await requete<{
        siren: string;
        type_declaration: string;
        client_id: string | null;
        rapprochement_manuel: boolean;
      }>(
        `SELECT siren, type_declaration, client_id, rapprochement_manuel
           FROM jedeclare_suivi_interne WHERE axe = 'periode'`
      )) {
        if (l.rapprochement_manuel && l.client_id) {
          manuels.set(`${l.siren}|${l.type_declaration}`, l.client_id);
        }
      }

      const cacheClient = new Map<string, string | null>();
      const clientDe = (s: { siren: string; siret: string; dossier: string }, type: string) => {
        const cle = `${s.siren}|${s.siret}|${s.dossier}|${type}`;
        if (!cacheClient.has(cle)) {
          cacheClient.set(cle, manuels.get(`${s.siren}|${type}`) ?? rapprocher(s, index).clientId);
        }
        return cacheClient.get(cle)!;
      };

      // La MEME fenetre par defaut que l'ecran Suivi echeances
      // (periodeParDefaut(), src/lib/jedeclareService.ts) : -6 mois a +3 mois.
      // Un outil MCP qui repondrait sur une fenetre differente de celle que le
      // collaborateur voit a l'ecran donnerait deux verites au meme cabinet.
      const maintenant = new Date();
      const iso = (d: Date) =>
        `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      const debut = iso(new Date(maintenant.getFullYear(), maintenant.getMonth() - 6, 1));
      const fin = iso(new Date(maintenant.getFullYear(), maintenant.getMonth() + 3, 0));

      const pivot = await construireSuivi({
        debut,
        fin,
        axe: 'periode',
        exclure: (l) => {
          const id = clientDe(l, l.type_declaration || '(type non précisé)');
          return id !== null && horsPortefeuille.has(id);
        },
      });

      const lignes: {
        societe: string;
        siren: string;
        client_id: string | null;
        client_nom: string | null;
        type_declaration: string;
        periodicite: string | null;
        jour_echeance: number | null;
        origine: string;
        motif: string;
      }[] = [];

      for (const table of pivot.tables) {
        // Pas de jour d'echeance hors TVA : une liasse fiscale n'en a pas.
        if (!table.estTva) continue;
        for (const s of table.societes) {
          const auto = rapprocher(s, index);
          const manuel = manuels.get(`${s.siren}|${table.typeDeclaration}`) ?? null;
          const clientId = manuel ?? auto.clientId;
          const client = clientId ? (parId.get(clientId) ?? null) : null;
          const e = echeanceTva(client, table.periodicite ?? null);
          lignes.push({
            societe: s.societe,
            siren: s.siren,
            client_id: clientId,
            // Resolu depuis la fiche plutot que de reprendre le `null` que la
            // route pose sur un rattachement manuel : cote ecran, l'utilisateur
            // peut cliquer sur `clientId` pour voir le nom ; un assistant MCP ne
            // le peut pas, et un nom manquant s'y lirait comme une societe
            // inconnue du portefeuille — ce qui serait faux.
            client_nom: client?.nom_entreprise ?? auto.clientNom,
            type_declaration: table.typeDeclaration,
            periodicite: table.periodicite ?? null,
            jour_echeance: e.jour,
            origine: e.origine,
            motif: e.motif,
          });
        }
      }

      lignes.sort(compareParJourEcheance);

      const dep = decalage(a.offset);
      return lignes.slice(dep, dep + borne(a.limit, 50));
    },
  },

  {
    nom: 'list_balance_sheets',
    titre: 'Lister les bilans',
    description: 'Cartes du tableau des bilans.',
    parametres: { type: 'object', properties: PAGINATION },
    executer: async (a) =>
      requete(
        // `exercice_end` et `assigned_to` n'existent pas : la carte porte une
        // ANNEE (`year`) et un `assignee_id`. La requete echouait a chaque appel.
        `SELECT id, client_id, column_id, notes, year, regime_fiscal, mois_traites,
                assignee_id, position, created_at
           FROM bilan_cards
          ORDER BY created_at DESC
          LIMIT $1 OFFSET $2`,
        [borne(a.limit, 50), decalage(a.offset)]
      ),
  },

  {
    nom: 'list_opportunities',
    titre: 'Lister les opportunites',
    description: 'Cartes du tableau commercial.',
    parametres: { type: 'object', properties: PAGINATION },
    executer: async (a) =>
      requete(
        // `amount`, `probability` et `assigned_to` n'existent pas. Le montant
        // s'appelle `montant_estime`, la probabilite n'est pas stockee, et la
        // carte porte en plus une date de relance et une origine.
        `SELECT id, prospect_name, client_id, column_id, notes, comment, source,
                montant_estime, to_char(date_relance, 'YYYY-MM-DD') AS date_relance,
                assignee_id, position, created_at
           FROM opportunity_cards
          ORDER BY created_at DESC
          LIMIT $1 OFFSET $2`,
        [borne(a.limit, 50), decalage(a.offset)]
      ),
  },

  {
    nom: 'list_collaborators',
    titre: 'Lister les collaborateurs',
    description: 'Collaborateurs du cabinet.',
    parametres: { type: 'object', properties: {} },
    executer: async () =>
      requete(
        `SELECT id, prenom, nom, email, role, job_role, is_active, created_at
           FROM profiles
          ORDER BY nom`
      ),
  },

  {
    nom: 'list_software',
    titre: 'Lister les logiciels',
    description: 'Logiciels recenses par le cabinet.',
    parametres: { type: 'object', properties: {} },
    executer: async () =>
      requete(
        // `license_type` et `notes` n'existent pas ; la table porte une
        // `description`. La requete echouait a chaque appel.
        `SELECT id, name, category, description, is_active, created_at
           FROM software
          ORDER BY name`
      ),
  },

  {
    nom: 'list_meeting_notes',
    titre: 'Lister les comptes rendus',
    description: 'Comptes rendus de rendez-vous client, du plus recent au plus ancien.',
    parametres: {
      type: 'object',
      properties: {
        client_id: { type: 'string', description: 'Filtrer par UUID du client' },
        ...PAGINATION,
      },
    },
    executer: async (a) =>
      requete(
        // `title`, `content` et `meeting_date` n'existent pas : le compte rendu
        // porte un `objet`, un `contenu` et une `date_rdv`. La requete echouait
        // a chaque appel. `date_rdv` est une `date` — d'ou le `to_char`, sans
        // lequel elle sortirait datee de la veille.
        `SELECT id, client_id, objet, contenu, type_rdv, participants, actions_a_suivre,
                to_char(date_rdv, 'YYYY-MM-DD') AS date_rdv, created_by, created_at
           FROM client_meeting_notes
          WHERE ($1::uuid IS NULL OR client_id = $1::uuid)
          ORDER BY date_rdv DESC NULLS LAST
          LIMIT $2 OFFSET $3`,
        [texte(a.client_id), borne(a.limit, 30), decalage(a.offset)]
      ),
  },

  {
    nom: 'list_officers',
    titre: 'Lister les dirigeants',
    description: 'Mandats de dirigeants, avec filtres par client, type de role et activite.',
    parametres: {
      type: 'object',
      properties: {
        client_id: { type: 'string', description: 'Filtrer par UUID du client' },
        role_type: {
          type: 'string',
          description: 'dirigeant, administrateur, commissaire, associe ou autre',
        },
        active_only: { type: 'boolean', description: 'Uniquement les mandats en cours (defaut : oui)' },
        ...PAGINATION,
      },
    },
    executer: async (a) =>
      requete(
        // ⚠️ `start_date` et `end_date` sont des `date` : sans `to_char`, un
        // mandat pris le 1er juin sortait date du 31 mai. La date de naissance
        // du dirigeant, elle, passe par `to_jsonb` et en ressort deja en texte.
        `SELECT oc.id, oc.role, oc.role_type,
                to_char(oc.start_date, 'YYYY-MM-DD') AS start_date,
                to_char(oc.end_date, 'YYYY-MM-DD') AS end_date,
                oc.is_active, oc.power_type, oc.notes,
                to_jsonb(co.*) - 'created_at' - 'updated_at' AS officer,
                jsonb_build_object('id', c.id, 'nom_entreprise', c.nom_entreprise,
                                   'siren', c.siren) AS client
           FROM officer_companies oc
           JOIN company_officers co ON co.id = oc.officer_id
           JOIN clients c ON c.id = oc.client_id
          WHERE ($1::uuid IS NULL OR oc.client_id = $1::uuid)
            AND ($2::text IS NULL OR oc.role_type = $2)
            AND ($3::boolean IS DISTINCT FROM true OR oc.is_active)
          ORDER BY oc.is_active DESC, c.nom_entreprise
          LIMIT $4 OFFSET $5`,
        [
          texte(a.client_id),
          texte(a.role_type),
          // Actifs seulement par défaut, comme dans l'original : passer
          // explicitement false élargit aux mandats terminés.
          a.active_only !== false,
          borne(a.limit, 50),
          decalage(a.offset),
        ]
      ),
  },

  {
    nom: 'get_officer',
    titre: 'Detail dirigeant',
    description: "Detail d'un dirigeant et de tous ses mandats, en cours et termines.",
    parametres: {
      type: 'object',
      properties: {
        officer_id: { type: 'string', description: 'UUID du dirigeant' },
      },
      required: ['officer_id'],
    },
    executer: async (a) => {
      // `to_jsonb` et non `SELECT *` : `birth_date` en sortirait sinon datee de
      // la veille. Voir `get_client`.
      const enveloppe = await requeteUne<{ personne: Record<string, unknown> }>(
        'SELECT to_jsonb(co.*) AS personne FROM company_officers co WHERE co.id = $1',
        [a.officer_id]
      );
      if (!enveloppe) return { erreur: 'Dirigeant introuvable.' };
      const dirigeant = enveloppe.personne;

      const mandats = await requete(
        `SELECT oc.id, oc.role, oc.role_type,
                to_char(oc.start_date, 'YYYY-MM-DD') AS start_date,
                to_char(oc.end_date, 'YYYY-MM-DD') AS end_date,
                oc.is_active, oc.power_type, oc.notes,
                jsonb_build_object('id', c.id, 'nom_entreprise', c.nom_entreprise,
                                   'siren', c.siren) AS client
           FROM officer_companies oc
           JOIN clients c ON c.id = oc.client_id
          WHERE oc.officer_id = $1
          ORDER BY oc.is_active DESC, oc.start_date DESC NULLS LAST`,
        [a.officer_id]
      );
      return { ...dirigeant, mandates: mandats };
    },
  },

  {
    nom: 'search',
    titre: 'Recherche globale',
    description: 'Recherche simultanee dans les clients, taches, comptes rendus et dirigeants.',
    parametres: {
      type: 'object',
      properties: { query: { type: 'string', description: 'Terme recherche' } },
      required: ['query'],
    },
    executer: async (a) => {
      const q = texte(a.query);
      if (!q) return { erreur: 'query manquant.' };

      // Quatre requêtes en parallèle : elles portent sur des tables distinctes,
      // et les enchaîner tripleraient le temps de réponse pour rien.
      const [clients, taches, comptesRendus, dirigeants] = await Promise.all([
        requete(
          `SELECT id, nom_entreprise, siren, siret, email, contact_principal
             FROM clients
            WHERE nom_entreprise ILIKE '%' || $1 || '%'
               OR contact_principal ILIKE '%' || $1 || '%'
               OR siren ILIKE '%' || $1 || '%'
               OR email ILIKE '%' || $1 || '%'
            ORDER BY nom_entreprise
            LIMIT 10`,
          [q]
        ),
        requete(
          // Colonnes francaises, ici aussi : `titre` et `statut`. Ces deux
          // branches faisaient echouer la recherche ENTIERE — `Promise.all`
          // rejette des qu'une seule requete leve, donc chercher un nom de
          // client ne rendait rien non plus.
          `SELECT id, titre, description, statut
             FROM tasks
            WHERE titre ILIKE '%' || $1 || '%' OR description ILIKE '%' || $1 || '%'
            ORDER BY created_at DESC
            LIMIT 10`,
          [q]
        ),
        requete(
          `SELECT id, objet, contenu, client_id,
                  to_char(date_rdv, 'YYYY-MM-DD') AS date_rdv
             FROM client_meeting_notes
            WHERE objet ILIKE '%' || $1 || '%' OR contenu ILIKE '%' || $1 || '%'
            ORDER BY date_rdv DESC NULLS LAST
            LIMIT 10`,
          [q]
        ),
        requete(
          `SELECT DISTINCT co.id, co.full_name, co.person_type, co.denomination
             FROM company_officers co
             JOIN officer_companies oc ON oc.officer_id = co.id
            WHERE co.full_name ILIKE '%' || $1 || '%'
               OR co.denomination ILIKE '%' || $1 || '%'
            ORDER BY co.full_name
            LIMIT 10`,
          [q]
        ),
      ]);

      return { clients, tasks: taches, meeting_notes: comptesRendus, officers: dirigeants };
    },
  },

  {
    nom: 'get_client_statuts',
    titre: 'Statuts d\'un client',
    description:
      "Statuts de la societe deposes au greffe : le TEXTE INTEGRAL du document, " +
      'plus quelques reperes lus mecaniquement (denomination, capital, duree, cloture). ' +
      "A utiliser pour repondre sur le contenu des statuts — objet social, gerance, " +
      'repartition des parts, clauses d\'agrement — en lisant le texte rendu. ' +
      "SI LE DOCUMENT EST UN SCAN (etat « scanne-image »), ses pages arrivent EN IMAGE : " +
      'lisez-les, elles portent le meme contenu. Utilisez `pages` pour en demander d\'autres. ' +
      'DEUX RESERVES A REPERCUTER DANS TOUTE REPONSE : cet outil interroge le registre ' +
      'INPI en direct (appel sortant, quelques dizaines de secondes) ; et les statuts ' +
      'deposes ne refletent PAS les cessions de parts posterieures au depot, donc toute ' +
      'repartition qui en est deduite est datee et reste a confirmer. ' +
      "SI LA REPONSE VAUT « aucun » MAIS QUE `pieces` EN LISTE, le registre a des actes " +
      "qu'il ne libelle pas : redemandez-les un a un avec `reference`. " +
      "POUR UNE QUESTION DE REPARTITION DES PARTS, appelez d'abord " +
      '`get_client_repartition` : le cabinet y saisit l\'etat courant, qui prime sur les statuts.',
    parametres: {
      type: 'object',
      properties: {
        client_id: { type: 'string', description: 'UUID du client' },
        inclure_texte: {
          type: 'boolean',
          description: 'Inclure le texte integral (defaut : oui). Non pour une reponse courte.',
        },
        pages: {
          type: 'string',
          description:
            "Pages a rendre en image quand le document est un SCAN — « 1-8 » ou « 1,3,12 ». " +
            'Sans precision : les huit premieres. Sans effet sur un document a couche texte.',
        },
        reference: {
          type: 'string',
          description:
            "Reference d'une piece precise a telecharger, au lieu de laisser l'outil " +
            'choisir. A employer quand la reponse vaut « aucun » ALORS QUE `pieces` en ' +
            "liste : certains greffes deposent des actes sans libelle, que l'INPI rend " +
            "sous « Document » et qu'aucune regle ne peut reconnaitre. Prenez alors les " +
            'references une a une et lisez ce qu\'elles contiennent.',
        },
      },
      required: ['client_id'],
    },
    executer: async (a) =>
      statutsDuClient(String(a.client_id), a.inclure_texte !== false, a.pages, a.reference),
  },

  {
    nom: 'get_client_repartition',
    titre: 'Repartition des parts',
    description:
      'Repartition du capital SAISIE PAR LE CABINET : qui detient combien de parts ou ' +
      "d'actions, en pleine propriete, nue-propriete ou usufruit, depuis quelle date et par " +
      'quel acte. Rend aussi le capital social, le nombre total de parts et la somme des ' +
      'detentions saisies. ' +
      'Chaque ligne porte un champ `source` : « manual » = saisie ou relue par le cabinet, ' +
      "elle engage ; « statuts » = deduite du document depose au greffe, donc DATEE DU DEPOT " +
      'et ignorant les cessions posterieures — une telle ligne est a confirmer avant toute ' +
      'signature, et il faut le dire a l\'utilisateur. ' +
      "C'EST LA SOURCE A PRIVILEGIER pour toute question de detention — attestation de " +
      'nombre de parts, qualite d\'associe, quote-part — car elle tient compte des cessions ' +
      'que les statuts deposes au greffe ignorent. ' +
      "ATTENTION AU DEMEMBREMENT : `somme_parts` additionne la pleine propriete et la " +
      "nue-propriete SEULEMENT. L'usufruit n'est pas une part du capital mais un droit sur " +
      "des parts dont un autre est nu-proprietaire ; l'inclure compterait deux fois les memes " +
      'parts. Une attestation doit toujours PRECISER le demembrement : « 250 parts en ' +
      "nue-propriete » n'est pas « 250 parts ». " +
      'DEUX RESERVES A REPERCUTER : le champ `repartition_complete` vaut false quand la ' +
      'somme des parts saisies ne correspond pas au total declare, et null quand ce total ' +
      "n'est pas renseigne ; dans ces deux cas LE CHIFFRE NE DOIT PAS ETRE ATTESTE sans " +
      'confirmation du cabinet. Lecture seule, sans appel sortant.',
    parametres: {
      type: 'object',
      properties: {
        client_id: { type: 'string', description: 'UUID du client' },
      },
      required: ['client_id'],
    },
    executer: async (a) => repartitionDuClient(String(a.client_id)),
  },
  {
    nom: 'set_client_repartition',
    titre: 'Enregistrer la repartition des parts',
    description:
      "ECRIT la repartition du capital d'un client dans le CRM : la liste des associes avec " +
      "leur nombre de parts, leur demembrement, la date d'effet et l'acte source. C'est le " +
      'SEUL outil de ce connecteur qui modifie quoi que ce soit. ' +
      "MONTREZ TOUJOURS A L'UTILISATEUR CE QUE VOUS ALLEZ ECRIRE, ET ATTENDEZ SON ACCORD " +
      "avant d'appeler cet outil : il ecrit dans le dossier d'un client reel. " +
      'REFUS PAR DEFAUT SI UNE REPARTITION EXISTE : appelez alors `get_client_repartition`, ' +
      "montrez l'existant, et ne rappelez cet outil avec `remplacer: true` que si " +
      "l'utilisateur confirme l'ecrasement. " +
      "RENSEIGNEZ `source` HONNETEMENT : « statuts » si vous avez deduit les chiffres du " +
      'document depose au greffe (ils datent alors du depot et ne tiennent pas compte des ' +
      'cessions posterieures), « manual » si l\'utilisateur vous les a dictes ou confirmes. ' +
      "Cette valeur s'affiche dans la fiche et decide de la confiance qu'on accorde au chiffre : " +
      "l'annoncer « manual » alors qu'elle vient des statuts ferait passer un chiffre de " +
      "vingt ans d'age pour une donnee verifiee. " +
      "L'usufruit ne compte pas dans le capital : ne le comptez pas dans le total. " +
      'Renseignez `parts_totales` quand vous le connaissez — sans lui aucun pourcentage ' +
      "n'est calculable. Il n'est pose que si la fiche ne le porte pas deja.",
    parametres: {
      type: 'object',
      properties: {
        client_id: { type: 'string', description: 'UUID du client' },
        detentions: {
          type: 'array',
          description:
            "Les associes et ce qu'ils detiennent. Chaque entree : `officer_id` (UUID d'une " +
            'personne deja connue du CRM) OU `nom` + `prenom` (personne physique) OU ' +
            '`denomination` (personne morale) ; `nb_parts` (nombre, obligatoire, > 0) ; ' +
            '`demembrement` (« pleine-propriete » par defaut, ou « nue-propriete », ou ' +
            "« usufruit ») ; `date_effet` (AAAA-MM-JJ, facultative) ; `acte_source` (texte " +
            'libre : « Cession de parts du 12/03/2019, Me Durand », ou « Statuts deposes le ' +
            "… ») ; `notes` (facultatif). Une personne inconnue est creee.",
          items: { type: 'object' },
        },
        source: {
          type: 'string',
          description:
            "« manual » (defaut) si l'utilisateur a dicte ou confirme les chiffres, " +
            '« statuts » s\'ils sont deduits du document depose au greffe.',
        },
        parts_totales: {
          type: 'number',
          description:
            'Nombre total de parts composant le capital. Pose sur la fiche uniquement si elle ' +
            "ne le porte pas deja : un total saisi par le cabinet n'est jamais ecrase.",
        },
        remplacer: {
          type: 'boolean',
          description:
            'A ne passer a true QUE si l\'utilisateur a vu la repartition existante et ' +
            'confirme son remplacement. Les lignes en place sont alors effacees.',
        },
      },
      required: ['client_id', 'detentions'],
    },
    executer: async (a, contexte) => ecrireRepartition(a, contexte),
  },
];

export const OUTILS_PAR_NOM = new Map(OUTILS.map((o) => [o.nom, o]));
