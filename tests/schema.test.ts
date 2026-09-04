import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { prendreVerrou, rendreVerrou } from './verrou-base';

/**
 * Le schéma appliqué à un vrai PostgreSQL.
 * ---------------------------------------------------------------------------
 * Deux des quatre défauts BLOQUANTS de la mise en production vivaient ici, et
 * aucun test de la suite front ne pouvait les voir — il faut une base pour ça.
 *
 *   · `is_super_admin_for_legal_alerts()` était la seule fonction du schéma en
 *     `LANGUAGE sql`. La distinction est tout : un corps `sql` est résolu DÈS LA
 *     CRÉATION, un corps `plpgsql` ne l'est pas. Le sien lisait `auth.users`,
 *     absent hors Supabase. `psql -v ON_ERROR_STOP=1` s'arrêtait donc,
 *     `entree.sh` sortait en erreur, et le conteneur bouclait sans jamais servir
 *     une page.
 *
 *   · `company_officers.full_name` était déclarée
 *     `DEFAULT ((first_name || ' ') || last_name)`. PostgreSQL interdit toute
 *     référence de colonne dans un DEFAULT : cette ligne ne pouvait jamais
 *     s'appliquer. C'est une colonne GÉNÉRÉE, et l'outil qui a produit le
 *     fichier avait lu `pg_attrdef` sans regarder `attgenerated`.
 *
 * Deux autres invariants sont vérifiés ici parce qu'ils se sont révélés faux :
 * chaque table doit avoir une clé primaire — deux l'avaient perdue, la
 * transformation mono-cabinet ayant supprimé la contrainte au lieu de la
 * réduire — et aucune fonction ne doit référencer un schéma qui n'existe pas.
 *
 * Sans `DATABASE_URL_TEST`, la suite est ignorée plutôt qu'en échec : elle a
 * besoin d'une base jetable, que la CI fournit par un service `postgres`.
 */

const RACINE = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const URL_TEST = process.env.DATABASE_URL_TEST;

const suite = URL_TEST ? describe : describe.skip;

/**
 * Les tables attendues dans `public` : 83 metier, plus `passkeys` et
 * `enrolment_codes` que `auth-interne.sql` ajoute.
 *
 * DEUX ASSERTIONS S'EN SERVENT, et le nombre etait ecrit deux fois. L'une compte
 * `cible.sql` seul, l'autre la meme base une fois les increments rejoues : elles
 * doivent donner le MEME nombre, c'est tout leur objet. Deux litteraux a tenir
 * ensemble ne le garantissent pas — ils ont d'ailleurs derive ensemble, restes
 * a 78 quand l'OAuth du connecteur MCP (`mcp_oauth_clients`, `mcp_oauth_codes`,
 * `mcp_oauth_tokens`) et les campagnes (`mailing_campagnes`,
 * `mailing_destinataires`) ont porte le total a 83. La repartition des parts
 * (`client_associes`, increment 013) l'a porte a 85.
 *
 * Ce qu'un ecart signale, et qui reste la raison d'etre du controle : un
 * increment qui cree une table absente de `cible.sql`, donc une installation
 * neuve qui ne l'aurait jamais.
 */
const TABLES_ATTENDUES = 86;

