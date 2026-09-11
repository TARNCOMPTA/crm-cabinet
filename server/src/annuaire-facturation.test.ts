/**
 * L'annuaire de la facturation électronique.
 * ---------------------------------------------------------------------------
 * Les charges sont construites d'après le contrat OpenAPI de SUPER PDP
 * (`french_directory_entry` : `identifier`, `is_active`, `company`), parce que
 * le mandataire de l'environnement de développement refuse
 * `api.superpdp.tech` — ce qu'elles prouvent est donc d'abord la RÈGLE DE
 * DÉCISION, celle qui décide de ce qu'on écrit dans une fiche.
 *
 * UNE RÉPONSE RÉELLE LES ACCOMPAGNE DÉSORMAIS, relevée le 2026-09-11 sur
 * `number=303265045` et reproduite telle quelle plus bas. Elle confirme le
 * contrat champ pour champ — `identifier` en `0225:{siren}`, `is_active`
 * booléen, `company` portant `formal_name`, `number` et `city`. C'est peu, une
 * seule réponse, mais c'est la différence entre « conforme à un document » et
 * « conforme à ce que le service envoie », et le jour où le service changera de
 * forme, ce cas-là tombera.
 *
 * Le cas qui compte le plus est le dernier de chaque famille : ne jamais
 * conclure « pas d'adresse » d'une réponse qu'on n'a pas comprise.
 */

import { describe, expect, it, vi } from 'vitest';
import { interpreter, normaliserSiren, rechercher, sirenValide } from './annuaire-facturation.js';

function entree(identifiant: string, actif: boolean, nom = 'ACME SARL') {
  return {
    identifier: identifiant,
    is_active: actif,
    company: {
      number: '853322915',
      formal_name: nom,
      address: '1 rue des Lilas',
      postcode: '81000',
      city: 'ALBI',
      country: 'FR',
    },
  };
}

describe('normalisation du SIREN', () => {
  it('retire la ponctuation de saisie', () => {
    expect(normaliserSiren(' 853 322 915 ')).toBe('853322915');
  });

  it('refuse ce qui n est pas neuf chiffres, un SIRET compris', () => {
    expect(sirenValide('853322915')).toBe(true);
    expect(sirenValide('85332291500012')).toBe(false);
    expect(sirenValide('85332291')).toBe(false);
  });
});

describe('interpretation des reponses', () => {
  /**
   * ⚠️ RECOPIEE TELLE QUELLE, sans reformatage ni champ retire : une fixture
   * qu'on « nettoie » ne prouve plus que le code encaisse ce qui arrive
   * vraiment. Relevee le 2026-09-11, SIREN 303265045.
   */
  it('encaisse une reponse REELLE du service', () => {
    const reelle = {
      data: [
        {
          company: {
            address: '11 RUE AMPERE',
            city: "PONT-DE-L'ISERE",
            country: 'FR',
            formal_name: 'SODIMAS',
            number: '303265045',
            postcode: '26600',
          },
          identifier: '0225:303265045',
          is_active: true,
        },
      ],
    };
    const r = interpreter(200, reelle);
    expect(r.etat).toBe('une-adresse');
    expect(r.adresses).toHaveLength(1);
    expect(r.adresses[0]).toEqual({
      identifiant: '0225:303265045',
      actif: true,
      nom: 'SODIMAS',
      siren: '303265045',
      ville: "PONT-DE-L'ISERE",
    });
  });

  it('une seule adresse active : le seul cas ou l on peut proposer un remplissage', () => {
    const r = interpreter(200, { data: [entree('0225:853322915', true)] });
    expect(r.etat).toBe('une-adresse');
    expect(r.adresses).toHaveLength(1);
    expect(r.adresses[0]!.identifiant).toBe('0225:853322915');
    expect(r.adresses[0]!.nom).toBe('ACME SARL');
    expect(r.adresses[0]!.ville).toBe('ALBI');
  });

  it('plusieurs actives : on rend la liste, on ne tranche pas', () => {
    const r = interpreter(200, {
      data: [entree('0225:853322915', true), entree('0225:85332291500012', true)],
    });
    expect(r.etat).toBe('plusieurs');
    expect(r.adresses.map((a) => a.identifiant)).toEqual([
      '0225:853322915',
      '0225:85332291500012',
    ]);
  });

  it('les actives passent devant les desactivees', () => {
    const r = interpreter(200, {
      data: [entree('0225:inactive', false), entree('0225:active', true)],
    });
    expect(r.etat).toBe('une-adresse');
    expect(r.adresses.map((a) => a.identifiant)).toEqual(['0225:active', '0225:inactive']);
  });

  it('que des desactivees : distinct de « aucune », parce qu une facture n y arriverait pas', () => {
    const r = interpreter(200, { data: [entree('0225:853322915', false)] });
    expect(r.etat).toBe('inactives');
    expect(r.adresses).toHaveLength(1);
  });

  it('liste vide : resultat NORMAL, et le message ne doit pas accuser la saisie', () => {
    const r = interpreter(200, { data: [] });
    expect(r.etat).toBe('aucune');
    expect(r.message).toMatch(/pas une anomalie/i);
    // Le libellé ne doit jamais suggérer une faute de frappe : une entreprise
    // en règle mais non encore inscrite est le cas fréquent en 2026.
    expect(r.message).not.toMatch(/erreur|incorrect|invalide|saisie/i);
  });

  it('is_active absent vaut INACTIF, jamais actif par defaut', () => {
    const r = interpreter(200, { data: [{ identifier: '0225:853322915', company: {} }] });
    expect(r.etat).toBe('inactives');
    expect(r.adresses[0]!.actif).toBe(false);
  });

  it('une entree sans identifiant est ecartee : on ne fait pas cliquer sur du vide', () => {
    const r = interpreter(200, { data: [{ identifier: '   ', is_active: true, company: {} }] });
    expect(r.etat).toBe('aucune');
  });

  it('company absente ne fait pas tomber la lecture', () => {
    const r = interpreter(200, { data: [{ identifier: '0225:853322915', is_active: true }] });
    expect(r.etat).toBe('une-adresse');
    expect(r.adresses[0]!.nom).toBeNull();
  });
});

