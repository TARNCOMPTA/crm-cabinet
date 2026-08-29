import { describe, it, expect } from 'vitest';
import { categoriserCa3, echeanceTva, JOUR_CA3, type ClientEcheance } from './echeance.js';

/**
 * Le jour d'echeance TVA.
 * ---------------------------------------------------------------------------
 * ⚠️ CES TESTS PORTENT SUR UNE REGLE FISCALE APPLIQUEE A 940 CLIENTS. Une erreur
 * ici n'a aucun symptome visible : elle affiche un jour faux, avec le meme
 * aplomb qu'un jour juste, et le cabinet depose en retard.
 *
 * Le calendrier CA3 confirme par le cabinet :
 *   16  entrepreneur individuel, nom en A-H
 *   19  entrepreneur individuel, nom en I-Z
 *   21  societes autres que par actions (SARL, SNC, civiles...)
 *   24  SA et assimilees (SAS, SASU), associations, autres redevables
 */

const client = (p: Partial<ClientEcheance>): ClientEcheance => ({
  type_personne: null,
  forme_juridique: null,
  nom: null,
  nom_entreprise: null,
  tva_jour_echeance: null,
  ...p,
});

describe('categoriserCa3 — les codes INSEE', () => {
  it('reconnait la personne physique', () => {
    expect(categoriserCa3(null, '1000')).toBe('personne_physique');
    // Les codes herites de l'ancienne saisie, alignes sur isEntrepreneurIndividuel.
    for (const v of ['0', '1', '10', 'EI', 'ei']) {
      expect(categoriserCa3(null, v), v).toBe('personne_physique');
    }
  });

  /**
   * ⭐ 5500 ET 5600 SONT TOUTES DEUX DES SA — conseil d'administration pour l'une,
   * directoire pour l'autre. Ne retenir que 55.. rangerait toutes les SA a
   * directoire en 21 au lieu de 24.
   */
  it('range les societes par actions, directoire compris', () => {
    for (const v of ['5505', '5599', '5600', '5699', '5710', '5720']) {
      expect(categoriserCa3(null, v), v).toBe('societe_actions');
    }
  });

  /** La commandite PAR ACTIONS suit les SA ; la commandite simple, non. */
  it('separe les deux commandites', () => {
    expect(categoriserCa3(null, '5385')).toBe('societe_actions');
    expect(categoriserCa3(null, '5386')).toBe('societe_actions');
    expect(categoriserCa3(null, '5305')).toBe('societe_autre');
  });

  it('range les autres societes', () => {
    // SNC, SARL, civiles, GIE.
    for (const v of ['5202', '5410', '5498', '6540', '6220']) {
      expect(categoriserCa3(null, v), v).toBe('societe_autre');
    }
  });

  it('range les associations et le secteur public en autre redevable', () => {
    for (const v of ['9220', '9260', '7210']) {
      expect(categoriserCa3(null, v), v).toBe('autre_redevable');
    }
  });
});

describe('categoriserCa3 — les libelles', () => {
  /**
   * ⭐ L'ORDRE DES TESTS DE MOTS COMPTE. « Societe anonyme » contient
   * « societe » : chercher le mot generique en premier rangerait toutes les SA
   * en 21 au lieu de 24.
   */
  it('ne confond pas « societe anonyme » avec une societe ordinaire', () => {
    expect(categoriserCa3(null, 'Société anonyme à conseil d’administration')).toBe(
      'societe_actions'
    );
    expect(categoriserCa3(null, 'SAS, société par actions simplifiée')).toBe('societe_actions');
    expect(categoriserCa3(null, 'Société à responsabilité limitée (SARL)')).toBe('societe_autre');
  });

  it('lit les libelles sans accents ni casse reguliere', () => {
    expect(categoriserCa3(null, 'SOCIETE CIVILE IMMOBILIERE')).toBe('societe_autre');
    expect(categoriserCa3(null, 'entrepreneur individuel')).toBe('personne_physique');
    expect(categoriserCa3(null, 'Association déclarée')).toBe('autre_redevable');
  });

  /** `type_personne` est tenu a jour par la fiche : il passe avant la forme. */
  it('fait primer type_personne sur la forme juridique', () => {
    expect(categoriserCa3('physique', '5710')).toBe('personne_physique');
  });

  it('rend null quand rien n est exploitable', () => {
    for (const v of [null, undefined, '', '   ', 'xyz']) {
      expect(categoriserCa3(null, v), String(v)).toBeNull();
    }
  });
});

