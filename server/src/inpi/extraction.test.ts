import { describe, it, expect } from 'vitest';
import {
  buildAddress,
  extractPersonneMoraleData,
  extractPersonnePhysiqueData,
} from './extraction.js';

/**
 * L'extraction des charges INPI.
 * ---------------------------------------------------------------------------
 * Ce module est « repris presque tel quel des Edge Functions » et n'avait jamais
 * eu le moindre test — alors qu'il decide de ce qui s'ecrit dans 649 fiches
 * clients, et qu'on vient d'y toucher fortement.
 *
 * Les charges ci-dessous sont reduites : seuls les chemins que le code lit
 * reellement y figurent. C'est deliberе — une charge INPI complete fait des
 * centaines de lignes dont on ne lit qu'une dizaine, et les recopier donnerait
 * l'illusion de couvrir ce qu'on ne couvre pas.
 */

describe('buildAddress', () => {
  it('compose la ligne depuis les morceaux de voie', () => {
    const a = buildAddress({
      numVoie: '12',
      typeVoie: 'RUE',
      voie: 'de l Exemple',
      codePostal: '81120',
      commune: 'Villeneuve',
    });
    expect(a.ligne1).toBe('12 RUE de l Exemple');
    expect(a.codePostal).toBe('81120');
    expect(a.ville).toBe('Villeneuve');
    // Le pays vaut « France » par defaut : l'INPI ne publie que du francais.
    expect(a.pays).toBe('France');
  });

  /**
   * ⭐ LE COMPLEMENT EST UN CHAMP PROPRE, et ne doit plus etre replie dans
   * `ligne1` avec un « - » : `clients.adresse_complement` existe, et l'aplatir
   * ici obligerait a le redecouper ailleurs.
   */
  it('rend le complement separement, sans le replier dans la ligne', () => {
    const a = buildAddress({
      numVoie: '12',
      typeVoie: 'RUE',
      voie: 'de l Exemple',
      complementLocalisation: 'Batiment B',
      codePostal: '81120',
      commune: 'Villeneuve',
    });
    expect(a.ligne1).toBe('12 RUE de l Exemple');
    expect(a.complement).toBe('Batiment B');
    expect(a.ligne1, 'le complement est encore replie dans ligne1').not.toContain('Batiment');
  });

  /**
   * ⭐ CE QUE `extractAddressLine` JETAIT. C'est la raison d'etre du
   * remplacement : le chemin qui ECRIT en base ne voyait ni l'indice de
   * repetition, ni le pays, ni le code INSEE.
   */
  it("retient l'indice de repetition, le pays et le code INSEE", () => {
    const a = buildAddress({
      numVoie: '12',
      indiceRepetition: 'BIS',
      typeVoie: 'RUE',
      voie: 'des Lilas',
      codePostal: '1000',
      commune: 'BRUXELLES',
      pays: 'Belgique',
      codeInseeCommune: '2A004',
    });
    expect(a.ligne1).toBe('12 BIS RUE des Lilas');
    expect(a.pays).toBe('Belgique');
    expect(a.codeInsee).toBe('2A004');
  });

  it('accepte les variantes de nommage de l INPI', () => {
    expect(buildAddress({ ville: 'ALBI', cp: '81000' }).codePostal).toBe('81000');
    expect(buildAddress({ libelleCommune: 'ALBI' }).ville).toBe('ALBI');
    expect(buildAddress({ codeCommune: '81004' }).codeInsee).toBe('81004');
  });

  it('rend des champs vides sur une charge absente', () => {
    for (const rien of [null, undefined, 'pas un objet']) {
      const a = buildAddress(rien);
      expect(a.ligne1).toBe('');
      expect(a.complement).toBe('');
      expect(a.codeInsee).toBe('');
    }
  });
});

