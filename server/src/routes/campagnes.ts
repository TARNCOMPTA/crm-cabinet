/**
 * Campagnes — écrire à une liste de clients.
 * ---------------------------------------------------------------------------
 * Trois routes de session et une page publique.
 *
 * ⚠️ TOUT COLLABORATEUR PEUT LANCER UNE CAMPAGNE, ET CE N'EST PAS UN OUBLI. Le
 * cabinet l'a decide : ecrire a un groupe de clients fait partie du travail
 * courant, pas de l'administration de l'outil. Ce que cela change par rapport a
 * un ecran de consultation doit rester en tete — un envoi PART, il ne se reprend
 * pas, et il part AU NOM DU CABINET.
 *
 * Trois choses le rendent tenable, et elles doivent le rester :
 *   · `mailing_campagnes.cree_par` porte l'auteur de chaque envoi, et
 *     l'historique de `GET /api/campagnes` le montre a tout le monde — un envoi
 *     n'est jamais anonyme ;
 *   · l'apercu (`POST /api/campagnes/apercu`) precede l'envoi et affiche
 *     nommement qui recevra le message et qui en est exclu ;
 *   · l'ecriture DIRECTE dans `mailing_campagnes` reste fermee aux
 *     administrateurs (TABLES_ADMIN, rest-droits.ts) : passer par cette route est
 *     le seul moyen d'envoyer, donc le seul moyen d'etre trace.
 *
 * CE QUI EST DÉLÉGUÉ À LA FILE, ET POURQUOI. L'envoi n'est pas fait ici : chaque
 * destinataire devient une ligne de `email_queue`, que `viderFile()` écoule par
 * lots de 50 toutes les deux minutes (server/src/file-emails.ts). Trois raisons,
 * dans cet ordre :
 *
 *   1. la file porte déjà les trois réessais, le verrou `FOR UPDATE SKIP LOCKED`
 *      et la trace des échecs — les réécrire serait les réécrire en moins bien ;
 *   2. 25 courriels par minute passent sous la limite de 30/min d'Office 365, sans
 *      qu'aucun réglage de cadence n'ait à être inventé ;
 *   3. une requête HTTP qui enverrait 317 courriels ferait attendre
 *      l'administrateur un quart d'heure devant un écran figé.
 *
 * UN MESSAGE PAR DESTINATAIRE, JAMAIS DE COPIE CACHÉE. La personnalisation et le
 * lien de désinscription l'exigent — et une erreur de champ sur un envoi groupé
 * divulguerait la liste des clients du cabinet à chacun d'entre eux.
 *
 * UN DESTINATAIRE EST UNE ADRESSE, PAS UN CLIENT. Une fiche portant `email` ET
 * `email_2` reçoit sur les deux : deux lignes d'`email_queue`, deux lignes de
 * `mailing_destinataires`, et deux dans le compte annoncé avant l'envoi. Le
 * dédoublonnage reste par adresse — une seconde adresse recopiée de la première,
 * ou déjà servie chez une société sœur, ne produit rien de plus
 * (`resoudreDestinataires`, campagnes/gabarit.ts).
 *
 * La désinscription, elle, reste PAR CLIENT : le lien signe un identifiant de
 * fiche et `accepte_mailings` vit sur la fiche, donc se désinscrire depuis l'une
 * des deux adresses coupe les deux. C'est la seule lecture défendable d'un « je
 * ne veux plus recevoir ».
 *
 * ⚠️ LA PAGE DE DÉSINSCRIPTION EST RENDUE ICI, en HTML, et non par le front. Deux
 * raisons : elle doit fonctionner pour quelqu'un qui n'a pas de session, et le
 * service worker de la PWA rabat toute navigation non exclue sur `index.html`. Le
 * chemin `/desinscription` est donc inscrit dans `navigateFallbackDenylist`
 * (vite.config.ts) — sans quoi le client cliquant depuis son courriel tomberait
 * sur « Page introuvable », comme cela s'est produit avec `/authorize`.
 */

import type { FastifyInstance, FastifyReply } from 'fastify';
import { config } from '../config.js';
import { requete, requeteUne, transaction } from '../db.js';
import { exigerSession } from '../gardes.js';
import { echapperHtml } from '../html.js';
import {
  construireCourriel,
  prefixesNaf,
  resoudreDestinataires,
  signerDesinscription,
  nettoyerSujet,
  substituer,
  verifierSignatureDesinscription,
  VARIABLES,
  type ClientDestinataire,
} from '../campagnes/gabarit.js';