suite('schema appliqué à PostgreSQL', () => {
  const client = new pg.Client({ connectionString: URL_TEST });
  let erreurApplication: Error | null = null;

  beforeAll(async () => {
    await client.connect();
    // Le verrou AVANT le premier geste : `tests/mcp-sql.test.ts` rase la même
    // base, et vitest lance les deux fichiers en parallèle. Voir verrou-base.ts.
    await prendreVerrou(client);
    // Base jetable : on repart d'un schéma public vide à chaque exécution, sans
    // quoi le test ne dirait rien d'une seconde application.
    await client.query('DROP SCHEMA IF EXISTS public CASCADE; CREATE SCHEMA public;');

    // ⚠️ `cible.sql` et `auth-interne.sql` SEULS, sans les increments.
    //
    // C'est le point entier de cette suite. Les increments etaient appliques ici
    // par-dessus, sur la meme base : une assertion « la colonne X existe »
    // passait alors meme que X n'etait QUE dans l'increment et absente de
    // cible.sql. Or c'est exactement le defaut a attraper — un increment non
    // reporte dans cible.sql donne une installation neuve depourvue de la
    // colonne, et pourtant marquee a jour par le registre.
    //
    // Le rejeu des increments a bien lieu, mais sur une base separee, en fin de
    // fichier : il prouve leur idempotence, pas la parite. Les deux controles
    // sont distincts et aucun ne remplace l'autre.
    const cible = readFileSync(resolve(RACINE, 'schema/cible.sql'), 'utf8');
    const auth = readFileSync(resolve(RACINE, 'schema/auth-interne.sql'), 'utf8');

    // Une transaction unique, comme `entree.sh` : ou tout passe, ou la base
    // reste intacte. Une application a moitie faite masque l'erreur d'origine
    // derriere un « relation deja existante » au redemarrage suivant.
    try {
      await client.query('BEGIN');
      await client.query(cible);
      await client.query(auth);
      await client.query('COMMIT');
    } catch (e) {
      await client.query('ROLLBACK').catch(() => {});
      erreurApplication = e as Error;
    }
  }, 120_000);

  afterAll(async () => {
    await rendreVerrou(client);
    await client.end().catch(() => {});
  });

  it("s'applique sans erreur", () => {
    expect(erreurApplication?.message ?? null).toBeNull();
  });

  it('cree bien les tables attendues', async () => {
    const { rows } = await client.query(
      `SELECT count(*)::int AS n FROM information_schema.tables
        WHERE table_schema = 'public' AND table_type = 'BASE TABLE'`
    );
    expect(rows[0].n).toBe(TABLES_ATTENDUES);
  });

  it('donne une cle primaire a chaque table', async () => {
    const { rows } = await client.query(
      `SELECT c.relname AS table_
         FROM pg_class c
         JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'public' AND c.relkind = 'r'
          AND NOT EXISTS (
            SELECT 1 FROM pg_constraint k
             WHERE k.conrelid = c.oid AND k.contype = 'p'
          )
        ORDER BY 1`
    );
    const sans = rows.map((r) => r.table_);
    expect(sans, `tables sans cle primaire : ${sans.join(', ')}`).toEqual([]);
  });

  /**
   * Toute cle primaire nommee `id` doit se fournir elle-meme.
   *
   * `profiles.id` etait la seule des 69 tables sans `DEFAULT gen_random_uuid()`.
   * Ce n'etait pas un oubli chez Supabase : la colonne referencait
   * `auth.users(id)` et c'est GoTrue qui produisait l'identifiant. Sans GoTrue,
   * plus personne ne le produit — et les deux chemins de creation de compte
   * (`enrolement --creer`, `/api/create-user`) inserent sans le fournir.
   *
   * Consequence : `install.sh` echouait a sa DERNIERE etape, celle qui cree le
   * compte administrateur. Une installation neuve rendait une instance qui
   * tourne, sans le moindre compte et sans moyen d'en creer un. Trouve le
   * 2026-08-03 par la premiere execution du job `navigateur`.
   *
   * L'invariant vise les cles nommees `id` — la convention d'une cle de
   * substitution que la base fournit. Les cles naturelles comme
   * `user_preferences.user_id`, que l'appelant renseigne, en sont exclues a
   * dessein.
   */
  /**
   * Toute cle etrangere a un index sur sa colonne SOURCE.
   *
   * PostgreSQL n'en cree pas : il indexe la cible (la cle primaire d'en face),
   * jamais la colonne qui pointe. Or c'est elle qui travaille — a chaque
   * jointure, et a chaque suppression de la ligne referencee, ou la base doit
   * verifier qu'aucune ligne ne pointe encore vers elle. Sans index, cette
   * verification lit la table entiere.
   *
   * Treize colonnes etaient dans ce cas le 2026-09-03, presque toutes des
   * `uploaded_by` / `created_by` vers `profiles` : les tables que PostgreSQL
   * relirait une par une le jour ou l'on supprime un compte. L'increment 015
   * les a couvertes ; cette garde empeche qu'il en revienne.
   */
  it('indexe la colonne source de chaque cle etrangere', async () => {
    const { rows } = await client.query(
      `SELECT c.conrelid::regclass || '.' || a.attname AS colonne
         FROM pg_constraint c
         JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = ANY (c.conkey)
         JOIN pg_namespace n ON n.oid = c.connamespace
        WHERE c.contype = 'f' AND n.nspname = 'public'
          AND NOT EXISTS (
            SELECT 1 FROM pg_index i
             WHERE i.indrelid = c.conrelid AND i.indkey[0] = a.attnum
          )
        ORDER BY 1`
    );
    const sans = rows.map((r) => r.colonne);
    expect(sans, `cles etrangeres sans index : ${sans.join(', ')}`).toEqual([]);
  });

  it('donne une valeur par defaut a chaque cle primaire nommee id', async () => {
    const { rows } = await client.query(
      `SELECT c.relname AS table_
         FROM pg_class c
         JOIN pg_namespace n ON n.oid = c.relnamespace
         JOIN pg_constraint k ON k.conrelid = c.oid AND k.contype = 'p'
         JOIN pg_attribute a ON a.attrelid = c.oid AND a.attnum = ANY (k.conkey)
        WHERE n.nspname = 'public' AND c.relkind = 'r'
          AND array_length(k.conkey, 1) = 1
          AND a.attname = 'id'
          AND NOT a.atthasdef
          AND a.attidentity = ''
        ORDER BY 1`
    );
    const sans = rows.map((r) => r.table_);
    expect(sans, `cles « id » que rien ne renseigne : ${sans.join(', ')}`).toEqual([]);
  });

  /**
   * Aucun secret en clair au schema, hors de ce qui est nomme ici.
   *
   * `cabinets.openai_api_key` a survecu a la brique IA. Le CHANGELOG 2.0
   * annoncait pourtant « la brique IA a ete retiree, la colonne avec » : la
   * colonne etait toujours la, et `cabinets` est lisible par TOUT
   * collaborateur. Une instance migree depuis une 1.x ou la cle avait ete
   * saisie l'exposait encore, alors que le journal affirmait le contraire.
   *
   * Trois colonnes restent legitimes, et seulement elles :
   *
   *   · `cabinet_smtp_config.smtp_password` — il faut le mot de passe en clair
   *     pour ouvrir la session SMTP, aucune empreinte ne s'authentifie ;
   *   · `mcp_api_keys.client_secret_hash` — hache, precisement pour n'etre pas
   *     un secret en clair ;
   *   · `mcp_oauth_clients.client_secret_hash` — hache lui aussi, arrive avec
   *     l'increment 005. Il est NUL en pratique : les clients OAuth du
   *     connecteur MCP s'enregistrent en clients PUBLICS (PKCE seul, ce qu'est
   *     claude.ai), et `/register` n'ecrit que `client_id`, `client_name` et
   *     `redirect_uris` — verifie dans `mcp-oauth.ts`. La colonne est
   *     l'emplacement prevu pour un futur client confidentiel ; le jour ou elle
   *     sera alimentee, ce devra rester une empreinte.
   *
   * Toute autre colonne au nom de secret doit etre justifiee ici, ou n'exister
   * pas. C'est la contrepartie de la promesse du produit : aucun service tiers,
   * donc aucune raison de stocker la cle d'un tiers.
   */
  it('ne garde aucun secret en clair hors des trois colonnes prevues', async () => {
    const { rows } = await client.query(
      `SELECT c.relname || '.' || a.attname AS colonne
         FROM pg_attribute a
         JOIN pg_class c ON c.oid = a.attrelid
         JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'public' AND c.relkind = 'r' AND a.attnum > 0
          AND NOT a.attisdropped
          AND a.attname ~ '(api_key|secret|token|password|passwd)'
        ORDER BY 1`
    );
    const attendues = [
      'cabinet_smtp_config.smtp_password',
      'mcp_api_keys.client_secret_hash',
      'mcp_oauth_clients.client_secret_hash',
    ];
    const inattendues = rows.map((r) => r.colonne).filter((c) => !attendues.includes(c));
    expect(inattendues, `secrets non justifies : ${inattendues.join(', ')}`).toEqual([]);
  });

  it("n'invoque aucun schema absent dans le corps des fonctions", async () => {
    // `auth`, `vault` et `net` appartenaient a Supabase. Une fonction plpgsql
    // qui les reference se cree sans broncher et n'echoue qu'a l'appel — c'est
    // ainsi que get_dashboard_stats plantait le tableau de bord.
    const { rows } = await client.query(
      `SELECT p.proname AS nom, pg_get_functiondef(p.oid) AS corps
         FROM pg_proc p
         JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'public' AND p.prokind = 'f'`
    );
    const fautives = rows
      .filter((r) => /\b(auth|vault|net)\.[a-z_]/i.test(r.corps.replace(/--[^\n]*/g, '')))
      .map((r) => r.nom);
    expect(fautives, `fonctions referencant un schema absent : ${fautives.join(', ')}`).toEqual([]);
  });

  it('declare full_name comme colonne generee, et non comme defaut', async () => {
    const { rows } = await client.query(
      `SELECT a.attgenerated::text AS genere
         FROM pg_attribute a
         JOIN pg_class c ON c.oid = a.attrelid
         JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'public' AND c.relname = 'company_officers'
          AND a.attname = 'full_name'`
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].genere).toBe('s');
  });

  it('calcule effectivement full_name', async () => {
    // La preuve par l'usage : le type ne suffit pas, la valeur doit sortir.
    await client.query(
      `INSERT INTO company_officers (first_name, last_name) VALUES ('JEAN', 'DUPONT')`
    );
    const { rows } = await client.query(
      `SELECT full_name FROM company_officers WHERE last_name = 'DUPONT'`
    );
    expect(rows[0].full_name).toBe('JEAN DUPONT');
  });

  it('cree le role authenticated sans lui ouvrir les tables d authentification', async () => {
    const { rows: role } = await client.query(
      `SELECT 1 FROM pg_roles WHERE rolname = 'authenticated'`
    );
    expect(role, "le role authenticated est absent : PostgREST ne pourra pas SET ROLE").toHaveLength(1);

    // `passkeys` et `enrolment_codes` ne doivent JAMAIS etre exposees par
    // PostgREST : un code d'enrolement lisible vaut une identite.
    for (const table of ['passkeys', 'enrolment_codes']) {
      const { rows } = await client.query(
        `SELECT has_table_privilege('authenticated', $1, 'SELECT') AS lisible`,
        [table]
      );
      expect(rows[0].lisible, `${table} est lisible par authenticated`).toBe(false);
    }
  });

  /**
   * Le registre des increments vit HORS de `public`, et il faut le verifier
   * explicitement : les invariants ci-dessus filtrent tous `nspname='public'`,
   * donc aucun ne le voit.
   *
   * Ce qui est en jeu : `auth-interne.sql` porte un ALTER DEFAULT PRIVILEGES qui
   * accorde SELECT/INSERT/UPDATE/DELETE a `authenticated` sur toute table creee
   * ensuite dans `public`. Un registre place la serait modifiable depuis le
   * navigateur — et effacer une ligne suffit a faire rejouer une migration, donc
   * a rejouer un backfill sur des donnees deja corrigees a la main.
   */
  it('tient le registre des increments hors de public et hors de portee', async () => {
    const { rows: existe } = await client.query(
      `SELECT to_regclass('crm_meta.schema_migrations') IS NOT NULL AS la`
    );
    expect(existe[0].la, 'crm_meta.schema_migrations absente de cible.sql').toBe(true);

    const { rows: pk } = await client.query(
      `SELECT 1 FROM pg_constraint k
         JOIN pg_class c ON c.oid = k.conrelid
         JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'crm_meta' AND c.relname = 'schema_migrations'
          AND k.contype = 'p'`
    );
    expect(pk, 'le registre n a pas de cle primaire : un increment pourrait etre marque deux fois').toHaveLength(1);

    const { rows: droits } = await client.query(
      `SELECT has_table_privilege('authenticated', 'crm_meta.schema_migrations', 'SELECT') AS lisible,
              has_schema_privilege('authenticated', 'crm_meta', 'USAGE') AS entrable`
    );
    expect(droits[0].entrable, 'authenticated peut entrer dans crm_meta').toBe(false);
    expect(droits[0].lisible, 'le registre est lisible par authenticated').toBe(false);
  });

  /**
   * Le compte de tables ne bouge pas quand on ajoute le registre : il ne compte
   * que `public`. Si ce test tombe apres avoir ajoute une table de meta, c'est
   * qu'elle a atterri dans le mauvais schema — un CREATE TABLE non qualifie.
   */
  it('ne compte pas le registre parmi les tables du produit', async () => {
    const { rows } = await client.query(
      `SELECT count(*)::int AS n FROM information_schema.tables
        WHERE table_schema = 'crm_meta' AND table_type = 'BASE TABLE'`
    );
    expect(rows[0].n).toBeGreaterThanOrEqual(1);
  });

  /**
   * ⚠️ AUCUNE COLONNE DE `clients` NE DOIT ETRE GENEREE.
   *
   * Miroir inverse du test `full_name` juste au-dessus, et la contrainte la plus
   * dure de tout le dossier « fiche client » : `ClientDetail.tsx` fait
   * `update(formData)` avec le Row COMPLET. Une colonne generee ferait echouer
   * CHAQUE enregistrement de fiche avec 428C9 — « cannot insert a non-DEFAULT
   * value into column ». C'est pour cela que `adresse` et `nom_entreprise` sont
   * recomposees par declencheur et non calculees par la base.
   */
  it('ne genere aucune colonne de clients', async () => {
    const { rows } = await client.query(
      `SELECT a.attname AS colonne
         FROM pg_attribute a
         JOIN pg_class c ON c.oid = a.attrelid
         JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'public' AND c.relname = 'clients'
          AND a.attnum > 0 AND NOT a.attisdropped
          AND a.attgenerated <> ''
        ORDER BY 1`
    );
    const generees = rows.map((r) => r.colonne);
    expect(
      generees,
      `colonnes generees sur clients : ${generees.join(', ')} — chaque enregistrement de fiche echouera en 428C9`
    ).toEqual([]);
  });

  /**
   * ⭐ LE TEST QUI REPRODUIT `ClientDetail.tsx` : l'enregistrement d'une fiche
   * renvoie TOUTES les colonnes du Row, y compris celles que la base possede.
   *
   * La liste est construite depuis `information_schema`, donc elle reste a jour
   * toute seule : une colonne ajoutee demain est couverte sans toucher au test.
   * C'est le seul test qui aurait attrape le piege de la colonne generee, et
   * c'est aussi lui qui verifie que les declencheurs ne reecrivent RIEN quand
   * rien n'a change — sans quoi chaque ouverture-fermeture de fiche modifierait
   * l'adresse.
   */
  it('supporte l enregistrement d une fiche avec toutes ses colonnes', async () => {
    await client.query(
      `INSERT INTO clients (nom_entreprise, adresse, adresse_ligne1, code_postal, ville, siren)
       VALUES ('ZZ REJEU UPDATE', '1 RUE DU TEST, 81000 ALBI', '1 RUE DU TEST', '81000', 'ALBI', '303265045')`
    );

    const { rows: colonnes } = await client.query(
      `SELECT a.attname AS nom
         FROM pg_attribute a
         JOIN pg_class c ON c.oid = a.attrelid
         JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'public' AND c.relname = 'clients'
          AND a.attnum > 0 AND NOT a.attisdropped AND a.attgenerated = ''
        ORDER BY a.attnum`
    );
    const affectations = colonnes.map((c) => `"${c.nom}" = "${c.nom}"`).join(', ');

    const { rows: avant } = await client.query(
      `SELECT adresse, nom_entreprise, tva_intracom FROM clients WHERE nom_entreprise = 'ZZ REJEU UPDATE'`
    );

    await client.query(
      `UPDATE clients SET ${affectations} WHERE nom_entreprise = 'ZZ REJEU UPDATE'`
    );

    const { rows: apres } = await client.query(
      `SELECT adresse, nom_entreprise, tva_intracom FROM clients WHERE nom_entreprise = 'ZZ REJEU UPDATE'`
    );
    expect(apres[0].adresse, 'l adresse a bouge sur un enregistrement sans changement').toBe(
      avant[0].adresse
    );
    expect(apres[0].nom_entreprise).toBe(avant[0].nom_entreprise);
    expect(apres[0].tva_intracom).toBe(avant[0].tva_intracom);
  });

  /**
   * Recomposition du libelle. Le deuxieme cas est LE test de la tranche :
   * `nom_entreprise` est NOT NULL, et un client bascule en `physique` avec nom
   * et prenom encore vides doit garder son libelle. Sans la garde
   * « composition non vide », l'enregistrement echouerait sur la contrainte.
   */
  it('recompose nom_entreprise en « NOM Prenom » pour une personne physique', async () => {
    await client.query(
      `INSERT INTO clients (nom_entreprise, type_personne, nom, prenom)
       VALUES ('ZZ IGNORE', 'physique', 'DUPONT', 'Jean')`
    );
    const { rows } = await client.query(
      `SELECT nom_entreprise FROM clients WHERE nom = 'DUPONT' AND prenom = 'Jean'`
    );
    expect(rows[0].nom_entreprise).toBe('DUPONT Jean');
  });

  it('laisse nom_entreprise intact quand nom et prenom sont vides', async () => {
    await client.query(
      `INSERT INTO clients (nom_entreprise, type_personne) VALUES ('ZZ SANS NOM', 'physique')`
    );
    const { rows } = await client.query(
      `SELECT nom_entreprise FROM clients WHERE nom_entreprise = 'ZZ SANS NOM'`
    );
    expect(rows, 'le libelle a ete ecrase par une composition vide').toHaveLength(1);
  });

  it('ne recompose pas nom_entreprise pour une personne morale', async () => {
    await client.query(
      `INSERT INTO clients (nom_entreprise, type_personne, nom, prenom)
       VALUES ('ZZ SARL MARTIN', 'morale', 'MARTIN', 'Paul')`
    );
    const { rows } = await client.query(
      `SELECT nom_entreprise FROM clients WHERE nom = 'MARTIN' AND prenom = 'Paul'`
    );
    expect(rows[0].nom_entreprise).toBe('ZZ SARL MARTIN');
  });

  it('suit un changement de prenom sur une personne physique', async () => {
    await client.query(
      `INSERT INTO clients (nom_entreprise, type_personne, nom, prenom)
       VALUES ('ZZ SUIVI', 'physique', 'BERNARD', 'Luc')`
    );
    await client.query(`UPDATE clients SET prenom = 'Lucien' WHERE nom = 'BERNARD'`);
    const { rows } = await client.query(
      `SELECT nom_entreprise FROM clients WHERE nom = 'BERNARD'`
    );
    expect(rows[0].nom_entreprise).toBe('BERNARD Lucien');
  });

  /**
   * Recomposition de l'adresse. Les trois cas figent les trois arbitrages, et
   * le deuxieme est celui qui protege une saisie : ecraser un texte saisi a la
   * main n'est pas rattrapable, alors qu'un composant perime se voit.
   */
  it('compose adresse depuis les composants, sans « France »', async () => {
    await client.query(
      `INSERT INTO clients (nom_entreprise, adresse_ligne1, code_postal, ville, pays)
       VALUES ('ZZ COMPOSE', '3 RUE HAUTE', '81120', 'VILLENEUVE', 'France')`
    );
    const { rows } = await client.query(
      `SELECT adresse FROM clients WHERE nom_entreprise = 'ZZ COMPOSE'`
    );
    expect(rows[0].adresse).toBe('3 RUE HAUTE, 81120 VILLENEUVE');
  });

  it('conserve une adresse saisie a la main quand les composants ne changent pas', async () => {
    await client.query(
      `INSERT INTO clients (nom_entreprise, adresse_ligne1, code_postal, ville)
       VALUES ('ZZ SAISIE', '5 RUE BASSE', '81000', 'ALBI')`
    );
    await client.query(
      `UPDATE clients SET adresse = 'saisie a la main' WHERE nom_entreprise = 'ZZ SAISIE'`
    );
    const { rows } = await client.query(
      `SELECT adresse FROM clients WHERE nom_entreprise = 'ZZ SAISIE'`
    );
    expect(rows[0].adresse, 'la saisie manuelle a ete ecrasee par le declencheur').toBe(
      'saisie a la main'
    );
  });

  it('recompose adresse des qu un composant change', async () => {
    await client.query(
      `INSERT INTO clients (nom_entreprise, adresse_ligne1, code_postal, ville)
       VALUES ('ZZ MAJ VILLE', '7 RUE LONGUE', '31000', 'TOULOUSE')`
    );
    await client.query(`UPDATE clients SET ville = 'BLAGNAC' WHERE nom_entreprise = 'ZZ MAJ VILLE'`);
    const { rows } = await client.query(
      `SELECT adresse FROM clients WHERE nom_entreprise = 'ZZ MAJ VILLE'`
    );
    expect(rows[0].adresse).toBe('7 RUE LONGUE, 31000 BLAGNAC');
  });

  it('ajoute le pays au texte seulement s il n est pas la France', async () => {
    await client.query(
      `INSERT INTO clients (nom_entreprise, adresse_ligne1, code_postal, ville, pays)
       VALUES ('ZZ PORTUGAL', 'RUA AUGUSTA 10', '1100', 'LISBOA', 'Portugal')`
    );
    const { rows } = await client.query(
      `SELECT adresse FROM clients WHERE nom_entreprise = 'ZZ PORTUGAL'`
    );
    expect(rows[0].adresse).toBe('RUA AUGUSTA 10, 1100 LISBOA, Portugal');
  });

  /** Les deux numeros d'or, verifies contre VIES le 2026-08-03. */
  it('calcule la cle du numero de TVA francais', async () => {
    const { rows } = await client.query(
      `SELECT crm_meta.numero_tva_fr('303265045') AS a,
              crm_meta.numero_tva_fr('732829320') AS b,
              crm_meta.numero_tva_fr('12345') AS court`
    );
    expect(rows[0].a).toBe('FR40303265045');
    expect(rows[0].b).toBe('FR44732829320');
    expect(rows[0].court, 'un SIREN incomplet ne doit pas produire de numero').toBeNull();
  });

  /**
   * L'ORDRE DES DECLENCHEURS, figee par l'usage : PostgreSQL les declenche par
   * ordre alphabetique de nom, et « ca… » < « cl… ». Inserer un SIRET sans SIREN
   * ne remplit `tva_intracom` que si `calculate_siren_trigger` a deja derive le
   * SIREN. Renommer l'un des deux casserait ce cas en silence.
   */
  it('calcule la TVA depuis un SIRET seul, sans SIREN fourni', async () => {
    await client.query(
      `INSERT INTO clients (nom_entreprise, siret) VALUES ('ZZ SIRET SEUL', '30326504500017')`
    );
    const { rows } = await client.query(
      `SELECT siren, tva_intracom FROM clients WHERE nom_entreprise = 'ZZ SIRET SEUL'`
    );
    expect(rows[0].siren).toBe('303265045');
    expect(rows[0].tva_intracom, "l'ordre des declencheurs a change").toBe('FR40303265045');
  });

  it('ne remplace pas un numero de TVA saisi a la main', async () => {
    await client.query(
      `INSERT INTO clients (nom_entreprise, siren, tva_intracom)
       VALUES ('ZZ TVA MANUELLE', '303265045', 'FR99999999999')`
    );
    const { rows: pose } = await client.query(
      `SELECT tva_intracom, tva_intracom_source FROM clients WHERE nom_entreprise = 'ZZ TVA MANUELLE'`
    );
    expect(pose[0].tva_intracom).toBe('FR99999999999');
    expect(pose[0].tva_intracom_source).toBe('manuel');

    // Un changement de SIREN ne defait pas la surcharge.
    await client.query(
      `UPDATE clients SET siren = '732829320' WHERE nom_entreprise = 'ZZ TVA MANUELLE'`
    );
    const { rows: apres } = await client.query(
      `SELECT tva_intracom FROM clients WHERE nom_entreprise = 'ZZ TVA MANUELLE'`
    );
    expect(apres[0].tva_intracom).toBe('FR99999999999');

    // Effacer le numero rend la main au calcul, sinon la fiche resterait vide a
    // vie apres une saisie annulee.
    await client.query(
      `UPDATE clients SET tva_intracom = NULL WHERE nom_entreprise = 'ZZ TVA MANUELLE'`
    );
    const { rows: efface } = await client.query(
      `SELECT tva_intracom, tva_intracom_source FROM clients WHERE nom_entreprise = 'ZZ TVA MANUELLE'`
    );
    expect(efface[0].tva_intracom_source).toBe('calcule');
    expect(efface[0].tva_intracom).toBe('FR44732829320');
  });

  it('normalise un numero saisi avec des espaces', async () => {
    await client.query(
      `INSERT INTO clients (nom_entreprise, tva_intracom) VALUES ('ZZ TVA ESPACES', 'fr 40 303 265 045')`
    );
    const { rows } = await client.query(
      `SELECT tva_intracom FROM clients WHERE nom_entreprise = 'ZZ TVA ESPACES'`
    );
    expect(rows[0].tva_intracom).toBe('FR40303265045');
  });

  /**
   * L'INTERACTION QUI CASSERA AU PREMIER REMANIEMENT : la route VIES n'ecrit que
   * les `tva_verif_*`, sans toucher au numero. Le declencheur remet ces colonnes
   * a zero quand le NUMERO change — il ne doit donc pas defaire un verdict qui
   * vient d'etre ecrit.
   */
  it('laisse la verification VIES en place quand le numero ne change pas', async () => {
    await client.query(
      `INSERT INTO clients (nom_entreprise, siren) VALUES ('ZZ VIES', '303265045')`
    );
    await client.query(
      `UPDATE clients SET tva_verif_statut = 'valide', tva_verif_le = now(),
                          tva_verif_code = 'VALID', tva_verif_nom = 'SA SODIMAS'
        WHERE nom_entreprise = 'ZZ VIES'`
    );
    const { rows } = await client.query(
      `SELECT tva_verif_statut, tva_verif_nom FROM clients WHERE nom_entreprise = 'ZZ VIES'`
    );
    expect(rows[0].tva_verif_statut, 'le declencheur a defait la verification VIES').toBe('valide');
    expect(rows[0].tva_verif_nom).toBe('SA SODIMAS');
  });

  it('remet la verification a zero quand le numero change', async () => {
    await client.query(
      `INSERT INTO clients (nom_entreprise, siren, tva_verif_statut)
       VALUES ('ZZ VIES PERIME', '303265045', 'valide')`
    );
    await client.query(
      `UPDATE clients SET tva_intracom = 'FR12345678901' WHERE nom_entreprise = 'ZZ VIES PERIME'`
    );
    const { rows } = await client.query(
      `SELECT tva_verif_statut FROM clients WHERE nom_entreprise = 'ZZ VIES PERIME'`
    );
    expect(rows[0].tva_verif_statut).toBe('non_verifie');
  });

  /**
   * LE CONTRAT DE PARITE, nomme explicitement pour que personne ne l'oublie.
   *
   * Tous les tests ci-dessus tournent sur `cible.sql` SEUL. Ils prouvent donc
   * que le DDL de `schema/increments/002` y a bien ete reporte — c'est la seule
   * garantie contre le defaut silencieux du registre : un increment oublie dans
   * `cible.sql` donne une installation neuve depourvue des colonnes, et pourtant
   * marquee a jour.
   */
  it('porte le contrat complet de l increment 002', async () => {
    const { rows: cols } = await client.query(
      `SELECT count(*)::int AS n FROM information_schema.columns
        WHERE table_name = 'clients' AND column_name = ANY ($1)`,
      [
        [
          'type_personne', 'civilite', 'nom', 'prenom', 'prenoms',
          'adresse_ligne1', 'adresse_complement', 'code_postal', 'ville', 'pays', 'code_insee',
          'tva_intracom', 'tva_intracom_source', 'tva_verif_statut', 'tva_verif_le',
          'tva_verif_code', 'tva_verif_nom', 'tva_verif_adresse',
          'etat_administratif', 'date_radiation', 'nom_commercial',
          'date_immatriculation', 'greffe',
        ],
      ]
    );
    expect(cols[0].n, 'des colonnes de l increment 002 manquent a cible.sql').toBe(23);

    const { rows: trg } = await client.query(
      `SELECT tgname FROM pg_trigger
        WHERE tgrelid = 'public.clients'::regclass AND NOT tgisinternal
          AND tgname LIKE 'clients_%'
        ORDER BY tgname`
    );
    expect(trg.map((t) => t.tgname)).toEqual([
      'clients_adresse_trigger',
      'clients_nom_entreprise_trigger',
      'clients_tva_intracom_trigger',
    ]);

    const { rows: fn } = await client.query(
      `SELECT proname FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'crm_meta' ORDER BY 1`
    );
    expect(fn.map((f) => f.proname)).toEqual(['est_entrepreneur_individuel', 'numero_tva_fr']);
  });

  /**
   * Le contrat de l'increment 010 : le courriel de notification n'est plus
   * injectable.
   *
   * Sur `cible.sql` SEUL, comme les deux precedents : trouver l'echappement ici
   * prouve qu'il y a bien ete reporte. Une installation neuve depourvue du
   * correctif serait pourtant marquee a jour par le registre, donc jamais
   * rattrapee — et enverrait des courriels injectables pour toujours.
   */
  it('porte le contrat complet de l increment 010', async () => {
    // Le titre et le message sont du TEXTE : le balisage doit ressortir inerte.
    const { rows: ech } = await client.query(
      `SELECT build_notification_email_html(
                'task_assigned', '<img src=x onerror=alert(1)>',
                '<script>alert(1)</script>', NULL) AS h`
    );
    expect(ech[0].h, 'le titre est injecte tel quel dans le courriel').not.toContain(
      '<img src=x'
    );
    expect(ech[0].h, 'le message est injecte tel quel').not.toContain('<script>');

    // Un guillemet dans le lien ne doit pas sortir de l'attribut href.
    const { rows: attr } = await client.query(
      `SELECT build_notification_email_html('t', 't', 'm', '/a" onmouseover="x') AS h`
    );
    expect(attr[0].h).not.toContain('" onmouseover=');

    // Echapper ne suffit pas pour un href : les schemas vivants sont refuses,
    // le bouton disparait plutot que de conduire ailleurs.
    for (const lien of ['javascript:alert(1)', '//evil.tld/x', 'data:text/html,x']) {
      const { rows } = await client.query(
        `SELECT build_notification_email_html('t', 't', 'm', $1) AS h`,
        [lien]
      );
      expect(rows[0].h, `lien accepte : ${lien}`).not.toContain('Voir le detail');
    }

    // ⚠️ ET LES NOTIFICATIONS REELLES CONTINUENT DE POSER LEUR BOUTON : elles
    // emploient un chemin RELATIF (« /tasks?id=... »). Une restriction aux seuls
    // http(s) aurait retire le bouton de tous les courriels du produit.
    const { rows: relatif } = await client.query(
      `SELECT build_notification_email_html('task_assigned', 'T', 'M', '/tasks?id=abc') AS h`
    );
    expect(relatif[0].h, 'le lien relatif des vraies notifications a saute').toContain(
      'href="/tasks?id=abc"'
    );
  });

  /**
   * Meme contrat de parite, pour l'increment 009.
   *
   * Cette suite tourne sur `cible.sql` SEUL : trouver la colonne ici prouve que
   * le DDL de l'increment y a bien ete reporte. Sans cela, une installation
   * neuve ne l'aurait pas — et serait pourtant marquee a jour par le registre,
   * donc jamais rattrapee. Le suivi des echeances repondrait alors en erreur SQL
   * sur son `SELECT ... tva_jour_echeance`, pour toute la page.
   */
  it('porte le contrat complet de l increment 009', async () => {
    const { rows } = await client.query(
      `SELECT is_nullable FROM information_schema.columns
        WHERE table_name = 'clients' AND column_name = 'tva_jour_echeance'`
    );
    expect(rows, 'clients.tva_jour_echeance manque a cible.sql').toHaveLength(1);
    // Nullable, et c'est le sens meme de la colonne : NULL veut dire « applique
    // la regle CA3 », et non « pas encore calcule ».
    expect(rows[0].is_nullable).toBe('YES');

    // La borne est le calendrier civil, et non les quatre jours du calendrier
    // CA3 : la surcharge existe precisement pour les cas que la regle ne couvre
    // pas, et la brider a {16,19,21,24} lui retirerait sa raison d'etre.
    await client.query(
      `INSERT INTO clients (nom_entreprise, tva_jour_echeance) VALUES ('ZZ ECHEANCE', 24)`
    );
    await expect(
      client.query(
        `INSERT INTO clients (nom_entreprise, tva_jour_echeance) VALUES ('ZZ ECHEANCE HORS', 32)`
      )
    ).rejects.toThrow(/clients_tva_jour_echeance_check/);
  });

  /**
   * Meme contrat de parite, pour l'increment 012.
   *
   * Une colonne oubliee dans `cible.sql` serait ici particulierement sournoise.
   * `ClientDetail` envoie un patch des champs MODIFIES : sur une installation
   * neuve depourvue de la colonne, la fiche s'afficherait normalement et ne
   * casserait qu'au moment ou quelqu'un remplit la seconde adresse — un
   * PGRST204 « column not found » sur l'enregistrement, donc la perte de TOUTES
   * les modifications saisies en meme temps, pas seulement de l'adresse.
   */
  it('porte le contrat complet de l increment 012', async () => {
    const { rows } = await client.query(
      `SELECT data_type, is_nullable, column_default FROM information_schema.columns
        WHERE table_name = 'clients' AND column_name = 'email_2'`
    );
    expect(rows, 'clients.email_2 manque a cible.sql').toHaveLength(1);
    expect(rows[0].data_type).toBe('text');
    expect(rows[0].is_nullable).toBe('YES');
    // Sans defaut, comme `email` : une fiche sans seconde adresse n'en a pas,
    // et une chaine vide se distinguerait mal d'une saisie effacee.
    expect(rows[0].column_default).toBeNull();

    // Le point de la colonne : elle accepte ce que `email` accepte, sans CHECK
    // de format qui refuserait a la seconde ce que la premiere prend.
    await client.query(
      `INSERT INTO clients (nom_entreprise, email, email_2)
       VALUES ('ZZ DEUX ADRESSES', 'direction@exemple.fr', 'compta@exemple.fr')`
    );
    const { rows: relu } = await client.query(
      `SELECT email_2 FROM clients WHERE nom_entreprise = 'ZZ DEUX ADRESSES'`
    );
    expect(relu[0].email_2).toBe('compta@exemple.fr');
  });

  /**
   * Meme contrat de parite, pour l'increment 013 — la repartition des parts.
   *
   * Ici la parite ne porte plus sur une colonne mais sur une TABLE ENTIERE, et
   * l'oubli serait franc : sur une installation neuve, l'onglet « Parts » de la
   * fiche client repondrait PGRST205 des l'ouverture.
   *
   * ⚠️ CHAQUE GARDE EST PROUVEE EN LA FAISANT ECHOUER, et non en constatant que
   * l'insertion nominale passe. Une contrainte reportee dans `cible.sql` sous un
   * nom different, ou perdue en route, laisserait passer tous les tests ecrits a
   * l'endroit — et la base accepterait alors une detention a zero part ou deux
   * lignes pour le meme associe. C'est exactement ce que ces `rejects` couvrent.
   */
  it('porte le contrat complet de l increment 013', async () => {
    // ---- La colonne de la fiche, denominateur des pourcentages -------------
    const { rows: totalCol } = await client.query(
      `SELECT data_type, is_nullable, column_default FROM information_schema.columns
        WHERE table_name = 'clients' AND column_name = 'parts_totales'`
    );
    expect(totalCol, 'clients.parts_totales manque a cible.sql').toHaveLength(1);
    expect(totalCol[0].data_type).toBe('numeric');
    // Nullable et sans defaut : un `0` par defaut mentirait, en ayant l'air
    // d'une saisie tout en rendant toute division impossible.
    expect(totalCol[0].is_nullable).toBe('YES');
    expect(totalCol[0].column_default).toBeNull();

    // ---- La table ----------------------------------------------------------
    const { rows: colonnes } = await client.query(
      `SELECT column_name, data_type, is_nullable, column_default
         FROM information_schema.columns
        WHERE table_name = 'client_associes' ORDER BY column_name`
    );
    // La liste est EXACTE et non « contient » : elle attrape aussi bien une
    // colonne perdue qu'une colonne ajoutee a l'increment sans etre reportee
    // dans `cible.sql`. Elle grandit donc a chaque increment qui touche la
    // table — `source` vient de l'increment 014.
    expect(
      colonnes.map((c) => c.column_name),
      'client_associes manque a cible.sql'
    ).toEqual([
      'acte_source', 'client_id', 'created_at', 'date_effet', 'demembrement',
      'id', 'legal_act_id', 'nb_parts', 'notes', 'officer_id', 'source',
      'updated_at',
    ]);

    const parColonne = Object.fromEntries(colonnes.map((c) => [c.column_name, c]));
    expect(parColonne.nb_parts.is_nullable).toBe('NO');
    expect(parColonne.demembrement.is_nullable).toBe('NO');
    expect(parColonne.demembrement.column_default).toContain('pleine-propriete');
    // `date_effet` reste nullable : une reprise de portefeuille connait souvent
    // la detention sans la date, et une date inventee ne se voit pas.
    expect(parColonne.date_effet.is_nullable).toBe('YES');

    // ---- Le jeu d'essai ----------------------------------------------------
    const { rows: sci } = await client.query(
      `INSERT INTO clients (nom_entreprise, capital_social, parts_totales)
       VALUES ('ZZ SCI DES PARTS', 10000, 1000) RETURNING id`
    );
    const { rows: pers } = await client.query(
      `INSERT INTO company_officers (first_name, last_name)
       VALUES ('ZZCLAUDE', 'ZZDURAND') RETURNING id`
    );
    const clientId = sci[0].id as string;
    const officerId = pers[0].id as string;

    await client.query(
      `INSERT INTO client_associes (client_id, officer_id, nb_parts, date_effet)
       VALUES ($1, $2, 250, '2019-03-12')`,
      [clientId, officerId]
    );

    // ---- Ce que la base doit REFUSER ---------------------------------------

    // Une detention nulle est une ligne a supprimer, pas une ligne a zero.
    await expect(
      client.query(
        `INSERT INTO client_associes (client_id, officer_id, nb_parts, demembrement)
         VALUES ($1, $2, 0, 'usufruit')`,
        [clientId, officerId]
      )
    ).rejects.toThrow(/client_associes_nb_parts_check/);

    // Deux lignes pour le meme associe dans le meme demembrement : la somme des
    // parts deviendrait fausse sans que rien ne le signale.
    await expect(
      client.query(
        `INSERT INTO client_associes (client_id, officer_id, nb_parts)
         VALUES ($1, $2, 10)`,
        [clientId, officerId]
      )
    ).rejects.toThrow(/client_associes_client_officer_demembrement_key/);

    // Un demembrement hors des trois formes reconnues : une attestation qui
    // annoncerait une qualite inventee serait fausse, pas imprecise.
    await expect(
      client.query(
        `INSERT INTO client_associes (client_id, officer_id, nb_parts, demembrement)
         VALUES ($1, $2, 10, 'usufruit-partiel')`,
        [clientId, officerId]
      )
    ).rejects.toThrow(/client_associes_demembrement_check/);

    // ---- Ce que la base doit ACCEPTER --------------------------------------

    // La MEME personne, en nue-propriete : c'est le cas ordinaire d'une SCI
    // familiale apres donation, et c'est la raison d'etre du troisieme membre
    // de la cle d'unicite.
    await client.query(
      `INSERT INTO client_associes (client_id, officer_id, nb_parts, demembrement)
       VALUES ($1, $2, 100, 'nue-propriete')`,
      [clientId, officerId]
    );

    // ---- Le declencheur updated_at -----------------------------------------
    await client.query(
      `UPDATE client_associes SET nb_parts = 300
        WHERE client_id = $1 AND demembrement = 'pleine-propriete'`,
      [clientId]
    );
    const { rows: bouge } = await client.query(
      `SELECT (updated_at > created_at) AS bouge FROM client_associes
        WHERE client_id = $1 AND demembrement = 'pleine-propriete'`,
      [clientId]
    );
    expect(bouge[0].bouge, 'le declencheur updated_at manque').toBe(true);

    // ---- La cascade --------------------------------------------------------
    // Sans elle, supprimer un client laisserait des detentions rattachees a
    // personne, et le total de parts du cabinet ne voudrait plus rien dire.
    await client.query('DELETE FROM clients WHERE id = $1', [clientId]);
    const { rows: reste } = await client.query(
      'SELECT count(*)::int AS n FROM client_associes WHERE client_id = $1',
      [clientId]
    );
    expect(reste[0].n).toBe(0);

    await client.query('DELETE FROM company_officers WHERE id = $1', [officerId]);
  });

  /**
   * Le contrat de l'increment 014 : d'ou vient une ligne, et qui a le droit
   * d'en poser.
   *
   * ⚠️ LES DEUX COLONNES ONT LE MEME OBJET — EMPECHER UN ELARGISSEMENT
   * SILENCIEUX — et leur DEFAUT est ce qui le porte. Un `source` par defaut a
   * `statuts` deprecierait du travail humain deja saisi ; un `peut_ecrire` par
   * defaut a `true` donnerait l'ecriture a toute cle deja emise, du seul fait
   * qu'on a deploye une version. C'est exactement l'effet de bord contre lequel
   * le connecteur se premunit, et c'est pour cela que les defauts sont testes
   * ici plutot que constates a la lecture.
   */
  it('porte le contrat complet de l increment 014', async () => {
    // ---- L'origine d'une ligne de repartition ------------------------------
    const { rows: src } = await client.query(
      `SELECT data_type, is_nullable, column_default FROM information_schema.columns
        WHERE table_name = 'client_associes' AND column_name = 'source'`
    );
    expect(src, 'client_associes.source manque a cible.sql').toHaveLength(1);
    expect(src[0].data_type).toBe('text');
    expect(src[0].is_nullable).toBe('NO');
    expect(src[0].column_default).toContain('manual');

    const { rows: sci } = await client.query(
      `INSERT INTO clients (nom_entreprise, parts_totales)
       VALUES ('ZZ SCI ORIGINE', 1000) RETURNING id`
    );
    const { rows: pers } = await client.query(
      `INSERT INTO company_officers (first_name, last_name)
       VALUES ('ZZANNE', 'ZZORIGINE') RETURNING id`
    );
    const clientId = sci[0].id as string;
    const officerId = pers[0].id as string;

    // Le defaut, sur une insertion qui ne dit rien : une ligne posee sans
    // preciser son origine est reputee saisie par le cabinet.
    await client.query(
      `INSERT INTO client_associes (client_id, officer_id, nb_parts)
       VALUES ($1, $2, 600)`,
      [clientId, officerId]
    );
    const { rows: pose } = await client.query(
      'SELECT source FROM client_associes WHERE client_id = $1',
      [clientId]
    );
    expect(pose[0].source).toBe('manual');

    // `statuts` est accepte : c'est l'autre moitie du contrat.
    await client.query(
      `INSERT INTO client_associes (client_id, officer_id, nb_parts, demembrement, source)
       VALUES ($1, $2, 400, 'nue-propriete', 'statuts')`,
      [clientId, officerId]
    );

    // Et rien d'autre ne l'est. Une provenance inventee — `inpi`, `import`,
    // n'importe quoi — ferait perdre son sens a la distinction.
    await expect(
      client.query(
        `INSERT INTO client_associes (client_id, officer_id, nb_parts, demembrement, source)
         VALUES ($1, $2, 10, 'usufruit', 'inpi')`,
        [clientId, officerId]
      )
    ).rejects.toThrow(/client_associes_source_check/);

    await client.query('DELETE FROM clients WHERE id = $1', [clientId]);
    await client.query('DELETE FROM company_officers WHERE id = $1', [officerId]);

    // ---- Le droit d'ecrire d'une cle MCP -----------------------------------
    const { rows: droit } = await client.query(
      `SELECT data_type, is_nullable, column_default FROM information_schema.columns
        WHERE table_name = 'mcp_api_keys' AND column_name = 'peut_ecrire'`
    );
    expect(droit, 'mcp_api_keys.peut_ecrire manque a cible.sql').toHaveLength(1);
    expect(droit[0].data_type).toBe('boolean');
    expect(droit[0].is_nullable).toBe('NO');
    expect(droit[0].column_default).toContain('false');

    // ⭐ LA GARDE QUI COMPTE. Une cle creee comme le fait `mcp-cles.ts`, sans
    // mentionner ce droit, ne doit PAS pouvoir ecrire. C'est ce qui garantit
    // que le deploiement de cette version ne donne l'ecriture a personne.
    await client.query(
      `INSERT INTO mcp_api_keys (name, client_id, client_secret_hash)
       VALUES ('ZZ cle de recette', 'zz_cle_recette', 'hache-sans-valeur')`
    );
    const { rows: cle } = await client.query(
      `SELECT peut_ecrire FROM mcp_api_keys WHERE client_id = 'zz_cle_recette'`
    );
    expect(cle[0].peut_ecrire, 'une cle neuve ne doit pas pouvoir ecrire').toBe(false);
    await client.query(`DELETE FROM mcp_api_keys WHERE client_id = 'zz_cle_recette'`);

    // ---- Le remplacement transactionnel ------------------------------------
    //
    // ⚠️ ELLE EXISTE POUR QU'UN IMPORT NE PUISSE PAS VIDER UNE FICHE. Deux
    // appels PostgREST — DELETE puis INSERT — font deux transactions : la
    // seconde qui echoue laisse le client sans aucun associe, et la fiche a
    // l'air d'une repartition simplement incomplete.
    const { rows: fn } = await client.query(
      `SELECT prosecdef FROM pg_proc WHERE proname = 'replace_client_associes'`
    );
    expect(fn, 'replace_client_associes manque a cible.sql').toHaveLength(1);
    // Pas SECURITY DEFINER : `authenticated` a deja ces droits, et un chemin
    // privilegie ne servirait qu'a en ouvrir un.
    expect(fn[0].prosecdef).toBe(false);

    const { rows: sci2 } = await client.query(
      `INSERT INTO clients (nom_entreprise) VALUES ('ZZ SCI RPC') RETURNING id`
    );
    const { rows: p2 } = await client.query(
      `INSERT INTO company_officers (first_name, last_name)
       VALUES ('ZZPAUL', 'ZZRPC') RETURNING id`
    );
    const c2 = sci2[0].id as string;
    const o2 = p2[0].id as string;

    await client.query(
      `INSERT INTO client_associes (client_id, officer_id, nb_parts) VALUES ($1, $2, 100)`,
      [c2, o2]
    );
    await client.query(
      `SELECT replace_client_associes($1, $2::jsonb, 'statuts')`,
      [c2, JSON.stringify([{ officer_id: o2, nb_parts: 900, demembrement: 'nue-propriete' }])]
    );
    const { rows: apres } = await client.query(
      'SELECT nb_parts::float8 AS n, demembrement, source FROM client_associes WHERE client_id = $1',
      [c2]
    );
    expect(apres).toHaveLength(1);
    expect(apres[0].n).toBe(900);
    expect(apres[0].demembrement).toBe('nue-propriete');
    expect(apres[0].source).toBe('statuts');

    // Une provenance inventee est refusee la aussi : la fonction ne doit pas
    // etre un contournement du CHECK de la table.
    await expect(
      client.query(`SELECT replace_client_associes($1, '[]'::jsonb, 'inpi')`, [c2])
    ).rejects.toThrow(/manual ou statuts/);

    await client.query('DELETE FROM clients WHERE id = $1', [c2]);
    await client.query('DELETE FROM company_officers WHERE id = $1', [o2]);
  });
});

