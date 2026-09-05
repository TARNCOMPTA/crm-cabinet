import { describe, it, expect } from 'vitest';
import { payloadCreationClient } from './creationClient';

/**
 * Le test que ce défaut aurait dû rencontrer.
 *
 * Une fiche client ne se créait pas dès qu'une date facultative restait vide :
 * PostgreSQL rendait « invalid input syntax for type date: "" », et l'écran
 * affichait ce message à quelqu'un qui venait de saisir un nom d'entreprise.
 */

/** Ce que le formulaire rend quand on ne remplit que le strict nécessaire. */
const MINIMAL = {
  nom_entreprise: 'ZZ TEMOIN SARL',
  type_personne: '',
  civilite: '',
  date_cloture: '',
  date_creation_entreprise: '',
  date_entree_cabinet: '2026-09-05',
  capital_social: '',
  pays: 'France',
  adresse_complement: '',
};

describe('payloadCreationClient', () => {
  it('rend null pour une date vide, jamais une chaine vide', () => {
    const p = payloadCreationClient(MINIMAL);
    expect(p.date_cloture).toBeNull();
    expect(p.date_creation_entreprise).toBeNull();
  });

  it('garde une date renseignee telle quelle', () => {
    expect(payloadCreationClient(MINIMAL).date_entree_cabinet).toBe('2026-09-05');
  });

  it('rend null pour un capital vide, un nombre sinon', () => {
    expect(payloadCreationClient(MINIMAL).capital_social).toBeNull();
    expect(payloadCreationClient({ ...MINIMAL, capital_social: '10000' }).capital_social).toBe(10000);
    expect(payloadCreationClient({ ...MINIMAL, capital_social: ' 7500.50 ' }).capital_social).toBe(7500.5);
  });

  it('ne touche PAS aux champs texte laisses vides', () => {
    // « Il n'y a pas de complement d'adresse » est un choix, et la colonne
    // accepte la chaine vide. Un balayage general effacerait cette nuance.
    const p = payloadCreationClient(MINIMAL);
    expect(p.adresse_complement).toBe('');
    expect(p.nom_entreprise).toBe('ZZ TEMOIN SARL');
    expect(p.pays).toBe('France');
  });

  it('rend null pour les deux listes deroulantes sans choix', () => {
    const p = payloadCreationClient(MINIMAL);
    expect(p.type_personne).toBeNull();
    expect(p.civilite).toBeNull();
  });

  it('ne modifie pas l objet recu', () => {
    const avant = { ...MINIMAL };
    payloadCreationClient(MINIMAL);
    expect(MINIMAL).toEqual(avant);
  });
});
