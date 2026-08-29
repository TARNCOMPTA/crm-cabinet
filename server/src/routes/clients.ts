/**
 * La liste des clients, paginée par la base.
 * ---------------------------------------------------------------------------
 * L'écran demandait tout le portefeuille à PostgREST puis filtrait, triait et
 * paginait en JavaScript. Mesuré sur 403 dossiers : 538 Ko de JSON à chaque
 * ouverture pour n'afficher que cinquante lignes, et un coût qui grandit
 * linéairement avec le cabinet. Une page tient dans 45 Ko.
 *
 * POURQUOI UNE ROUTE ET NON POSTGREST. Trois besoins de l'écran dépassent ce
 * que la projection PostgREST sait exprimer : trier par NOMBRE de
 * collaborateurs, exiger TOUS les collaborateurs demandés (un `in` en donnerait
 * n'importe lequel), et filtrer sur le MOIS de clôture toutes années
 * confondues. La construction de la requête vit dans `clients/requeteListe.ts`,
 * sans connexion, pour être exerçable sans base.
 *
 * ⚠️ LE MODE « ORDRE MANUEL » NE PASSE PAS PAR ICI, et c'est voulu. Il affiche
 * le portefeuille entier sans pagination — l'écran le faisait déjà ainsi — et
 * réordonne selon `user_row_orders`. Paginer un ordre que l'utilisateur pose à
 * la main n'aurait pas de sens : il continue donc de lire PostgREST.
 */

import type { FastifyInstance } from 'fastify';
import { exigerSession } from '../gardes.js';
import { requete } from '../db.js';
import {
  construireRequeteListe,
  estChampTri,
  type FiltresListe,
} from '../clients/requeteListe.js';

/**
 * Les colonnes rendues : le miroir exact de `COLONNES_LISTE` côté écran.
 *
 * ⚠️ `date_cloture` SORT EN TEXTE, ET C'EST UN CORRECTIF, PAS UN STYLE. Le
 * pilote `pg` rend une colonne `date` sous forme d'objet Date placé à MINUIT
 * LOCAL, que `JSON.stringify` réécrit ensuite en UTC. Le conteneur tourne en
 * `TZ=Europe/Paris` (Dockerfile:119, docker-compose.yml:79) : une clôture au
 * 01/06 partait donc au navigateur comme « 2026-05-31T22:00:00.000Z », et la
 * colonne « Mois de cloture » affichait MAI. Un mois de trop, sur toutes les
 * fiches dont la clôture tombe un premier du mois — c'est-à-dire toutes.
 *
 * Constaté dans un navigateur en faisant tourner le serveur au fuseau de la
 * production. La suite de bout en bout ne l'attrapait pas : elle s'exécute en
 * UTC, où l'aller-retour est neutre. Le cas est desormais couvert par
 * `date_cloture reste au bon mois quel que soit le fuseau` dans
 * `server/src/routes/clients.test.ts`.
 */
export const COLONNES =
  'c.id, c.nom_entreprise, c.dirigeant, c.numero_dossier, c.siren, c.siret, ' +
  "c.ville, c.regime_fiscal, to_char(c.date_cloture, 'YYYY-MM-DD') AS date_cloture, " +
  'c.statut, c.email, c.forme_juridique, c.contact_principal';

/** Au-delà, une « page » n'en est plus une : la borne protège la base. */
const LIMITE_MAX = 200;

/**
 * La collation employée au tri, détectée UNE FOIS.
 *
 * ⚠️ ELLE N'EST PAS SUPPOSÉE PRÉSENTE. `und-x-icu` n'existe que si PostgreSQL a
 * été bâti avec ICU ; l'employer sans vérifier ferait échouer la requête sur une
 * instance qui ne l'a pas — c'est-à-dire l'écran clients entier, pour une
 * question de tri. Sans elle, PostgreSQL trie par octets et range « avoine »
 * après « Zèbre », là où l'écran, qui emploie `localeCompare('fr')`, le met en
 * tête. Le tri diffère donc, mais l'écran fonctionne : c'est le bon compromis.
 *
 * `und-x-icu` plutôt que `fr-FR-x-icu` : la collation racine est toujours là
 * dès qu'ICU l'est, et elle reproduit `localeCompare('fr')` sur les cas
 * mesurés — accents, casse et ligatures compris.
 */
