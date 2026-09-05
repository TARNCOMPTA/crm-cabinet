import { describe, it, expect } from 'vitest';
import {
  TVA_INTRACOM_RE,
  calculerTvaFr,
  formaterNumeroTva,
  normaliserNumeroTva,
  verificationADemander,
  verifierCleTvaFr,
} from './tva';

/**
 * Le numéro de TVA intracommunautaire français.
 * ---------------------------------------------------------------------------
 * Une formule arithmétique est exactement ce qu'un test verrouille : elle n'a
 * pas de cas limite discutable, et une erreur d'un chiffre est invisible à
 * l'œil.
 *
 * ⚠️ LES DEUX NUMÉROS D'OR SONT LES MÊMES QUE DANS `tests/schema.test.ts`, où
 * ils exercent `crm_meta.numero_tva_fr`. C'est le lien entre les deux
 * implémentations : si l'une dérive de l'autre, l'un des deux fichiers rougit.
 * Ne pas les changer d'un côté seulement.
 *
 * Vérifiés contre VIES le 2026-08-03 :
 *   303265045 → FR40303265045 (SA SODIMAS, valide et actif)
 *   732829320 → FR44732829320 (clé correcte, non immatriculé)
 */
describe('calculerTvaFr', () => {
  it('calcule les deux numeros d or', () => {
    expect(calculerTvaFr('303265045')).toBe('FR40303265045');
    expect(calculerTvaFr('732829320')).toBe('FR44732829320');
  });

  it('accepte un SIREN espace', () => {
    expect(calculerTvaFr('303 265 045')).toBe('FR40303265045');
  });

  /** La cle peut valoir moins de dix : elle se ecrit alors sur deux chiffres. */
  it('complete la cle a deux chiffres', () => {
    const numero = calculerTvaFr('000000001');
    expect(numero).toMatch(/^FR\d{2}000000001$/);
    expect(numero?.length).toBe(13);
  });

  it('rend null sur un SIREN incomplet ou absent', () => {
    for (const mauvais of [null, undefined, '', '12345', '1234567890', 'abcdefghi']) {
      expect(calculerTvaFr(mauvais), `« ${mauvais} » a produit un numero`).toBeNull();
    }
  });

  /**
   * Un SIREN commencant par 9 depasse int4 : c'est pour cela que la version SQL
   * emploie `::bigint`. Cote JS le `Number` suffit, et ce test le confirme.
   */
  it('supporte un SIREN au-dela de 2^31', () => {
    expect(calculerTvaFr('999999999')).toMatch(/^FR\d{2}999999999$/);
  });
});

describe('verifierCleTvaFr', () => {
  it('accepte un numero francais coherent', () => {
    expect(verifierCleTvaFr('FR40303265045')).toBe('ok');
    expect(verifierCleTvaFr('fr 40 303 265 045')).toBe('ok');
  });

  it('rejette une cle fausse', () => {
    expect(verifierCleTvaFr('FR41303265045')).toBe('cle_fausse');
    expect(verifierCleTvaFr('FR99303265045')).toBe('cle_fausse');
  });

  /** Le SIREN porte sa propre cle : un SIREN faux rend le numero faux. */
  it('rejette un SIREN dont la cle de Luhn ne passe pas', () => {
    expect(verifierCleTvaFr('FR44303265046')).toBe('cle_fausse');
  });

  it('signale une longueur impossible pour la France', () => {
    expect(verifierCleTvaFr('FR4030326504')).toBe('longueur');
    expect(verifierCleTvaFr('FR403032650455')).toBe('longueur');
  });

  /**
   * ⚠️ UN NUMERO ETRANGER N'EST PAS FAUX, IL EST NON VERIFIABLE ICI. Chaque Etat
   * membre a sa regle de composition ; les implementer toutes serait s'engager a
   * les suivre. C'est VIES qui tranche, et l'interface doit dire « non verifiable
   * localement » et non « invalide ».
   */
  it('ne juge pas un numero etranger', () => {
    expect(verifierCleTvaFr('DE123456789')).toBe('hors_france');
    expect(verifierCleTvaFr('BE0123456789')).toBe('hors_france');
    expect(verifierCleTvaFr('LU12345678')).toBe('hors_france');
  });

  it('refuse ce qui n a pas la forme d un numero', () => {
    for (const mauvais of ['', 'F', 'FR', '40303265045', 'F4030326504', '@@']) {
      expect(verifierCleTvaFr(mauvais), `« ${mauvais} »`).toBe('format');
    }
  });
});

