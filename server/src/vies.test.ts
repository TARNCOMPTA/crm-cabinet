import { describe, it, expect } from 'vitest';

/*
  ⚠️ LES MOTIFS DE CE FICHIER SONT ACCENTUÉS, ET DOIVENT LE RESTER. `/i` est
  insensible à la CASSE, jamais aux ACCENTS : `/Etat membre/i` ne trouve pas
  « État membre ». Deux assertions d'ici sont tombées le 2026-09-05 quand les
  messages ont été accentués.
*/
import { etatService, interpreter, normaliser, verifier } from './vies.js';

/**
 * L'interprétation des réponses de VIES.
 * ---------------------------------------------------------------------------
 * C'est LA logique du produit où une erreur se traduirait par « votre client a
 * mal saisi son numéro » alors que le service européen est en panne.
 *
 * Les charges ci-dessous sont RÉELLES et VERBATIM, capturées le 2026-08-03 par
 * cinq appels à `ec.europa.eu`. Elles ne sont pas illustratives : c'est en les
 * capturant qu'on a découvert que la règle initialement prévue — « `userError`
 * vaut `VALID` sur un verdict, tout le reste est indéterminé » — aurait classé
 * `INVALID`, c'est-à-dire la réponse négative NORMALE, parmi les pannes. Chaque
 * numéro non immatriculé aurait été présenté comme « service indisponible ».
 */

/** SA SODIMAS, FR40303265045. Valide et actif. */
const VALIDE = {
  isValid: true,
  requestDate: '2026-08-03T12:18:24.587Z',
  userError: 'VALID',
  name: 'SA SODIMAS',
  address: '11 RUE AMPERE\n26600 PONT DE L ISERE',
  requestIdentifier: '',
  originalVatNumber: '40303265045',
  vatNumber: '40303265045',
  viesApproximate: {
    name: '---', street: '---', postalCode: '---', city: '---', companyType: '---',
    matchName: 3, matchStreet: 3, matchPostalCode: 3, matchCity: 3, matchCompanyType: 3,
  },
};

/**
 * FR44732829320 : clé de contrôle correcte, numéro bien formé, entreprise
 * inconnue du registre intracommunautaire. `name` et `address` sont des chaînes
 * VIDES — et non « --- ».
 */
const NON_IMMATRICULE = {
  isValid: false,
  requestDate: '2026-08-03T12:17:59.904Z',
  userError: 'INVALID',
  name: '',
  address: '',
  originalVatNumber: '44732829320',
  vatNumber: '44732829320',
};

/** Entrée malformée. Même `userError` que ci-dessus, mais « --- » au lieu de ''. */
const MALFORME = {
  isValid: false,
  requestDate: '2026-08-03T12:18:00.336Z',
  userError: 'INVALID',
  name: '---',
  address: '---',
  originalVatNumber: 'ABCDEFGHIJK',
  vatNumber: 'ABCDEFGHIJK',
};

/** Code pays hors Union : c'est NOTRE appel qui est fautif. */
const PAYS_INCONNU = {
  isValid: false,
  requestDate: '2026-08-03T12:18:00.862Z',
  userError: 'INVALID_INPUT',
  name: '---',
  address: '---',
  originalVatNumber: '123456789',
  vatNumber: '123456789',
};

/**
 * ⭐ LA CHARGE QUI JUSTIFIE TOUT CE MODULE.
 *
 * C'est le MÊME numéro que `VALIDE`, rappelé deux minutes plus tard. VIES répond
 * HTTP 200, `isValid: false` — et il n'a rien vérifié du tout. Sans le contrôle
 * de `userError`, le produit aurait écrit « numéro invalide » sur le numéro de
 * TVA d'un client parfaitement en règle, et effacé un verdict correct obtenu la
 * veille.
 *
 * Obtenue sans le chercher, au deuxième appel de la session : ce n'est pas un
 * cas de bord théorique.
 */
