import { describe, it, expect } from 'vitest';
import { normaliserAdresseFacturation as front } from '../src/lib/facturationElectronique';
import { normaliserAdresseFacturation as serveur } from '../server/src/facturation-electronique.js';

/**
 * DEUX IMPLEMENTATIONS, UNE SEULE REGLE.
 *
 * L'ecran et le connecteur MCP ecrivent dans la MEME colonne
 * (`clients.adresse_facturation_electronique`). Le serveur ne peut pas importer
 * du front — son `tsconfig` pose `rootDir: "src"`, une frontiere delibere qui
 * empeche du code de navigateur d'atterrir dans le processus qui parle a la
 * base. La normalisation existe donc en double.
 *
 * ⚠️ CE QUE LA DIVERGENCE COUTERAIT : « 303 265 045 00069 » saisi par le
 * connecteur et « 30326504500069 » saisi a l'ecran seraient deux valeurs
 * differentes pour la meme adresse. Une recherche ne retrouverait plus la
 * fiche, un rapprochement echouerait, et rien ne le signalerait.
 *
 * Ce test est le seul lien entre les deux fichiers. Il tombe des qu'ils
 * s'ecartent, sur n'importe lequel des cas ci-dessous.
 */

/** La table de cas, commune aux deux. Y ajouter un cas les eprouve tous deux. */
const CAS: (string | null | undefined)[] = [
  // Le cas courant : un SIRET recopie depuis un courrier.
  '303 265 045 00069',
  ' 303 265 045 00069 ',
  '30326504500069',
  // Un SIREN, plus court, mais toujours purement numerique.
  '303 265 045',
  // Ce qui n'est PAS numerique : les espaces y restent.
  'FR 12345 / SERVICE COMPTA',
  '  PDP-ACME-00421  ',
  '30326504500069 + COMPTA',
  // Les absences.
  '',
  '   ',
  null,
  undefined,
  // Les bords.
  '0',
  '\t303265045\n00069\t',
];

describe('normaliserAdresseFacturation — les deux implementations', () => {
  for (const cas of CAS) {
    it(`s accordent sur ${JSON.stringify(cas)}`, () => {
      expect(serveur(cas)).toBe(front(cas));
    });
  }

  it('et ce ne sont pas deux fonctions qui rendent tout pareil', () => {
    // Sans ce cas, une paire de fonctions rendant toujours '' passerait la
    // suite entiere. On verifie que la regle FAIT quelque chose.
    expect(front('303 265 045 00069')).toBe('30326504500069');
    expect(serveur('303 265 045 00069')).toBe('30326504500069');
    expect(front('PDP ACME')).toBe('PDP ACME');
  });
});
