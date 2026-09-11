import { describe, it, expect } from 'vitest';
import {
  normaliserAdresseFacturation,
  controlerAdresseFacturation,
} from './facturationElectronique';

/**
 * LA PROPRIETE QUE CE FICHIER PROTEGE : ce module ne refuse JAMAIS une saisie.
 *
 * Les formes admises par la reforme evoluent encore. Une adresse qu'on ne peut
 * pas enregistrer est pire qu'une adresse enregistree de travers : la seconde
 * se corrige a l'ecran, la premiere fait sortir du logiciel et finir dans un
 * tableur — ou le cabinet ne la retrouvera pas.
 */

const SIRET_FICHE = '30326504500069';

describe('normaliserAdresseFacturation', () => {
  it('retire les espaces d un SIRET recopie depuis un courrier', () => {
    expect(normaliserAdresseFacturation(' 303 265 045 00069 ')).toBe(SIRET_FICHE);
  });

  it('GARDE les espaces de ce qui n est pas purement numerique', () => {
    // Un identifiant de plateforme, ou un SIRET suivi d'un code de routage :
    // une espace peut y etre signifiante, et la retirer changerait la valeur.
    expect(normaliserAdresseFacturation('  FR 12345 / SERVICE COMPTA  ')).toBe(
      'FR 12345 / SERVICE COMPTA'
    );
  });

  it('rend une chaine vide pour une absence', () => {
    expect(normaliserAdresseFacturation(null)).toBe('');
    expect(normaliserAdresseFacturation(undefined)).toBe('');
    expect(normaliserAdresseFacturation('   ')).toBe('');
  });
});

describe('controlerAdresseFacturation', () => {
  it('ne dit RIEN sur un champ vide', () => {
    // Un champ non rempli n'est pas une erreur : c'est un champ non rempli.
    expect(controlerAdresseFacturation('', SIRET_FICHE)).toBeNull();
    expect(controlerAdresseFacturation(null, SIRET_FICHE)).toBeNull();
  });

  it('valide un SIRET identique a celui de la fiche', () => {
    const c = controlerAdresseFacturation(SIRET_FICHE, SIRET_FICHE);
    expect(c?.niveau).toBe('valid');
  });

  it('SIGNALE un SIRET different de celui de la fiche, sans le refuser', () => {
    // Le seul controle qui vaille vraiment quelque chose : c'est legitime
    // (une filiale fait adresser ses factures au siege) ET c'est la trace
    // typique d'une ligne recopiee depuis le mauvais dossier.
    const c = controlerAdresseFacturation('12345678900011', SIRET_FICHE);
    expect(c?.niveau).toBe('warning');
    expect(c?.message).toMatch(/n'est pas celui de la fiche/);
  });

  it('ne compare rien quand la fiche n a pas de SIRET', () => {
    // Sans point de comparaison, affirmer quoi que ce soit serait inventer.
    expect(controlerAdresseFacturation(SIRET_FICHE, null)?.niveau).toBe('valid');
    expect(controlerAdresseFacturation(SIRET_FICHE, '')?.niveau).toBe('valid');
  });

  it('reconnait un SIREN pris pour un SIRET', () => {
    const c = controlerAdresseFacturation('303265045', SIRET_FICHE);
    expect(c?.niveau).toBe('warning');
    expect(c?.message).toMatch(/SIREN/);
  });

  it('SE TAIT sur ce dont il n a rien d utile a dire', () => {
    // Un identifiant de plateforme, ou un SIRET suivi d'un code de routage.
    // Inventer un avertissement ici apprendrait a les ignorer tous — y compris
    // celui du SIRET etranger, qui est le seul qui compte.
    expect(controlerAdresseFacturation('30326504500069+COMPTA', SIRET_FICHE)).toBeNull();
    expect(controlerAdresseFacturation('PDP-ACME-00421', SIRET_FICHE)).toBeNull();
  });

  it('ne rend JAMAIS un niveau qui bloquerait', () => {
    // La garde de la propriete principale : aucune saisie ne doit pouvoir
    // produire un « invalid », qui donnerait envie a un futur ecran d'empecher
    // l'enregistrement.
    for (const saisie of [
      SIRET_FICHE, '303265045', '1', 'PDP-ACME-00421', '30326504500069+COMPTA',
      'n importe quoi', '  ', '00000000000000',
    ]) {
      expect(controlerAdresseFacturation(saisie, SIRET_FICHE)?.niveau ?? 'valid').not.toBe(
        'invalid'
      );
    }
  });
});
