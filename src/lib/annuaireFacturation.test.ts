/**
 * Ce que l'écran propose, d'après l'annuaire ET ce que la fiche porte déjà.
 *
 * Le cas central est `a-remplacer` : c'est le seul qui touche une adresse
 * saisie par le cabinet d'après un courrier du client, et le seul dont une
 * erreur enverrait des factures ailleurs.
 */

import { describe, expect, it } from 'vitest';
import {
  memeAdresse,
  propositionAnnuaire,
  type AdresseAnnuaire,
  type ResultatAnnuaire,
} from './annuaireFacturation';

function adresse(identifiant: string, actif = true): AdresseAnnuaire {
  return { identifiant, actif, nom: 'ACME SARL', siren: '853322915', ville: 'ALBI' };
}

function resultat(partiel: Partial<ResultatAnnuaire>): ResultatAnnuaire {
  return {
    success: true,
    siren: '853322915',
    adresseEnregistree: null,
    etat: 'aucune',
    adresses: [],
    code: 'OK',
    message: 'message du serveur',
    ...partiel,
  };
}

describe('memeAdresse', () => {
  it('normalise avant de comparer : un SIRET espace n est pas une autre adresse', () => {
    expect(memeAdresse('303 265 045 00069', '30326504500069')).toBe(true);
  });

  it('ignore la casse', () => {
    expect(memeAdresse('0225:ABC', '0225:abc')).toBe(true);
  });

  it('deux vides ne sont pas « la meme adresse »', () => {
    expect(memeAdresse('', '')).toBe(false);
    expect(memeAdresse(null, undefined)).toBe(false);
  });

  it('distingue deux adresses reellement differentes', () => {
    expect(memeAdresse('0225:853322915', '0225:85332291500012')).toBe(false);
  });
});

describe('proposition', () => {
  it('fiche vide, une adresse active : on propose de renseigner', () => {
    const p = propositionAnnuaire(
      resultat({ etat: 'une-adresse', adresses: [adresse('0225:853322915')] }),
      ''
    );
    expect(p).toEqual({ genre: 'a-renseigner', adresse: adresse('0225:853322915') });
  });

  it('fiche deja a jour : on ne propose pas de remplacer par la meme valeur', () => {
    const p = propositionAnnuaire(
      resultat({ etat: 'une-adresse', adresses: [adresse('0225:853322915')] }),
      '0225:853322915'
    );
    expect(p.genre).toBe('identique');
  });

  it('fiche differente : REMPLACEMENT explicite, et l ancienne valeur voyage', () => {
    const p = propositionAnnuaire(
      resultat({ etat: 'une-adresse', adresses: [adresse('0225:853322915')] }),
      '30326504500069'
    );
    expect(p.genre).toBe('a-remplacer');
    if (p.genre !== 'a-remplacer') throw new Error('genre inattendu');
    expect(p.actuelle).toBe('30326504500069');
    expect(p.adresse.identifiant).toBe('0225:853322915');
  });

  it('l adresse EN COURS DE SAISIE prime sur celle de la base', () => {
    // Le serveur a relu « ancienne » en base ; l'utilisateur a tape « saisie ».
    // C'est la saisie qui doit etre comparee, sinon on propose de remplacer une
    // valeur que l'utilisateur vient justement de changer.
    const p = propositionAnnuaire(
      resultat({
        etat: 'une-adresse',
        adresses: [adresse('0225:853322915')],
        adresseEnregistree: 'ancienne',
      }),
      '0225:853322915'
    );
    expect(p.genre).toBe('identique');
  });

  it('plusieurs actives : on rend le choix, sans les desactivees', () => {
    const p = propositionAnnuaire(
      resultat({
        etat: 'plusieurs',
        adresses: [adresse('0225:a'), adresse('0225:b'), adresse('0225:morte', false)],
      }),
      ''
    );
    expect(p.genre).toBe('choix');
    if (p.genre !== 'choix') throw new Error('genre inattendu');
    expect(p.adresses.map((a) => a.identifiant)).toEqual(['0225:a', '0225:b']);
  });

  it('aucune, inactives et indisponible ne proposent rien et gardent le message du serveur', () => {
    for (const etat of ['aucune', 'inactives', 'indisponible'] as const) {
      const p = propositionAnnuaire(resultat({ etat, message: `dit ${etat}` }), '');
      expect(p).toEqual({ genre: 'rien', message: `dit ${etat}` });
    }
  });

  it('une adresse desactivee n est JAMAIS proposee au remplissage', () => {
    // Une facture envoyee a une adresse desactivee n'arrive pas : la proposer
    // serait pire que de ne rien proposer.
    const p = propositionAnnuaire(
      resultat({ etat: 'inactives', adresses: [adresse('0225:morte', false)] }),
      ''
    );
    expect(p.genre).toBe('rien');
  });

  it('un etat « une-adresse » sans adresse active ne fabrique pas de proposition', () => {
    const p = propositionAnnuaire(
      resultat({ etat: 'une-adresse', adresses: [adresse('0225:morte', false)] }),
      ''
    );
    expect(p.genre).toBe('rien');
  });
});