/**
 * Les increments, rejoues sur une base a jour.
 * ---------------------------------------------------------------------------
 * Base SEPAREE, et c'est le point : appliquer les increments sur la meme base
 * que les invariants ci-dessus rendrait ceux-ci incapables de detecter un DDL
 * present dans un increment mais oublie dans `cible.sql`.
 *
 * Ce que cette suite prouve, et rien d'autre : chaque increment est idempotent.
 * Une base neuve a deja tout ce qu'ils contiennent — c'est le cas d'une
 * installation fraiche, ou `entree.sh` les marque sans les jouer — donc les
 * rejouer ne doit rien casser. C'est aussi le seul controle automatique sur la
 * duplication entre `increments/` et `cible.sql` : un increment qui aurait
 * diverge au point de lever une erreur se signale ici.
 *
 * Deux fois de suite, parce qu'une seule application ne dit rien de
 * l'idempotence : c'est la deuxieme qui trebuche sur un CREATE sans IF NOT
 * EXISTS ou sur une contrainte ajoutee sans garde.
 */
suite('increments rejoues sur une base a jour', () => {
  const NOM_BASE = 'schema_test_increments';
  let client: pg.Client;
  let erreur: Error | null = null;

  beforeAll(async () => {
    const urlVers = (base: string): string => {
      const u = new URL(URL_TEST!);
      u.pathname = `/${base}`;
      return u.toString();
    };

    const admin = new pg.Client({ connectionString: urlVers('postgres') });
    await admin.connect();
    await admin.query(`DROP DATABASE IF EXISTS ${NOM_BASE}`);
    await admin.query(`CREATE DATABASE ${NOM_BASE}`);
    await admin.end();

    client = new pg.Client({ connectionString: urlVers(NOM_BASE) });
    await client.connect();

    const cible = readFileSync(resolve(RACINE, 'schema/cible.sql'), 'utf8');
    const auth = readFileSync(resolve(RACINE, 'schema/auth-interne.sql'), 'utf8');
    const dossier = resolve(RACINE, 'schema/increments');
    const increments = readdirSync(dossier)
      .filter((f) => f.endsWith('.sql'))
      .sort()
      .map((f) => readFileSync(resolve(dossier, f), 'utf8'));

    try {
      await client.query(cible);
      await client.query(auth);
      // Deux passages : c'est le second qui teste quelque chose.
      for (const increment of increments) await client.query(increment);
      for (const increment of increments) await client.query(increment);
    } catch (e) {
      erreur = e as Error;
    }
  }, 180_000);

  afterAll(async () => {
    await client?.end().catch(() => {});
  });

  it('sont idempotents, appliques deux fois de suite', () => {
    expect(erreur?.message ?? null).toBeNull();
  });

  it('laissent le meme nombre de tables que cible.sql seul', async () => {
    const { rows } = await client.query(
      `SELECT count(*)::int AS n FROM information_schema.tables
        WHERE table_schema = 'public' AND table_type = 'BASE TABLE'`
    );
    // Le meme nombre que plus haut, et c'est le meme symbole : un ecart signifie
    // qu'un increment cree une table que cible.sql ignore, donc qu'une
    // installation neuve ne l'aurait jamais.
    expect(rows[0].n).toBe(TABLES_ATTENDUES);
  });
});
