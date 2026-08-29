import { describe, it, expect } from 'vitest';
import { pagesSansTexte, reperes } from './statuts-texte.js';

/**
 * Les repères mécaniques d'un texte de statuts.
 * ---------------------------------------------------------------------------
 * Ce que ces cas protègent n'est pas l'exactitude d'une expression régulière :
 * c'est le REFUS DE DEVINER. Le résultat de ce module alimente un modèle qui
 * rédigera peut-être une attestation signée par un expert-comptable. Un `null`
 * s'y voit et se corrige ; un chiffre faux, non.
 *
 * Les extraits ci-dessous reprennent les formulations réelles d'un statut
 * français, y compris ses espaces insécables — que l'extraction d'un PDF rend
 * tels quels, et qui font manquer « 10 000 € » quand on les oublie.
 */

const NBSP = ' ';
const FINE = ' ';

describe('reperes — capital social', () => {
  it('lit un capital en chiffres', () => {
    expect(reperes('Le capital social est fixé à 1000 euros.').capitalSocial).toBe(1000);
  });

  /** ⭐ Le cas le plus courant, et celui qui casse si on ignore l'insécable. */
  it('lit un capital dont les milliers sont séparés par un espace insécable', () => {
    const t = `Le capital social est fixé à la somme de 10${NBSP}000${NBSP}€.`;
    expect(reperes(t).capitalSocial).toBe(10000);
  });

  it('lit un capital dont les milliers sont séparés par une fine insécable', () => {
    expect(reperes(`capital social de 1${FINE}500 euros`).capitalSocial).toBe(1500);
  });

  it('lit un capital dont les milliers sont séparés par un point', () => {
    expect(reperes('Capital social : 1.000 EUROS').capitalSocial).toBe(1000);
  });

  it('lit les centimes', () => {
    expect(reperes('capital social de 7 622,45 euros').capitalSocial).toBe(7622.45);
  });

  /**
   * ⭐ LE REFUS DE DEVINER. Les statuts écrivent presque toujours le montant
   * deux fois — « MILLE EUROS (1 000 €) ». Quand la forme chiffrée manque,
   * convertir les lettres serait un pari, et ce pari finirait dans une
   * attestation.
   */
  it('rend null quand le capital n’est écrit qu’en lettres', () => {
    expect(reperes('Le capital social est fixé à MILLE EUROS.').capitalSocial).toBeNull();
  });

  it('lit la forme chiffrée quand les deux sont présentes', () => {
    const t = `Le capital est fixé à la somme de MILLE EUROS (1${NBSP}000${NBSP}€).`;
    expect(reperes(t).capitalSocial).toBe(1000);
  });

  it('rend null en l’absence de tout capital', () => {
    expect(reperes('Les présents statuts ont été établis en trois exemplaires.').capitalSocial)
      .toBeNull();
  });

  /**
   * La fenêtre après l'ancre existe pour ça : un montant situé dans un autre
   * article — un apport, une prime d'émission — ne doit pas être pris pour le
   * capital.
   */
  it('n’attrape pas un montant éloigné de l’ancre', () => {
    // Du VRAI texte entre les deux, et non des espaces : la normalisation
    // réduit toute suite d'espaces à un seul, un remplissage n'éloignerait rien.
    const remplissage =
      'Il est divisé en parts sociales égales et indivisibles attribuées aux ' +
      'associés en proportion de leurs apports respectifs, lesquels sont ' +
      'énumérés à l’article suivant des présents statuts sociaux constitutifs. ';
    const t =
      'Le capital social est divisé en parts égales. ' +
      remplissage +
      'Les frais de constitution sont évalués à 800 euros.';
    expect(reperes(t).capitalSocial).toBeNull();
  });
});

describe('reperes — forme juridique', () => {
  it.each([
    ['société civile immobilière', 'SCI'],
    ['société à responsabilité limitée', 'SARL'],
    ['société par actions simplifiée', 'SAS'],
    ['société en nom collectif', 'SNC'],
  ])('reconnaît « %s »', (libelle, attendu) => {
    expect(reperes(`Il est formé une ${libelle} régie par les présentes.`).forme).toBe(attendu);
  });

  it('rend null quand aucune forme n’est nommée', () => {
    expect(reperes('Les soussignés ont établi ce qui suit.').forme).toBeNull();
  });
});

describe('reperes — durée', () => {
  it('lit une durée en années', () => {
    expect(reperes('La durée de la société est fixée à 99 années.').dureeAns).toBe(99);
  });

  it('lit « ans » aussi bien qu’« années »', () => {
    expect(reperes('La durée de la société est de 50 ans.').dureeAns).toBe(50);
  });

  /** Au-delà du maximum légal, on a lu autre chose : mieux vaut rien. */
  it('rend null au-delà de 99 ans', () => {
    expect(reperes('La durée de la société est fixée à 150 années.').dureeAns).toBeNull();
  });

  it('rend null quand la durée n’est pas indiquée', () => {
    expect(reperes('La société prend fin par dissolution anticipée.').dureeAns).toBeNull();
  });
});