describe('extractPersonnePhysiqueData', () => {
  const charge = {
    identite: {
      entrepreneur: {
        descriptionPersonne: {
          nom: 'DUPONT',
          nomUsage: 'MARTIN-DUPONT',
          prenoms: ['Jean', 'Pierre', 'Marie'],
          dateDeNaissance: '1970-01',
          nationalite: 'Francaise',
        },
      },
    },
    adresseEntreprise: {
      adresse: { numVoie: '5', typeVoie: 'PL', voie: 'du Marche', codePostal: '81100', commune: 'CASTRES' },
    },
    etablissementPrincipal: {
      descriptionEtablissement: { siret: '30326504500003', etatAdministratif: 'A', nomCommercial: 'Chez Jean' },
      activites: [{ codeApe: '4711D', descriptionDetaillee: 'Commerce de detail' }],
    },
  };

  /**
   * ⭐ `nomUsage` D'ABORD : c'est le nom sous lequel le cabinet ecrit au client.
   * `buildPersonName` le preferait deja, mais le chemin qui ECRIT ne le voyait
   * jamais — il passait par une concatenation qui lisait `nom`.
   */
  it('prefere le nom d usage au nom de naissance', () => {
    const d = extractPersonnePhysiqueData(charge, '303265045', '', {});
    expect(d.nom).toBe('MARTIN-DUPONT');
  });

  it('separe le premier prenom de l etat civil complet', () => {
    const d = extractPersonnePhysiqueData(charge, '303265045', '', {});
    expect(d.prenom).toBe('Jean');
    expect(d.prenoms, "les prenoms secondaires n'existent nulle part ailleurs").toBe(
      'Jean Pierre Marie'
    );
  });

  /**
   * ⭐ PLUS DE `denomination`, et c'est le nœud de la tranche.
   *
   * Elle valait « prenom nom » aplati, et `nom_entreprise` figure dans
   * CHAMPS_SYNCHRONISABLES : la synchronisation ecrivait un libelle, puis le
   * declencheur en recomposait un autre depuis nom/prenom — deux libelles
   * differents selon l'ordre des affectations. La composition redevient
   * l'affaire du declencheur, a un seul endroit.
   */
  it('ne rend plus de denomination pour une personne physique', () => {
    const d = extractPersonnePhysiqueData(charge, '303265045', '', {});
    expect(d.denomination, 'la synchronisation combattrait le declencheur').toBeUndefined();
  });

  it('signale qu il s agit d une personne physique', () => {
    const d = extractPersonnePhysiqueData(charge, '303265045', '', {});
    expect(d.isPersonnePhysique).toBe(true);
    expect(d.typePersonne).toBe('physique');
  });

  it('rend l adresse par buildAddress, code INSEE compris', () => {
    const d = extractPersonnePhysiqueData(charge, '303265045', '', {});
    expect(d.adresse.ligne1).toBe('5 PL du Marche');
    expect(d.adresse.pays).toBe('France');
    expect(d.adresse).toHaveProperty('complement');
    expect(d.adresse).toHaveProperty('codeInsee');
  });

  it('remonte le dirigeant en « NOM Prenom », comme le declencheur', () => {
    const d = extractPersonnePhysiqueData(charge, '303265045', '', {});
    expect(d.dirigeant).toBe('MARTIN-DUPONT Jean');
  });
});

describe('extractPersonneMoraleData', () => {
  const charge = {
    identite: {
      entreprise: { denomination: 'SA SODIMAS', formeJuridique: '5710' },
      description: { montantCapital: 50000, dateClotureExerciceSocial: '3112' },
    },
    adresseEntreprise: {
      adresse: { numVoie: '11', typeVoie: 'RUE', voie: 'AMPERE', codePostal: '26600', commune: 'PONT DE L ISERE' },
    },
    etablissementPrincipal: {
      descriptionEtablissement: { nic: '00017', etatAdministratif: 'C', enseigne: 'SODIMAS ASCENSEURS' },
      activites: [{ codeApe: '2822Z', descriptionDetaillee: 'Fabrication de materiel de levage' }],
    },
  };

  /**
   * ⭐ LA CLE DE SORTIE EST `codeAPE`, EN MAJUSCULES.
   *
   * `routes/inpi.ts` declarait `codeApe` dans sa table de correspondance : la
   * garde anti-vide ecartait donc l'`undefined` sans broncher, et LE CHEMIN
   * SERVEUR N'A JAMAIS ECRIT `code_ape` — ni la synchro d'une fiche, ni
   * `legal-sync-all`, ni le cron nocturne. Ce test fige la cle pour que le bug
   * ne revienne pas par l'autre bout.
   */
  it('rend le code APE sous la cle codeAPE', () => {
    const d = extractPersonneMoraleData(charge, '303265045', '', {});
    expect(d.codeAPE).toBe('2822Z');
    expect(Object.keys(d), 'la cle minuscule est reapparue').not.toContain('codeApe');
  });

  /**
   * `libelleAPE` recevait la MEME expression que `descriptionActivite` : ce n'est
   * pas un libelle NAF, et personne ne le lit. Un code APE determine son libelle ;
   * le repeter sur 649 lignes garantirait des divergences.
   */
  it('ne fabrique plus un faux libelle NAF', () => {
    const d = extractPersonneMoraleData(charge, '303265045', '', {});
    expect(d.libelleAPE).toBe('');
    expect(d.descriptionActivite).toBe('Fabrication de materiel de levage');
  });

  /** `siret = siren ‖ nic` quand la charge ne porte pas le SIRET entier. */
  it('reconstitue le SIRET depuis le nic', () => {
    const d = extractPersonneMoraleData(charge, '303265045', '', {});
    expect(d.siret).toBe('30326504500017');
  });

  it('retient l etat administratif et le nom commercial', () => {
    const d = extractPersonneMoraleData(charge, '303265045', '', {});
    // « C » : entreprise cessee. Un cabinet qui l'ignore continue de preparer
    // ses declarations.
    expect(d.etatAdministratif).toBe('C');
    // `enseigne` est repliee sur `nom_commercial` : une seule colonne
    // d'appellation commerciale.
    expect(d.nomCommercial).toBe('SODIMAS ASCENSEURS');
  });

  it('n invente pas un etat administratif inconnu', () => {
    const bizarre = { ...charge, etablissementPrincipal: { descriptionEtablissement: { etatAdministratif: 'Z' } } };
    expect(extractPersonneMoraleData(bizarre, '303265045', '', {}).etatAdministratif).toBe('');
  });
});
