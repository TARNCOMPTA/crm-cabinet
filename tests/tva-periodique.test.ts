import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * La vérification périodique des numéros de TVA, et ce qu'elle oblige à dire.
 * ---------------------------------------------------------------------------
 * Ce test ne vérifie pas que la tâche FONCTIONNE — ça, c'est `tva-lot.test.ts`
 * pour les décisions, et l'écran pour le reste. Il vérifie qu'elle EXISTE, que
 * l'interrupteur existe, et surtout que le produit ne se contredit pas sur ce
 * qui sort de chez le cabinet.
 *
 * ⚠️ C'EST LE POINT DE CE FICHIER. Jusqu'au 2026-09-05, trois endroits juraient
 * qu'aucun appel à VIES n'était périodique : le README (« rien ne part sans une
 * action de votre part »), l'en-tête de `config.ts` (« RIEN NE PART SANS UN
 * CLIC »), celui de `routes/tva.ts` (« AUCUNE TÂCHE PLANIFIÉE »). La tâche
 * existe maintenant, et ces trois phrases sont devenues fausses. Une promesse
 * fausse sur ce qui sort d'une instance qui porte la comptabilité de clients est
 * pire que pas de promesse du tout : elle se lit, elle rassure, et elle ment.
 *
 * Ce test tient donc les deux bouts, et il tomberait dans les DEUX sens : si la
 * tâche disparaissait sans que le README revienne en arrière, comme si elle
 * restait pendant qu'on y remet « aucun appel périodique ».
 */

const RACINE = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const lire = (chemin: string): string => readFileSync(resolve(RACINE, chemin), 'utf8');

const PLANIFICATEUR = lire('server/src/planificateur.ts');
const CONFIG = lire('server/src/config.ts');
const ROUTE = lire('server/src/routes/tva.ts');
const README = lire('README.md');

describe('la tache periodique', () => {
  it('est enregistree dans l ordonnanceur', () => {
    expect(PLANIFICATEUR).toContain("nom: 'verification-tva-vies'");
    // Elle doit passer par le module partage, pas rappeler VIES a sa facon :
    // c'est ce qui garantit qu'elle ecrit avec la meme regle que le bouton.
    expect(PLANIFICATEUR).toContain('verifierLot');
  });

  it('respecte les deux interrupteurs, et pas seulement le general', () => {
    // `VIES_DISABLED` coupe tout, bouton compris. `VIES_PERIODIQUE_DISABLED` ne
    // coupe que la tache : c'est le reglage du cabinet qui veut garder la main
    // sur ce qui sort de chez lui sans perdre la verification a la demande.
    expect(PLANIFICATEUR).toContain('config.vies.desactivee');
    expect(PLANIFICATEUR).toContain('config.vies.periodiqueDesactivee');
    expect(CONFIG).toContain("booleen('VIES_PERIODIQUE_DISABLED', false)");
  });
});

describe('ce que le produit promet sur ses appels sortants', () => {
  it('le README annonce la verification periodique et son interrupteur', () => {
    expect(README).toMatch(/VIES_PERIODIQUE_DISABLED/);
    expect(README).toMatch(/une fois par mois/i);
  });

  it('le README ne jure plus qu aucun appel n est periodique', () => {
    // La phrase exacte qui y figurait, et qui est devenue fausse.
    expect(README).not.toMatch(/aucun de ces appels n'est périodique/i);
    expect(README).not.toMatch(/rien ne part sans une action de votre part/i);
  });

  it('le code ne se contredit pas non plus', () => {
    /*
      Le controle est TEXTUEL et volontairement bete : il cherche les phrases
      elles-memes. Consequence a connaitre — les commentaires qui racontent ce
      revirement ne peuvent pas CITER l'ancienne promesse mot pour mot, sous
      peine de se faire prendre pour elle. Ils la reformulent, et c'est le prix
      d'une garde qu'on n'a pas besoin de rendre subtile.
    */
    for (const [nom, contenu] of [['config.ts', CONFIG], ['routes/tva.ts', ROUTE]] as const) {
      expect(contenu, `${nom} jure encore que rien ne part sans un clic`)
        .not.toMatch(/RIEN NE PART SANS UN CLIC/);
      expect(contenu, `${nom} jure encore qu'aucune tache n'est planifiee`)
        .not.toMatch(/AUCUNE TÂCHE PLANIFIÉE/);
    }
  });
});