describe('reperes — clôture de l’exercice', () => {
  /**
   * ⭐ LE PIEGE DE CE CHAMP. La formulation la plus repandue nomme les DEUX
   * dates dans la meme phrase. Ancrer sur « exercice » rendrait le 1er janvier
   * — l'OUVERTURE — sous un champ nomme `cloture`. La valeur serait plausible,
   * donc jamais verifiee.
   */
  it('lit la clôture, et non l’ouverture, quand les deux sont dans la phrase', () => {
    const t = "L'exercice social commence le 1er janvier et se termine le 31 décembre.";
    expect(reperes(t).cloture).toBe('31/12');
  });

  it('lit « est clos le » aussi bien que « se termine le »', () => {
    const t = "L'exercice social commence le 1er avril et est clos le 31 mars.";
    expect(reperes(t).cloture).toBe('31/03');
  });

  it('lit une clôture décalée', () => {
    expect(reperes("L'exercice social se termine le 30 juin.").cloture).toBe('30/06');
  });

  it('lit une date en chiffres', () => {
    expect(reperes("L'exercice social est clos le 31/12 de chaque année.").cloture).toBe('31/12');
  });

  it('rend null quand aucune date n’est lisible', () => {
    expect(reperes("L'exercice social a une durée de douze mois.").cloture).toBeNull();
  });
});

describe('reperes — dénomination', () => {
  it('lit une dénomination étiquetée, en conservant la casse', () => {
    expect(reperes('Dénomination sociale : SCI DU PONT NEUF').denomination)
      .toBe('SCI DU PONT NEUF');
  });

  /**
   * ⭐ CONSTATE SUR UN PDF REEL, pas suppose. Un PDF n'a pas de fin de ligne :
   * l'extraction joint les lignes par une espace, et la premiere version rendait
   * « SCI DU PONT NEUF Le capital social ». Une denomination qui deborde sur la
   * clause suivante finirait telle quelle dans une attestation.
   */
  it('ne déborde pas sur la clause suivante, faute de retour à la ligne', () => {
    const t =
      'Dénomination sociale : SCI DU PONT NEUF Le capital social est fixé à 1000 euros.';
    expect(reperes(t).denomination).toBe('SCI DU PONT NEUF');
  });

  it('coupe aussi devant « Siège » et « Objet »', () => {
    expect(reperes('Dénomination : SARL LES TILLEULS Siège social : Albi').denomination)
      .toBe('SARL LES TILLEULS');
    expect(reperes('Dénomination : SAS AURORA Objet : la prise de participations').denomination)
      .toBe('SAS AURORA');
  });

  /**
   * « La societe X » se rencontre partout dans un statut, y compris pour
   * désigner un tiers — une banque, un notaire. Seule la forme étiquetée est
   * acceptée.
   */
  it('n’invente pas une dénomination à partir d’une phrase ordinaire', () => {
    expect(reperes('La société pourra ouvrir un compte auprès de la Banque Postale.').denomination)
      .toBeNull();
  });
});

describe('reperes — ce que le module ne fait PAS', () => {
  /**
   * ⭐ LE CONTRAT DU MODULE. La répartition des parts est rédigée en prose et
   * varie d'un rédacteur à l'autre : la reconnaître par expression régulière
   * produirait des réponses fausses avec l'assurance des justes. Elle est
   * laissée au modèle, à partir du texte intégral.
   */
  it('ne rend aucun champ de répartition des parts', () => {
    const t =
      'Monsieur MARTIN, à concurrence de deux cent cinquante parts, ' +
      'et Madame DURAND, à concurrence de sept cent cinquante parts.';
    expect(Object.keys(reperes(t)).sort()).toEqual(
      ['capitalSocial', 'cloture', 'denomination', 'dureeAns', 'forme'].sort()
    );
  });
});

describe('pagesSansTexte', () => {
  /**
   * ⭐ LE DEFAUT QUE CE CAS FIGE, ET IL ETAIT EN PRODUCTION. Un depot de greffe
   * est souvent MIXTE : une page de garde generee, qui a une couche texte, puis
   * les pages du document, qui sont un scan et n'en ont pas.
   *
   * L'outil testait le texte FUSIONNE. Deux lignes d'en-tete de greffe
   * suffisaient a declarer le document lisible, et il rendait « GREFFE DU
   * TRIBUNAL DE COMMERCE / Depot du 12/05/2004 / 22 pages » en croyant rendre
   * les statuts. Signale a l'usage : « le document ne contient que la page de
   * garde, page 1 sur 22 ».
   */
  it('designe les pages a montrer en image', () => {
    const pages = ['GREFFE DU TRIBUNAL DE COMMERCE\nDepot du 12/05/2004', '', '', ''];
    expect(pagesSansTexte(pages)).toEqual([2, 3, 4]);
  });

  it('ne rend rien quand tout le document a du texte', () => {
    expect(pagesSansTexte(['a', 'b', 'c'])).toEqual([]);
  });

  it('rend toutes les pages d’un scan integral', () => {
    expect(pagesSansTexte(['', '', ''])).toEqual([1, 2, 3]);
  });

  /**
   * ⚠️ UNE PAGE BLANCHE N'EST PAS UNE PAGE AVEC DU TEXTE. pdf.js rend souvent
   * des sauts de ligne seuls pour une page scannee ; les prendre pour du contenu
   * ferait sauter exactement les pages qu'on cherche a lire.
   */
  it('ne prend pas des blancs pour du texte', () => {
    expect(pagesSansTexte(['\n\n', '   ', '\t', 'reel'])).toEqual([1, 2, 3]);
  });

  it('numerote a partir de 1, comme le lecteur de PDF', () => {
    expect(pagesSansTexte(['', 'texte'])).toEqual([1]);
  });
});