describe('echeanceTva — la regle', () => {
  it('16 pour un entrepreneur individuel en A-H, 19 en I-Z', () => {
    const ah = echeanceTva(
      client({ type_personne: 'physique', nom: 'DONNADILLE' }),
      'mensuelle'
    );
    expect(ah.jour).toBe(JOUR_CA3.personne_physique_ah);
    expect(ah.origine).toBe('regle');

    expect(
      echeanceTva(client({ type_personne: 'physique', nom: 'MARTIN' }), 'mensuelle').jour
    ).toBe(JOUR_CA3.personne_physique_iz);
  });

  /** H est le dernier jour du 16 ; I le premier du 19. La bordure exacte. */
  it('place la frontiere entre H et I', () => {
    const jour = (nom: string) =>
      echeanceTva(client({ type_personne: 'physique', nom }), 'mensuelle').jour;
    expect(jour('HUGO')).toBe(16);
    expect(jour('IMBERT')).toBe(19);
    expect(jour('ADAM')).toBe(16);
    expect(jour('ZOLA')).toBe(19);
  });

  /**
   * ⭐ L'INITIALE SE PREND SUR LE NOM DE FAMILLE, PAS SUR LE PRENOM. Le
   * declencheur compose `nom_entreprise` en « NOM Prenom » pour une personne
   * physique : le repli donne donc la bonne lettre. Prendre « Marine
   * DONNADILLE » aurait donne M (19) au lieu de D (16).
   */
  it('prend l initiale du nom de famille, y compris via le repli', () => {
    expect(
      echeanceTva(
        client({ type_personne: 'physique', nom: null, nom_entreprise: 'DONNADILLE Marine' }),
        'mensuelle'
      ).jour
    ).toBe(16);
  });

  /** Un nom accentue ne doit pas sortir du classement. */
  it('ignore les accents dans l initiale', () => {
    expect(
      echeanceTva(client({ type_personne: 'physique', nom: 'Étienne' }), 'mensuelle').jour
    ).toBe(16);
  });

  it('21 pour une SARL, 24 pour une SAS', () => {
    expect(echeanceTva(client({ forme_juridique: '5498' }), 'mensuelle').jour).toBe(21);
    expect(echeanceTva(client({ forme_juridique: '5710' }), 'trimestrielle').jour).toBe(24);
  });

  it('applique la meme regle en mensuelle et en trimestrielle', () => {
    const m = echeanceTva(client({ forme_juridique: '5498' }), 'mensuelle');
    const t = echeanceTva(client({ forme_juridique: '5498' }), 'trimestrielle');
    expect(m.jour).toBe(t.jour);
  });
});

describe('echeanceTva — ce que la regle refuse de deviner', () => {
  /**
   * ⭐ LA CA12 N'EST PAS DANS LE CALENDRIER CA3. Son echeance depend de la
   * cloture, ce n'est pas un jour du mois. Lui appliquer 16/19/21/24 afficherait
   * une echeance fausse tous les mois, sur tout le tableau annuel.
   */
  it('ne donne aucun jour pour la TVA annuelle', () => {
    const e = echeanceTva(client({ forme_juridique: '5498' }), 'annuelle');
    expect(e.jour, 'le calendrier CA3 applique a une CA12').toBeNull();
    expect(e.origine).toBe('inconnue');
    expect(e.motif).toMatch(/CA12|annuelle/i);
  });

  /** Sans periodicite, rien ne dit que la declaration releve de la CA3. */
  it('ne donne aucun jour quand la periodicite est inconnue', () => {
    expect(echeanceTva(client({ forme_juridique: '5498' }), null).jour).toBeNull();
  });

  it('ne donne aucun jour pour une societe non rattachee', () => {
    const e = echeanceTva(null, 'mensuelle');
    expect(e.jour).toBeNull();
    expect(e.motif).toMatch(/non rattach/i);
  });

  it('ne donne aucun jour quand la forme juridique manque', () => {
    const e = echeanceTva(client({}), 'mensuelle');
    expect(e.jour).toBeNull();
    expect(e.motif).toMatch(/forme juridique/i);
  });

  it('ne donne aucun jour pour un EI sans nom exploitable', () => {
    expect(
      echeanceTva(client({ type_personne: 'physique', nom_entreprise: '123' }), 'mensuelle').jour
    ).toBeNull();
  });
});

describe('echeanceTva — la surcharge', () => {
  it('prime sur la regle', () => {
    const e = echeanceTva(client({ forme_juridique: '5498', tva_jour_echeance: 24 }), 'mensuelle');
    expect(e.jour).toBe(24);
    expect(e.origine).toBe('surcharge');
  });

  /**
   * ⭐ `jourRegle` SURVIT A LA SURCHARGE. Sans lui, poser un arbitrage serait un
   * aller sans retour visible : l'ecran ne pourrait plus nommer le defaut auquel
   * on revient en retirant la surcharge, ni signaler l'ecart.
   */
  it('conserve ce que la regle aurait donne', () => {
    const e = echeanceTva(client({ forme_juridique: '5498', tva_jour_echeance: 24 }), 'mensuelle');
    expect(e.jourRegle).toBe(21);
    expect(e.motif).toMatch(/21/);
  });

  /** Le seul moyen de poser un jour sur une TVA annuelle. */
  it('vaut meme la ou la regle se tait', () => {
    const e = echeanceTva(client({ forme_juridique: '5498', tva_jour_echeance: 5 }), 'annuelle');
    expect(e.jour).toBe(5);
    expect(e.origine).toBe('surcharge');
    expect(e.jourRegle).toBeNull();
  });

  /** Une valeur hors calendrier civil est ignoree plutot qu'affichee. */
  it('ignore une surcharge aberrante et retombe sur la regle', () => {
    for (const v of [0, 32, -3, 1.5]) {
      const e = echeanceTva(
        client({ forme_juridique: '5498', tva_jour_echeance: v }),
        'mensuelle'
      );
      expect(e.jour, `surcharge ${v}`).toBe(21);
      expect(e.origine).toBe('regle');
    }
  });

  it('rend la main a la regle une fois retiree', () => {
    const e = echeanceTva(
      client({ forme_juridique: '5498', tva_jour_echeance: null }),
      'mensuelle'
    );
    expect(e.jour).toBe(21);
    expect(e.origine).toBe('regle');
  });
});
