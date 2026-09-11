import { describe, it, expect } from 'vitest';
import {
  payloadCreationClient,
  normaliserChampsClient,
  nombreSaisi,
  patchFicheClient,
} from './champsClient';

/**
 * Les tests que ces defauts auraient du rencontrer.
 *
 *   · Une fiche client ne se CREAIT pas des qu'une date facultative restait
 *     vide : PostgreSQL rendait « invalid input syntax for type date: "" », et
 *     l'ecran affichait ce message a quelqu'un qui venait de saisir un nom
 *     d'entreprise.
 *   · Une fiche existante ne s'ENREGISTRAIT pas des qu'on vidait « Date de
 *     creation » : le meme 22007, sur le seul des trois champs date dont le
 *     gestionnaire avait oublie le `|| null` recopie a la main.
 *   · Remettre « Mois de cloture » sur « Selectionner un mois » envoyait
 *     `2026--01`, une date inventee de toutes pieces par MonthPicker.
 */

/** Ce que le formulaire de creation rend quand on ne remplit que le necessaire. */
const MINIMAL = {
  nom_entreprise: 'ZZ TEMOIN SARL',
  type_personne: '',
  civilite: '',
  date_cloture: '',
  date_creation_entreprise: '',
  date_entree_cabinet: '2026-09-05',
  date_sortie_cabinet: '',
  capital_social: '',
  parts_totales: '',
  pays: 'France',
  adresse_complement: '',
};

describe('payloadCreationClient', () => {
  it('rend null pour une date vide, jamais une chaine vide', () => {
    const p = payloadCreationClient(MINIMAL);
    expect(p.date_cloture).toBeNull();
    expect(p.date_creation_entreprise).toBeNull();
    expect(p.date_sortie_cabinet).toBeNull();
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

describe("l adresse de facturation electronique", () => {
  it('est normalisee comme le connecteur MCP la normalise', () => {
    // Les deux ecrivent dans la MEME colonne. Sans cette normalisation,
    // l'ecran enregistrait « 303 265 045 00069 » la ou le connecteur ecrivait
    // « 30326504500069 » : deux valeurs pour la meme adresse, et une recherche
    // qui ne retrouve plus la fiche. Trouve en navigateur, pas a la relecture.
    const p = payloadCreationClient({
      ...MINIMAL,
      adresse_facturation_electronique: ' 303 265 045 00069 ',
    });
    expect(p.adresse_facturation_electronique).toBe('30326504500069');
  });

  it('garde les espaces d un identifiant qui n est pas numerique', () => {
    const p = payloadCreationClient({
      ...MINIMAL,
      adresse_facturation_electronique: '  PDP ACME 00421  ',
    });
    expect(p.adresse_facturation_electronique).toBe('PDP ACME 00421');
  });

  it('rend NULL quand on la vide, jamais une chaine vide', () => {
    const p = payloadCreationClient({ ...MINIMAL, adresse_facturation_electronique: '   ' });
    expect(p.adresse_facturation_electronique).toBeNull();
  });
});

describe('nombreSaisi', () => {
  it('rend ZERO pour « 0 », et non null', () => {
    // `parseFloat(v) || null` rendait `null` : un capital de 0 EUR — une
    // association, une societe non liberee — se saisissait sans etre
    // enregistre, et le champ redevenait vide au rechargement sans message.
    expect(nombreSaisi('0')).toBe(0);
    expect(nombreSaisi(' 0 ')).toBe(0);
  });

  it('rend null pour le vide et pour ce qui n est pas un nombre', () => {
    expect(nombreSaisi('')).toBeNull();
    expect(nombreSaisi('   ')).toBeNull();
    expect(nombreSaisi('abc')).toBeNull();
  });
});

describe('normaliserChampsClient', () => {
  it('laisse ABSENT ce qui est absent', () => {
    // A l'edition, la saisie est un Partial : une colonne que le formulaire ne
    // porte pas ne doit pas apparaitre dans la sortie, sans quoi le PATCH
    // ecrirait null sur des champs auxquels personne n'a touche.
    const sortie = normaliserChampsClient({ email: 'a@b.fr' });
    expect(Object.keys(sortie)).toEqual(['email']);
  });

  it('ne convertit PAS une valeur malformee en null', () => {
    // Une date malformee ne peut venir que d'un defaut du code — aucun
    // `<input type="date">` n'en produit. L'effacer en silence remplacerait une
    // erreur visible par une perte de donnee invisible : elle continue jusqu'a
    // la base, qui la refuse bruyamment.
    expect(normaliserChampsClient({ date_cloture: '2026--01' }).date_cloture).toBe('2026--01');
  });

  it('ne modifie pas l objet recu', () => {
    const saisie = { date_cloture: '' };
    normaliserChampsClient(saisie);
    expect(saisie.date_cloture).toBe('');
  });
});

describe('patchFicheClient', () => {
  const EN_BASE = {
    id: 'c-1',
    updated_at: '2026-01-01T00:00:00Z',
    nom_entreprise: 'ZZ TEMOIN SARL',
    adresse: '1 rue des Tests, 81000 ALBI',
    email: 'contact@temoin.test',
    date_creation_entreprise: '2010-04-01',
    date_cloture: null,
    capital_social: 10000,
    tva_verif_statut: 'valide',
  };

  it('n envoie que ce qui a change', () => {
    const patch = patchFicheClient({ ...EN_BASE, email: 'neuf@temoin.test' }, EN_BASE);
    expect(patch).toEqual({ email: 'neuf@temoin.test' });
  });

  it('envoie null quand on VIDE une date — le defaut du 2026-09-05', () => {
    // Sans normalisation, c'est `date_creation_entreprise: ''` qui partait, et
    // PostgreSQL refusait tout l'enregistrement : 22007.
    const patch = patchFicheClient({ ...EN_BASE, date_creation_entreprise: '' }, EN_BASE);
    expect(patch).toEqual({ date_creation_entreprise: null });
  });

  it('N ENVOIE RIEN quand une date DEJA nulle est vue comme vide', () => {
    // C'est ce que l'ordre « normaliser puis differencier » achete. Dans
    // l'autre sens, `'' !== null` ferait entrer le champ dans le PATCH, et
    // l'ecran reecrirait null sur null a chaque enregistrement.
    const patch = patchFicheClient({ ...EN_BASE, date_cloture: '' }, EN_BASE);
    expect(patch).toEqual({});
  });

  it('ecarte ce que les declencheurs recomposent et ce que le serveur ecrit seul', () => {
    const patch = patchFicheClient(
      {
        ...EN_BASE,
        adresse: 'une version differente',
        nom_entreprise: 'AUTRE NOM',
        updated_at: '2026-09-05T10:00:00Z',
        tva_verif_statut: 'invalide',
        email: 'neuf@temoin.test',
      },
      EN_BASE
    );
    // La liste noire ET le diff : `adresse` differe, et ne part quand meme pas.
    expect(patch).toEqual({ email: 'neuf@temoin.test' });
  });

  it('rend un objet vide quand rien n a bouge', () => {
    expect(patchFicheClient({ ...EN_BASE }, EN_BASE)).toEqual({});
  });

  it('envoie tout ce qui est renseigne quand la fiche en base est inconnue', () => {
    const patch = patchFicheClient({ email: 'a@b.fr' }, null);
    expect(patch).toEqual({ email: 'a@b.fr' });
  });
});