/**
 * Les filtres que l'écran peut envoyer.
 *
 * Ceux de `useClientFilters` — statut, régime, clôture, recherche — plus le code
 * NAF, qui n'existe que sur cet écran : une liste de clients se parcourt à l'œil,
 * une campagne se cible par métier.
 */
interface Filtres {
  statut?: string;
  regime?: string;
  cloture?: string;
  collaborateurs?: string[];
  recherche?: string;
  /** Préfixes de code NAF : `6201Z` pour une classe, `62` pour toute sa division. */
  codesNaf?: string[];
}

/**
 * ⚠️ `email_2` DOIT RESTER DANS CETTE LISTE. `requete<ClientDestinataire>` type le
 * resultat sans le verifier : une colonne absente du SELECT arrive `undefined`,
 * `resoudreDestinataires` ne voit qu'une adresse, et la seconde cesse d'etre
 * servie SANS QU'AUCUN TYPE NI AUCUN TEST UNITAIRE NE BRONCHE. Le seul signe
 * serait un compte de destinataires plus bas que prevu, dans un ecran ou
 * personne ne connait le chiffre attendu.
 */
const COLONNES_CLIENT = `id, nom_entreprise, dirigeant, numero_dossier,
                         date_cloture, regime_fiscal, email, email_2`;

/**
 * `code_ape` réduit à ce qui se compare : `62.01 Z`, `62.01Z` et `6201z`
 * désignent la même activité. Le pendant SQL de `normaliserCodeNaf`, et il doit
 * le rester — une réduction faite d'un seul côté ne rapprocherait rien.
 */
const NAF_COMPARABLE = `upper(regexp_replace(coalesce(code_ape, ''), '[^a-zA-Z0-9]', '', 'g'))`;

/**
 * Résout les clients visés par des filtres.
 *
 * Le filtrage se fait EN SQL et non en JavaScript après un `SELECT *` : la liste
 * peut porter 649 clients, et le résultat sert deux fois — l'aperçu et l'envoi.
 * Les deux doivent viser exactement la même population, donc partager ce code.
 */
async function clientsVises(f: Filtres): Promise<ClientDestinataire[]> {
  const conditions: string[] = [];
  const valeurs: unknown[] = [];

  // Par défaut on écarte les archivés : écrire à un client sorti du cabinet est
  // au mieux inutile, au pire embarrassant.
  if (f.statut && f.statut !== 'all') {
    valeurs.push(f.statut);
    conditions.push(`statut = $${valeurs.length}`);
  } else {
    conditions.push(`statut <> 'archive'`);
  }
  if (f.regime && f.regime !== 'all') {
    valeurs.push(f.regime);
    conditions.push(`regime_fiscal = $${valeurs.length}`);
  }
  if (f.cloture && f.cloture !== 'all') {
    // `date_cloture` porte un mois de clôture ; on compare le mois seul.
    valeurs.push(f.cloture);
    conditions.push(`to_char(date_cloture::date, 'MM') = lpad($${valeurs.length}, 2, '0')`);
  }
  if (f.recherche?.trim()) {
    valeurs.push(`%${f.recherche.trim()}%`);
    const i = valeurs.length;
    conditions.push(
      `(nom_entreprise ILIKE $${i} OR dirigeant ILIKE $${i} OR numero_dossier ILIKE $${i})`
    );
  }
  if (f.collaborateurs?.length) {
    valeurs.push(f.collaborateurs);
    conditions.push(
      `id IN (SELECT client_id FROM client_collaborators WHERE user_id = ANY($${valeurs.length}::uuid[]))`
    );
  }
  // Le code NAF, par PRÉFIXE et non par égalité : plusieurs codes sélectionnés
  // s'additionnent (OU), comme on attend d'un filtre par métier. Une fiche sans
  // code renseigné se réduit à la chaîne vide et ne peut donc jamais matcher —
  // elle sort de la cible dès qu'un code est demandé, ce qui est le bon parti :
  // on ne devine pas l'activité d'un client dont on ignore le code.
  const naf = prefixesNaf(f.codesNaf);
  if (naf.length) {
    valeurs.push(naf.map((p) => `${p}%`));
    conditions.push(`${NAF_COMPARABLE} LIKE ANY($${valeurs.length}::text[])`);
  }

  return requete<ClientDestinataire>(
    `SELECT ${COLONNES_CLIENT}
       FROM clients
      WHERE ${conditions.join(' AND ')}
      ORDER BY nom_entreprise`,
    valeurs
  );
}