describe('ce qu on ne sait pas ne devient jamais « aucune adresse »', () => {
  it('un statut non 200 rend indisponible', () => {
    for (const statut of [400, 404, 429, 500, 503]) {
      const r = interpreter(statut, { data: [] });
      expect(r.etat).toBe('indisponible');
      expect(r.code).toBe(`HTTP_${statut}`);
    }
  });

  it('un corps sans `data` exploitable rend indisponible, PAS une liste vide', () => {
    for (const corps of [null, 'du texte', {}, { data: null }, { data: 'x' }, { entries: [] }]) {
      const r = interpreter(200, corps);
      expect(r.etat).toBe('indisponible');
      expect(r.code).toBe('REPONSE_INATTENDUE');
    }
  });

  it('le message d indisponibilite promet de ne rien changer a la fiche', () => {
    expect(interpreter(500, null).message).toMatch(/reste en place/i);
  });
});

describe('appel reseau', () => {
  it('demande bien l entree par SIREN', async () => {
    const faux = vi.fn(async () =>
      new Response(JSON.stringify({ data: [entree('0225:853322915', true)] }), { status: 200 })
    );
    const r = await rechercher('853 322 915', faux as unknown as typeof fetch);
    expect(r.etat).toBe('une-adresse');
    const url = String(faux.mock.calls[0]![0]);
    expect(url).toContain('/v1.beta/french_directory/entries?number=853322915');
  });

  it('un SIREN vide ou mal forme ne fait partir aucune requete', async () => {
    const faux = vi.fn();
    expect((await rechercher('', faux as unknown as typeof fetch)).code).toBe('SIREN_ABSENT');
    expect((await rechercher('85332291500012', faux as unknown as typeof fetch)).code).toBe('SIREN_FORMAT');
    expect(faux).not.toHaveBeenCalled();
  });

  it('une panne reseau rend indisponible, jamais « aucune »', async () => {
    const faux = vi.fn(async () => {
      throw new Error('getaddrinfo ENOTFOUND');
    });
    const r = await rechercher('853322915', faux as unknown as typeof fetch);
    expect(r.etat).toBe('indisponible');
    expect(r.code).toBe('RESEAU');
  });

  it('un corps illisible rend indisponible et non une liste vide', async () => {
    const faux = vi.fn(async () => new Response('<html>502</html>', { status: 200 }));
    const r = await rechercher('853322915', faux as unknown as typeof fetch);
    expect(r.etat).toBe('indisponible');
    expect(r.code).toBe('REPONSE_INATTENDUE');
  });
});