describe('normalisation et affichage', () => {
  it('normalise vers la forme compacte', () => {
    expect(normaliserNumeroTva('fr 40.303-265 045')).toBe('FR40303265045');
    expect(normaliserNumeroTva(null)).toBe('');
  });

  it('groupe un numero francais pour la lecture', () => {
    expect(formaterNumeroTva('FR40303265045')).toBe('FR 40 303 265 045');
  });

  /** Un numero etranger est rendu tel quel : on ne connait pas son groupement. */
  it('laisse un numero etranger compact', () => {
    expect(formaterNumeroTva('DE123456789')).toBe('DE123456789');
  });
});

describe('TVA_INTRACOM_RE', () => {
  /**
   * La MEME expression que la contrainte CHECK `clients_tva_intracom_format_check`.
   * Si l'une accepte ce que l'autre refuse, la saisie passe le controle du
   * navigateur puis echoue en base avec une erreur illisible.
   */
  it('accepte les longueurs reelles des Etats membres', () => {
    for (const bon of ['FR40303265045', 'DE123456789', 'LU12345678', 'IE1234567FA', 'BE0123456789']) {
      expect(TVA_INTRACOM_RE.test(bon), `« ${bon} » refuse`).toBe(true);
    }
  });

  it('refuse minuscules, espaces et longueurs extremes', () => {
    for (const mauvais of ['fr40303265045', 'FR 40303265045', 'FR4', 'F40303265045', 'FR40303265045678']) {
      expect(TVA_INTRACOM_RE.test(mauvais), `« ${mauvais} » accepte`).toBe(false);
    }
  });
});

describe('verificationADemander', () => {
  it('vérifie et enregistre quand rien n est en cours de saisie', () => {
    expect(verificationADemander('FR40303265045')).toEqual({
      numero: 'FR40303265045',
      enregistrable: true,
    });
  });

  it('vérifie et enregistre quand la saisie est identique au fond', () => {
    // « FR 40 303 265 045 » et « fr40303265045 » sont le MÊME numéro : repartir
    // en contrôle ponctuel pour des espaces priverait de l'enregistrement.
    expect(verificationADemander('FR40303265045', 'fr 40 303 265 045')).toEqual({
      numero: 'FR40303265045',
      enregistrable: true,
    });
  });

  it('contrôle sans enregistrer le numéro tapé mais pas encore sauvegardé', () => {
    // Sans cette bascule, la route relirait l'ANCIEN numéro en base et
    // afficherait son verdict sous le nouveau.
    expect(verificationADemander('FR40303265045', 'FR23334175221')).toEqual({
      numero: 'FR23334175221',
      enregistrable: false,
    });
  });

  it('bascule aussi quand la fiche n avait aucun numéro', () => {
    expect(verificationADemander(null, 'FR40303265045')).toEqual({
      numero: 'FR40303265045',
      enregistrable: false,
    });
  });

  it('rend un numéro vide quand il n y a rien à vérifier', () => {
    expect(verificationADemander(null)).toEqual({ numero: '', enregistrable: true });
    expect(verificationADemander('', '')).toEqual({ numero: '', enregistrable: true });
  });

  it('efface la saisie ramenée à rien plutôt que de vérifier l ancien', () => {
    // Vider le champ puis cliquer ne doit PAS relancer l'ancien numéro : le
    // bouton se désactive, faute de numéro à soumettre.
    expect(verificationADemander('FR40303265045', '   ')).toEqual({
      numero: '',
      enregistrable: false,
    });
  });
});