/** Les clients désinscrits, à écarter quels que soient les filtres. */
async function desinscrits(): Promise<Set<string>> {
  const lignes = await requete<{ id: string }>(
    'SELECT id FROM clients WHERE accepte_mailings = false'
  );
  return new Set(lignes.map((l) => l.id));
}

function urlDesinscription(clientId: string): string {
  const base = config.publicUrl.replace(/\/$/, '');
  const s = signerDesinscription(config.session.secret, clientId);
  return `${base}/desinscription?c=${encodeURIComponent(clientId)}&s=${encodeURIComponent(s)}`;
}

function pageHtml(titre: string, corps: string): string {
  return `<!doctype html>
<html lang="fr"><head><meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${echapperHtml(titre)}</title>
<style>
  :root { color-scheme: light dark }
  body { margin:0; min-height:100vh; display:flex; align-items:center; justify-content:center;
         background:#faf8f7; color:#1c1917;
         font:16px/1.55 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif; padding:24px }
  main { max-width:30rem; width:100%; background:#fff; border:1px solid #e7e5e4;
         border-radius:16px; padding:32px; box-shadow:0 1px 3px rgba(0,0,0,.06) }
  h1 { margin:0 0 12px; font-size:1.3rem; color:#7c2d5e }
  p { margin:0 0 12px; color:#44403c }
  @media (prefers-color-scheme: dark) {
    body { background:#1c1917; color:#f5f5f4 }
    main { background:#292524; border-color:#44403c } p { color:#d6d3d1 }
  }
</style></head><body><main>${corps}</main></body></html>`;
}

