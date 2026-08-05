import { describe, it, expect } from 'vitest';
import { composerAdresse, decouperAdresse } from './adresseHeritee';

/**
 * Le découpage des adresses héritées.
 * ---------------------------------------------------------------------------
 * Ce module remplace cinq parseurs concurrents. Les cas ci-dessous viennent des
 * angles morts de chacun : ce sont les entrées réelles sur lesquelles l'un des
 * cinq se trompait, et qu'aucun ne traitait tous.
 *
 * L'enjeu n'est pas cosmétique. Une adresse mal découpée est réécrite dans
 * `clients.adresse` par le déclencheur `clients_composer_adresse` — donc une
 * erreur ici détruit la donnée d'origine.
 */
describe('decouperAdresse', () => {
  it('découpe le format courant « rue, CP ville »', () => {
    expect(decouperAdresse('34 AVENUE DES ESSAIS, 69004 LYON')).toEqual({
      ligne1: '34 AVENUE DES ESSAIS',
      codePostal: '69004',
      ville: 'LYON',
    });
  });

  /** Le format JSON d'une version antérieure, que la synchronisation fabriquait. */
  it('lit le format JSON hérité', () => {
    expect(
      decouperAdresse('{"ligne1":"12 RUE de l Exemple","codePostal":"81120","ville":"Villeneuve"}')
    ).toEqual({ ligne1: '12 RUE de l Exemple', codePostal: '81120', ville: 'Villeneuve' });
  });

  it('accepte un JSON aux champs partiellement vides', () => {
    expect(decouperAdresse('{"ligne1":"LD CAMP","codePostal":"","ville":""}')).toEqual({
      ligne1: 'LD CAMP',
      codePostal: '',
      ville: '',
    });
    expect(decouperAdresse('{"ligne1":"","codePostal":"81600","ville":"BOURGVILLE"}')).toEqual({
      ligne1: '',
      codePostal: '81600',
      ville: 'BOURGVILLE',
    });
  });

  /**
   * Une accolade qui ne cache pas du JSON exploitable ne doit pas devenir une
   * `ligne1` accolades comprises : on retombe sur l'analyse du texte.
   */
  it('retombe sur le texte quand l accolade ne cache pas du JSON utile', () => {
    expect(decouperAdresse('{pas du json')).toEqual({
      ligne1: '{pas du json',
      codePostal: '',
      ville: '',
    });
    expect(decouperAdresse('{"autre":"chose"}')).toEqual({
      ligne1: '{"autre":"chose"}',
      codePostal: '',
      ville: '',
    });
  });

  it('rend des champs vides pour une adresse absente', () => {
    for (const vide of [null, undefined, '', '   ']) {
      expect(decouperAdresse(vide)).toEqual({ ligne1: '', codePostal: '', ville: '' });
    }
  });

  /**
   * L'angle mort de `CompanyFormModal`, seul des cinq à le traiter — et donc la
   * raison pour laquelle c'est lui qui a servi de référence.
   */
  it('découpe une adresse SANS virgule', () => {
    expect(decouperAdresse('12 RUE DES LILAS 31000 TOULOUSE')).toEqual({
      ligne1: '12 RUE DES LILAS',
      codePostal: '31000',
      ville: 'TOULOUSE',
    });
  });

  /**
   * L'angle mort de `contactsDirectoryService`, qui faisait `split(',')` : une
   * rue contenant une virgule produisait trois morceaux dont deux faux. C'est la
   * DERNIÈRE virgule qui compte.
   */
  it('prend la dernière virgule, pas la première', () => {
    expect(decouperAdresse('ZAC des Portes, rue Lavoisier, 81000 ALBI')).toEqual({
      ligne1: 'ZAC des Portes, rue Lavoisier',
      codePostal: '81000',
      ville: 'ALBI',
    });
  });

  it('garde une ville en plusieurs mots', () => {
    expect(decouperAdresse('2 AV DU GAL, 31300 SAINT MARTIN DU TOUCH').ville).toBe(
      'SAINT MARTIN DU TOUCH'
    );
  });

  /**
   * Une adresse étrangère : code postal à quatre chiffres, donc non reconnu.
   * Tout part dans `ligne1`, et c'est le bon résultat — inventer un code postal
   * français serait pire que ne rien découper.
   */
  it('ne découpe pas une adresse étrangère plutôt que de se tromper', () => {
    expect(decouperAdresse('RUE DE LA LOI 16, 1000 BRUXELLES')).toEqual({
      ligne1: 'RUE DE LA LOI 16, 1000 BRUXELLES',
      codePostal: '',
      ville: '',
    });
  });

  it('ne découpe pas une adresse sans code postal', () => {
    expect(decouperAdresse('LD CAMP')).toEqual({ ligne1: 'LD CAMP', codePostal: '', ville: '' });
  });
});

