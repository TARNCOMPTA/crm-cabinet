import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

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

suite('schema appliqué à PostgreSQL', () => {
  const client = new pg.Client({ connectionString: URL_TEST });
  let erreurApplication: Error | null = null;

  beforeAll(async () => {
    await client.connect();
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
    // 76 tables metier + passkeys + enrolment_codes.
    // Les deux dernieres arrivees : jedeclare_teletransmissions (cache des
    // accuses) et jedeclare_suivi_interne (le suivi propre au cabinet).
    expect(rows[0].n).toBe(78);
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
   * Deux colonnes restent legitimes, et seulement elles :
   *
   *   · `cabinet_smtp_config.smtp_password` — il faut le mot de passe en clair
   *     pour ouvrir la session SMTP, aucune empreinte ne s'authentifie ;
   *   · `mcp_api_keys.client_secret_hash` — hache, precisement pour n'etre pas
   *     un secret en clair.
   *
   * Toute autre colonne au nom de secret doit etre justifiee ici, ou n'exister
   * pas. C'est la contrepartie de la promesse du produit : aucun service tiers,
   * donc aucune raison de stocker la cle d'un tiers.
   */
  it('ne garde aucun secret en clair hors des deux colonnes prevues', async () => {
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
    const attendues = ['cabinet_smtp_config.smtp_password', 'mcp_api_keys.client_secret_hash'];
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
    // Le meme 78 que plus haut. Un ecart signifie qu'un increment cree une table
    // que cible.sql ignore : une installation neuve ne l'aurait jamais.
    expect(rows[0].n).toBe(78);
  });
});