export function enregistrerRoutesCampagnes(app: FastifyInstance): void {
  /**
   * Les codes NAF présents dans le portefeuille, avec leur effectif.
   *
   * ⚠️ CE QUI EXISTE, ET RIEN D'AUTRE. La nomenclature NAF compte 732 codes ; le
   * cabinet en touche quelques dizaines. Proposer la liste entière ferait choisir
   * des filtres qui ne ramènent personne, et un envoi vide se lit comme une panne
   * du logiciel bien avant de se lire comme un portefeuille sans ce métier.
   *
   * L'effectif porte sur tout le portefeuille hors archivés, sans tenir compte
   * des autres filtres de l'écran : c'est un repère pour choisir un code, pas une
   * promesse de destinataires. Seul l'aperçu compte les destinataires, et il les
   * compte pour de bon.
   *
   * `sansCode` compte les fiches dépourvues de code NAF, et il est renvoyé pour
   * être MONTRÉ. Filtrer par métier les écarte en silence : sans ce chiffre à
   * l'écran, un portefeuille à moitié renseigné produirait une campagne à moitié
   * partie, sans que rien ne distingue « ce client n'est pas du métier visé » de
   * « on ne sait pas quel est son métier ».
   */
  app.get('/api/campagnes/codes-naf', async (request, reply) => {
    const session = await exigerSession(request, reply);
    if (!session) return;

    // Le seau vide est un groupe comme les autres : une seule passe sur la table,
    // et le compte des fiches sans code ne peut pas diverger de celui des autres.
    const lignes = await requete<{ code: string; nb: string }>(
      `SELECT ${NAF_COMPARABLE} AS code, count(*)::text AS nb
         FROM clients
        WHERE statut <> 'archive'
        GROUP BY 1
        ORDER BY 1`
    );

    return {
      codes: lignes
        .filter((l) => l.code !== '')
        .map((l) => ({ code: l.code, nb: Number(l.nb) })),
      sansCode: Number(lignes.find((l) => l.code === '')?.nb ?? 0),
    };
  });

  /**
   * L'aperçu : la même résolution que l'envoi, mais sans rien écrire.
   *
   * Il rend aussi le courriel tel qu'un client le recevra. On ne relit pas 317
   * courriels avant d'envoyer — on en relit un, et il faut que ce soit un vrai,
   * avec un vrai nom et un vrai lien de désinscription.
   */
  app.post<{ Body: { filtres?: Filtres; corps?: string; retires?: string[] } }>(
    '/api/campagnes/apercu',
    async (request, reply) => {
      const session = await exigerSession(request, reply);
      if (!session) return;

      const { filtres = {}, corps = '', retires = [] } = request.body ?? {};
      const clients = await clientsVises(filtres);
      const { retenus, exclus } = resoudreDestinataires(
        clients,
        await desinscrits(),
        new Set(retires)
      );

      const temoin = retenus[0] ?? clients[0] ?? null;
      return {
        vises: clients.length,
        retenus: retenus.length,
        // La liste NOMINATIVE, pour que l'utilisateur puisse en retirer un a un.
        // Elle ne sert qu'a l'affichage : l'envoi la recalcule, il ne la recoit pas.
        destinataires: retenus.map((c) => ({
          id: c.id,
          nom: c.nom_entreprise,
          email: c.email,
        })),
        exclus,
        variables: VARIABLES,
        apercu: temoin
          ? {
              client: temoin.nom_entreprise,
              email: temoin.email,
              html: construireCourriel({
                corps,
                client: temoin,
                urlDesinscription: urlDesinscription(temoin.id),
                nomCabinet: config.webauthn.rpName,
              }),
            }
          : null,
      };
    }
  );

  /**
   * L'envoi : une transaction, la campagne, ses destinataires, et la file.
   *
   * TOUT OU RIEN. Une campagne à moitié mise en file est le pire état possible :
   * une partie des clients a reçu, l'écran n'en sait rien, et rejouer réenvoie aux
   * premiers. La transaction ferme cette porte.
   */
  app.post<{ Body: { filtres?: Filtres; sujet?: string; corps?: string; retires?: string[] } }>(
    '/api/campagnes',
    async (request, reply) => {
      const session = await exigerSession(request, reply);
      if (!session) return;

      const sujet = (request.body?.sujet ?? '').trim();
      const corps = (request.body?.corps ?? '').trim();
      const filtres = request.body?.filtres ?? {};
      const retires = request.body?.retires ?? [];

      if (!sujet || !corps) {
        return reply.code(400).send({ message: 'Un sujet et un corps sont obligatoires.' });
      }

      const clients = await clientsVises(filtres);
      const { retenus, exclus } = resoudreDestinataires(
        clients,
        await desinscrits(),
        new Set(retires)
      );
      if (retenus.length === 0) {
        return reply.code(400).send({
          message: 'Aucun destinataire joignable pour cette selection.',
        });
      }

      const campagneId = await transaction(async (client) => {
        const { rows } = await client.query<{ id: string }>(
          `INSERT INTO mailing_campagnes
             (sujet, corps, filtres, cree_par, envoye_le, nb_destinataires, nb_exclus)
           VALUES ($1, $2, $3, $4, now(), $5, $6) RETURNING id`,
          [
            sujet,
            corps,
            // Les retraits manuels sont conserves avec les filtres : six mois plus
            // tard, « pourquoi untel n'a-t-il rien recu ? » a une reponse.
            JSON.stringify({ ...filtres, retires }),
            session.sub,
            retenus.length,
            exclus.length,
          ]
        );
        const id = rows[0]!.id;

        for (const c of retenus) {
          const html = construireCourriel({
            corps,
            client: c,
            urlDesinscription: urlDesinscription(c.id),
            nomCabinet: config.webauthn.rpName,
          });
          // Le sujet accepte aussi les variables : « Votre TVA — {{nom_entreprise}} »
          // se lit mieux dans une boite de reception qu'un sujet identique pour tous.
          // Le nettoyage vient APRES la substitution : c'est la valeur inseree
          // qui peut porter un retour chariot — donc une injection d'en-tete SMTP
          // — pas le sujet saisi par l'administrateur.
          const sujetFinal = nettoyerSujet(substituer(sujet, c));

          const { rows: file } = await client.query<{ id: string }>(
            `INSERT INTO email_queue (user_id, to_email, subject, html_body, status)
             VALUES ($1, $2, $3, $4, 'pending') RETURNING id`,
            [session.sub, c.email, sujetFinal, html]
          );
          await client.query(
            `INSERT INTO mailing_destinataires (campagne_id, client_id, email, email_queue_id)
             VALUES ($1, $2, $3, $4)`,
            [id, c.id, c.email, file[0]!.id]
          );
        }
        return id;
      });

      request.log.info(
        { campagneId, retenus: retenus.length, exclus: exclus.length },
        '[campagnes] mise en file'
      );

      // La cadence est annoncee : sans elle, l'administrateur croit l'envoi
      // instantane et s'inquiete de ne rien voir arriver.
      return {
        campagneId,
        misEnFile: retenus.length,
        exclus: exclus.length,
        minutesEstimees: Math.max(1, Math.ceil(retenus.length / 50) * 2),
      };
    }
  );

  /** L'historique, avec l'etat reel des envois lu dans la file. */
  app.get('/api/campagnes', async (request, reply) => {
    const session = await exigerSession(request, reply);
    if (!session) return;

    const lignes = await requete<{
      id: string;
      sujet: string;
      envoye_le: string | null;
      nb_destinataires: number;
      nb_exclus: number;
      auteur: string | null;
      envoyes: string;
      erreurs: string;
      en_attente: string;
    }>(
      `SELECT c.id, c.sujet, c.envoye_le, c.nb_destinataires, c.nb_exclus,
              nullif(trim(concat_ws(' ', p.prenom, p.nom)), '') AS auteur,
              count(q.id) FILTER (WHERE q.status = 'sent')::text    AS envoyes,
              count(q.id) FILTER (WHERE q.status = 'error')::text   AS erreurs,
              count(q.id) FILTER (WHERE q.status = 'pending')::text AS en_attente
         FROM mailing_campagnes c
         LEFT JOIN profiles p ON p.id = c.cree_par
         LEFT JOIN mailing_destinataires d ON d.campagne_id = c.id
         -- Jointure sans cle etrangere : la file est purgee au bout de 30 jours,
         -- les compteurs retombent alors a zero et seul nb_destinataires subsiste.
         LEFT JOIN email_queue q ON q.id = d.email_queue_id
        GROUP BY c.id, c.sujet, c.envoye_le, c.nb_destinataires, c.nb_exclus, p.prenom, p.nom
        ORDER BY c.created_at DESC
        LIMIT 50`
    );

    return {
      campagnes: lignes.map((l) => ({
        id: l.id,
        sujet: l.sujet,
        envoyeLe: l.envoye_le,
        auteur: l.auteur,
        destinataires: l.nb_destinataires,
        exclus: l.nb_exclus,
        envoyes: Number(l.envoyes),
        erreurs: Number(l.erreurs),
        enAttente: Number(l.en_attente),
      })),
    };
  });

  /**
   * La désinscription, publique et sans session.
   *
   * IDEMPOTENTE : un client qui reclique, ou un antivirus qui préouvre le lien,
   * doit voir la même page de confirmation, pas une erreur. Et aucun message ne
   * distingue « signature fausse » de « client inconnu » — cela n'aiderait que
   * celui qui essaie des identifiants.
   */
  app.get<{ Querystring: { c?: string; s?: string } }>(
    '/desinscription',
    async (request, reply) => {
      const { c: clientId = '', s: signature = '' } = request.query;
      const envoyer = (corps: string, code = 200): FastifyReply =>
        reply.code(code).type('text/html; charset=utf-8').send(pageHtml('Desinscription', corps));

      if (!verifierSignatureDesinscription(config.session.secret, clientId, signature)) {
        return envoyer(
          `<h1>Lien invalide</h1>
           <p>Ce lien de desinscription n'est pas valide. Il a pu etre tronque par votre
              logiciel de messagerie.</p>
           <p>Repondez simplement a notre courriel : nous vous retirerons de la liste.</p>`,
          400
        );
      }

      const client = await requeteUne<{ nom_entreprise: string | null }>(
        'UPDATE clients SET accepte_mailings = false WHERE id = $1 RETURNING nom_entreprise',
        [clientId]
      );
      if (!client) {
        return envoyer(
          `<h1>Lien invalide</h1><p>Ce lien de desinscription n'est pas valide.</p>`,
          400
        );
      }

      request.log.info({ clientId }, '[campagnes] desinscription');
      return envoyer(
        `<h1>C'est fait</h1>
         <p>${echapperHtml(client.nom_entreprise ?? 'Votre societe')} ne recevra plus nos
            informations groupees.</p>
         <p>Les courriels concernant directement votre dossier — echeances, demandes de
            pieces — continueront de vous parvenir : ils font partie de notre mission.</p>`
      );
    }
  );
}