const SATURATION = {
  isValid: false,
  requestDate: '2026-08-03T12:17:59.000Z',
  userError: 'MS_MAX_CONCURRENT_REQ',
  name: '---',
  address: '---',
  originalVatNumber: '40303265045',
  vatNumber: '40303265045',
};

describe('interpreter', () => {
  it('rend un verdict positif et retient le nom officiel', () => {
    const v = interpreter(200, VALIDE);
    expect(v.statut).toBe('valide');
    expect(v.code).toBe('VALID');
    expect(v.nom).toBe('SA SODIMAS');
    // Les sauts de ligne sont conserves tels quels : c'est une adresse postale.
    expect(v.adresse).toBe('11 RUE AMPERE\n26600 PONT DE L ISERE');
  });

  /**
   * Le cas le plus fréquent des réponses négatives, et celui que la règle
   * initiale du plan aurait classé « indisponible ».
   */
  it('rend « invalide » pour un numero non immatricule', () => {
    const v = interpreter(200, NON_IMMATRICULE);
    expect(v.statut).toBe('invalide');
    expect(v.code).toBe('INVALID');
  });

  /**
   * LE MESSAGE NE DOIT JAMAIS SUGGERER UNE FAUTE DE FRAPPE. Une entreprise en
   * franchise en base de TVA est dans ce cas par construction : son numero est
   * juste, elle n'est simplement pas immatriculee. Ce test fige le vocabulaire.
   */
  it('ne suggere jamais une erreur de saisie sur un numero non immatricule', () => {
    const message = interpreter(200, NON_IMMATRICULE).message;
    expect(message).toMatch(/franchise en base/i);
    expect(message).toMatch(/pourtant correct/i);
    for (const interdit of [/mal ecrit/i, /verifiez la saisie/i, /erreur de saisie/i, /incorrect\b/i]) {
      expect(message, `le message accuse la saisie : ${message}`).not.toMatch(interdit);
    }
  });

  it('n expose ni nom ni adresse en dehors d un verdict positif', () => {
    for (const charge of [NON_IMMATRICULE, MALFORME, PAYS_INCONNU, SATURATION]) {
      const v = interpreter(200, charge);
      expect(v.nom, `nom expose pour ${charge.userError}`).toBeNull();
      expect(v.adresse).toBeNull();
    }
  });

  it('distingue un appel fautif de notre part', () => {
    const v = interpreter(200, PAYS_INCONNU);
    expect(v.code).toBe('INVALID_INPUT');
    expect(v.message).toMatch(/État membre/i);
  });

  /** ⭐ Le test qui protege un verdict correct d'une panne du service. */
  it('ne conclut RIEN quand le service est sature', () => {
    const v = interpreter(200, SATURATION);
    expect(v.statut).toBe('indisponible');
    expect(v.code).toBe('MS_MAX_CONCURRENT_REQ');
    expect(v.message).toMatch(/statut précédent est conservé/i);
  });

  /**
   * Le defaut sur : un code que nous ne connaissons pas est une ignorance, pas un
   * verdict. Enumerer la famille des pannes serait s'engager a suivre ses
   * evolutions ; ce test dit que ce n'est pas necessaire.
   */
  it('traite tout code inconnu comme une indisponibilite', () => {
    for (const code of [
      'MS_UNAVAILABLE', 'SERVICE_UNAVAILABLE', 'TIMEOUT', 'IO_ERROR',
      'TECHNICAL_ERROR', 'VAT_BLOCKED', 'IP_BLOCKED', 'UN_CODE_INVENTE_EN_2030', '',
    ]) {
      const v = interpreter(200, { isValid: false, userError: code });
      expect(v.statut, `« ${code} » n'est pas traite comme indisponible`).toBe('indisponible');
    }
  });

  /** Incoherence : `VALID` avec un `isValid` faux. On ne conclut rien. */
  it('refuse de conclure sur une reponse incoherente', () => {
    expect(interpreter(200, { isValid: false, userError: 'VALID' }).statut).toBe('indisponible');
  });

  it('traite un statut HTTP non 200 comme une indisponibilite', () => {
    for (const statut of [400, 403, 500, 502, 503]) {
      const v = interpreter(statut, null);
      expect(v.statut).toBe('indisponible');
      expect(v.code).toBe(`HTTP_${statut}`);
    }
  });
});