/**
 * `composerAdresse` doit rendre EXACTEMENT ce que produit le déclencheur
 * `clients_composer_adresse`. L'écran affiche cette fonction avant
 * l'enregistrement, la base écrit le déclencheur après : une divergence se
 * verrait comme un champ qui bouge tout seul au rechargement.
 */
describe('composerAdresse', () => {
  it('compose le format lu par une trentaine d endroits', () => {
    expect(
      composerAdresse({ ligne1: '3 RUE HAUTE', codePostal: '81120', ville: 'VILLENEUVE' })
    ).toBe('3 RUE HAUTE, 81120 VILLENEUVE');
  });

  it('accroche le complément à la ligne 1 avec « - »', () => {
    expect(
      composerAdresse({
        ligne1: '3 RUE HAUTE',
        complement: 'Batiment B',
        codePostal: '81120',
        ville: 'VILLENEUVE',
      })
    ).toBe('3 RUE HAUTE - Batiment B, 81120 VILLENEUVE');
  });

  /**
   * « France » n'est JAMAIS ajouté : `get_dashboard_stats` extrait la ville par
   * `regexp_replace(adresse, '.*\s*\d{5}\s+', '')`, et un « , France » final
   * ferait de la ville « VILLENEUVE, France » dans le top 5 du tableau de bord.
   */
  it('n ajoute pas « France »', () => {
    expect(
      composerAdresse({ ligne1: '3 RUE HAUTE', codePostal: '81120', ville: 'VILLENEUVE', pays: 'France' })
    ).toBe('3 RUE HAUTE, 81120 VILLENEUVE');
    expect(composerAdresse({ ligne1: 'X', codePostal: '1', ville: 'Y', pays: 'FRANCE' })).toBe(
      'X, 1 Y'
    );
  });

  it('ajoute un pays étranger', () => {
    expect(
      composerAdresse({
        ligne1: 'RUA AUGUSTA 10',
        codePostal: '1100',
        ville: 'LISBOA',
        pays: 'Portugal',
      })
    ).toBe('RUA AUGUSTA 10, 1100 LISBOA, Portugal');
  });

  it('ne laisse pas de virgule orpheline quand un morceau manque', () => {
    expect(composerAdresse({ ligne1: 'LD CAMP' })).toBe('LD CAMP');
    expect(composerAdresse({ codePostal: '81600', ville: 'BOURGVILLE' })).toBe('81600 BOURGVILLE');
    expect(composerAdresse({})).toBe('');
  });

  /** Aller-retour : découper puis recomposer doit rendre l'entrée. */
  it('recompose à l identique ce que decouperAdresse a découpé', () => {
    for (const adresse of [
      '34 AVENUE DES ESSAIS, 69004 LYON',
      '2 AV DU GAL, 31300 SAINT MARTIN DU TOUCH',
      'LD CAMP',
    ]) {
      expect(composerAdresse(decouperAdresse(adresse))).toBe(adresse);
    }
  });
});
