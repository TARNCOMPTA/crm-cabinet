import { describe, it, expect } from 'vitest';

// `routes/clients.ts` importe `../db.js`, qui exige DATABASE_URL et
// SESSION_SECRET au chargement (config.ts). Ce test ne touche jamais la base —
// `pg.Pool` ne se connecte qu'a la premiere requete — mais l'import doit tout
// de meme trouver ces deux variables. Meme preambule que `mcp/outils.test.ts`.
process.env.DATABASE_URL ??= 'postgres://test-sans-connexion-reelle/test';
process.env.SESSION_SECRET ??= 'secret-de-test-jamais-utilise-pour-signer-32c';

const { COLONNES } = await import('./clients.js');

/**
 * Les colonnes de la liste clients, et le piege du fuseau horaire.
 * ---------------------------------------------------------------------------
 * ⚠️ LE DEFAUT QUE CE CAS FIGE ETAIT EN PRODUCTION, ET INVISIBLE EN CI.
 *
 * Le pilote `pg` rend une colonne PostgreSQL `date` sous forme d'objet `Date`
 * place a MINUIT LOCAL. `JSON.stringify` le reecrit ensuite en UTC. Tant que le
 * processus tourne en UTC, l'aller-retour est neutre et personne ne voit rien.
 *
 * Le conteneur, lui, tourne en `TZ=Europe/Paris` (Dockerfile:119,
 * docker-compose.yml:79). Une cloture au 01/06 y devient
 * « 2026-05-31T22:00:00.000Z », et la colonne « Mois de cloture » affiche MAI —
 * un mois de trop, sur toute fiche dont la cloture tombe un premier du mois,
 * c'est-a-dire toutes. Constate dans un navigateur en faisant tourner le
 * serveur au fuseau de la production ; la suite de bout en bout s'execute en
 * UTC et ne pouvait pas l'attraper.
 *
 * D'ou le `to_char` : la date sort de la base DEJA EN TEXTE, et aucun fuseau ne
 * s'interpose plus. Le premier cas ci-dessous verifie la forme de la requete,
 * le second demontre le mecanisme lui-meme — c'est lui qui explique pourquoi le
 * premier compte.
 */
describe('COLONNES de la liste clients', () => {
  it('ne laisse aucune colonne date traverser le pilote telle quelle', () => {
    // Une colonne `date` nue serait convertie en objet Date par `pg`, donc
    // decalee. Le jour ou quelqu'un « nettoie » ce SQL, ce cas le retiendra.
    expect(COLONNES).not.toMatch(/(^|[\s,])c\.date_cloture(\s|,|$)/);
    expect(COLONNES).toContain("to_char(c.date_cloture, 'YYYY-MM-DD') AS date_cloture");
  });

  it('rend toujours les memes colonnes a l ecran', () => {
    // L'alias compte autant que la conversion : sans lui, la colonne
    // s'appellerait `to_char` et l'ecran ne trouverait plus rien.
    for (const attendue of [
      'c.id', 'c.nom_entreprise', 'c.dirigeant', 'c.numero_dossier', 'c.siren',
      'c.siret', 'c.ville', 'c.regime_fiscal', 'AS date_cloture', 'c.statut',
      'c.email', 'c.forme_juridique', 'c.contact_principal',
    ]) {
      expect(COLONNES, `colonne manquante : ${attendue}`).toContain(attendue);
    }
  });
});

describe('le mecanisme du decalage, demontre', () => {
  /**
   * ⭐ LA DEMONSTRATION. Ce cas ne teste pas notre code : il teste
   * `JSON.stringify` sur ce que `pg` fabrique, et prouve que le probleme est
   * reel plutot que suppose. Sans lui, le `to_char` ci-dessus ressemblerait a
   * une precaution decorative et finirait par etre retire.
   */
  it('recule une date d’un jour des que le fuseau est a l’est de Greenwich', () => {
    // Ce que `pg` construit pour une colonne `date` valant 2026-06-01 : minuit
    // LOCAL. Le fuseau est fourni explicitement pour que le cas dise la meme
    // chose partout, y compris sur une machine en UTC.
    const minuitAParis = new Date('2026-06-01T00:00:00+02:00');
    expect(JSON.stringify(minuitAParis)).toBe('"2026-05-31T22:00:00.000Z"');

    // Et c'est bien un mois de moins une fois la chaine relue par l'ecran.
    expect(new Date(JSON.parse(JSON.stringify(minuitAParis))).getUTCMonth()).toBe(4); // mai
    expect(new Date('2026-06-01').getUTCMonth()).toBe(5); // juin
  });
});