describe('normaliser', () => {
  it('efface espaces, points et casse', () => {
    expect(normaliser('fr 40 303 265 045')).toBe('FR40303265045');
    expect(normaliser('FR.40303265045')).toBe('FR40303265045');
    expect(normaliser('')).toBe('');
  });
});

describe('verifier', () => {
  /** Un format impossible ne merite pas de deranger VIES. */
  it('refuse un format invalide SANS appel reseau', async () => {
    let appels = 0;
    const faux = (async () => {
      appels += 1;
      throw new Error('ne devrait pas etre appele');
    }) as unknown as typeof fetch;

    for (const mauvais of ['', 'F', '40303265045', 'FR4', '1234567890']) {
      const v = await verifier(mauvais, faux);
      expect(v.statut).toBe('invalide');
      expect(v.code).toBe('FORMAT');
    }
    expect(appels, 'un appel reseau a ete emis pour un format invalide').toBe(0);
  });

  it('separe le pays du numero dans l URL', async () => {
    let vu = '';
    const faux = (async (url: string) => {
      vu = String(url);
      return { status: 200, json: async () => VALIDE } as unknown as Response;
    }) as unknown as typeof fetch;

    await verifier('FR 40 303 265 045', faux);
    expect(vu).toContain('/ms/FR/vat/40303265045');
    expect(vu, 'le prefixe pays ne doit pas etre renvoye dans le numero').not.toContain('vat/FR');
  });

  it('rend « indisponible » sur un depassement de delai', async () => {
    const faux = (async () => {
      const e = new Error('abandon');
      e.name = 'AbortError';
      throw e;
    }) as unknown as typeof fetch;

    const v = await verifier('FR40303265045', faux);
    expect(v.statut).toBe('indisponible');
    expect(v.code).toBe('DELAI');
  });

  it('rend « indisponible » quand le reseau tombe', async () => {
    const faux = (async () => {
      throw new Error('getaddrinfo ENOTFOUND');
    }) as unknown as typeof fetch;

    const v = await verifier('FR40303265045', faux);
    expect(v.statut).toBe('indisponible');
    expect(v.code).toBe('RESEAU');
  });

  it('n emet pas de nouvelle tentative', async () => {
    let appels = 0;
    const faux = (async () => {
      appels += 1;
      return { status: 200, json: async () => SATURATION } as unknown as Response;
    }) as unknown as typeof fetch;

    await verifier('FR40303265045', faux);
    // Reessayer sur une saturation aggrave la saturation, et l'utilisateur
    // attend derriere son clic.
    expect(appels).toBe(1);
  });
});

describe('etatService', () => {
  it('lit la disponibilite annoncee pour la France', async () => {
    const faux = (async () => ({
      status: 200,
      json: async () => ({
        vow: { available: true },
        countries: [
          { countryCode: 'BE', availability: 'Available' },
          { countryCode: 'FR', availability: 'Available' },
        ],
      }),
    })) as unknown as typeof fetch;

    expect(await etatService(faux)).toEqual({ disponible: true, france: 'Available' });
  });

  /**
   * Une panne de CE controle ne doit pas empecher de tenter la verification :
   * l'appel reel tranchera. Rendre « indisponible » ici griserait le bouton pour
   * une raison qui ne concerne pas le numero.
   */
  it('rend « disponible » quand le controle lui-meme echoue', async () => {
    const faux = (async () => {
      throw new Error('reseau');
    }) as unknown as typeof fetch;

    expect(await etatService(faux)).toEqual({ disponible: true, france: null });
  });
});