let collation: string | null | undefined;

async function collationDeTri(): Promise<string | null> {
  if (collation !== undefined) return collation;
  try {
    const lignes = await requete<{ collname: string }>(
      `SELECT collname FROM pg_collation WHERE collname = 'und-x-icu' LIMIT 1`
    );
    collation = lignes[0]?.collname ?? null;
  } catch {
    collation = null;
  }
  return collation;
}

const texte = (v: unknown, defaut: string): string =>
  typeof v === 'string' && v !== '' ? v : defaut;

const vrai = (v: unknown): boolean => v === '1' || v === 'true';

export function enregistrerRoutesClients(app: FastifyInstance): void {
  app.get<{
    Querystring: Record<string, string | undefined>;
  }>('/api/clients/liste', async (request, reply) => {
    const session = await exigerSession(request, reply);
    if (!session) return;

    const q = request.query;
    const triDemande = q.tri;
    const collaborateurs = (q.collaborateurs ?? '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);

    const filtres: FiltresListe = {
      recherche: texte(q.recherche, ''),
      statut: texte(q.statut, 'all'),
      regime: texte(q.regime, 'all'),
      // Un mois hors 01-12 est ignoré plutôt que passé à `to_char`.
      cloture: /^(0[1-9]|1[0-2])$/.test(q.cloture ?? '') ? (q.cloture as string) : 'all',
      collaborateurs,
      archives: vrai(q.archives),
      mesDossiers: vrai(q.mesDossiers),
      // ⚠️ L'UTILISATEUR VIENT DE LA SESSION, JAMAIS DE LA REQUETE : « Mes
      // dossiers » ne doit pas pouvoir désigner quelqu'un d'autre.
      utilisateurId: session.sub,
      // Le champ de tri est validé contre une liste close : c'est le seul
      // fragment qui finirait interpolé dans l'ORDER BY.
      tri: estChampTri(triDemande) ? triDemande : 'nom_entreprise',
      sens: q.sens === 'desc' ? 'desc' : 'asc',
      limite: Math.min(LIMITE_MAX, Math.max(1, Number(q.limite) || 50)),
      decalage: Math.max(0, Number(q.decalage) || 0),
    };

    const { where, ordre, valeurs } = construireRequeteListe(filtres, await collationDeTri());

    /**
     * Le total est compté À PART, et sur le même `WHERE`.
     *
     * Le rapatrier par `count(*) OVER ()` sur la page économiserait un
     * aller-retour, mais rendrait zéro ligne — donc AUCUN total — dès que la
     * page demandée dépasse la fin de la liste. Or c'est exactement ce qui
     * arrive quand un filtre réduit le portefeuille alors qu'on est page 5 :
     * la pagination disparaîtrait au lieu de ramener à la première page.
     */
    const [lignes, totaux] = await Promise.all([
      requete<Record<string, unknown>>(
        `SELECT ${COLONNES},
                COALESCE(
                  (SELECT json_agg(json_build_object(
                            'id', cc.id, 'user_id', cc.user_id, 'role', cc.role,
                            'user', json_build_object(
                              'prenom', p.prenom, 'nom', p.nom, 'avatar_color', p.avatar_color)))
                     FROM client_collaborators cc
                     LEFT JOIN profiles p ON p.id = cc.user_id
                    WHERE cc.client_id = c.id),
                  '[]'::json
                ) AS collaborators
           FROM clients c
           ${where}
           ${ordre}
          LIMIT ${filtres.limite} OFFSET ${filtres.decalage}`,
        valeurs
      ),
      requete<{ n: string }>(
        `SELECT count(*)::text AS n FROM clients c ${where}`,
        valeurs
      ),
    ]);

    return reply.send({ clients: lignes, total: Number(totaux[0]?.n ?? 0) });
  });
}
