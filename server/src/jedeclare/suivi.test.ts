import { describe, it, expect } from 'vitest';
import { etatCellule, sirenDe, type LigneTeletransmission } from './etat.js';

/**
 * L'état d'une cellule du suivi.
 * ---------------------------------------------------------------------------
 * ⚠️ LES VALEURS TESTÉES ICI SONT RÉELLES. Elles proviennent du relevé exhaustif
 * des 2 165 accusés du cabinet, le 2026-08-03 — dix combinaisons
 * (nature, résultat) et pas une de plus.
 *
 * Ce test existe parce que la première version cherchait `/rejet/i`, un mot que
 * jedeclare N'EMPLOIE JAMAIS : il écrit `refusees`. Les 35 déclarations refusées
 * s'affichaient donc en orange « en attente » au lieu de rouge. Le connecteur
 * d'origine porte encore ce défaut.
 */

const ligne = (p: Partial<LigneTeletransmission>): LigneTeletransmission => ({
  numero: 'P1', type_piece: '03', ligne: 0, procedure: 'EDI-TVA', nature: 'ARS',
  numero_ads: '', date_avis: '2026-07-15', siret: '', siren: '', societe: '',
  dossier: '', type_declaration: 'IDT', type_libelle: '', destinataire: 'DGFIP',
  periode_debut: '2026-06-01', periode_fin: '2026-06-30', resultat: '',
  bloquee: false, montant: null, rof: '', lien: '', ...p,
});

describe('etatCellule — les resultats reels de jedeclare', () => {
  it('rend null quand il n y a aucune ligne', () => {
    expect(etatCellule([])).toBeNull();
  });

  it('vert : un ARS accepte, qui seul fait foi', () => {
    const e = etatCellule([
      ligne({ nature: 'ACS', resultat: 'acceptée' }),
      ligne({ nature: 'ARS', resultat: 'acceptée' }),
    ]);
    expect(e?.etat).toBe('vert');
    expect(e?.libelle).toBe('acceptée');
  });

  it('vert aussi sur « accepteesprecedement »', () => {
    expect(etatCellule([ligne({ nature: 'ARS', resultat: 'accepteesprecedement' })])?.etat).toBe('vert');
  });

  /**
   * ⭐ LE DEFAUT CORRIGE. `refusees` ne contient ni « rejet » ni « refus » au
   * singulier : la detection initiale le laissait passer pour une attente.
   */
  it('ROUGE sur « refusees » — le mot « rejet » n existe pas chez jedeclare', () => {
    const e = etatCellule([ligne({ nature: 'ARS', resultat: 'refusees' })]);
    expect(e?.etat, 'un refus affiche en attente : le cabinet ne le verrait pas').toBe('rouge');
    expect(e?.libelle).toMatch(/refus/i);
  });

  it('rouge sur « refuseesprecedement »', () => {
    expect(etatCellule([ligne({ nature: 'ARS', resultat: 'refuseesprecedement' })])?.etat).toBe('rouge');
  });

  /** Un ACS refuse : le controle de conformite a echoue, rien n'est parti. */
  it('rouge sur un ACS refuse, avant meme la reponse du destinataire', () => {
    expect(etatCellule([ligne({ nature: 'ACS', resultat: 'refusees' })])?.etat).toBe('rouge');
  });

  /** Un refus l'emporte sur une acceptation anterieure. */
  it('rouge quand une acceptation est suivie d un refus', () => {
    const e = etatCellule([
      ligne({ nature: 'ARS', resultat: 'accepteesprecedement', date_avis: '2026-06-01' }),
      ligne({ nature: 'ARS', resultat: 'refusees', date_avis: '2026-07-01' }),
    ]);
    expect(e?.etat).toBe('rouge');
  });

  it('rouge sur une declaration bloquee, quel que soit le resultat', () => {
    expect(etatCellule([ligne({ resultat: 'acceptée', bloquee: true })])?.etat).toBe('rouge');
    expect(etatCellule([ligne({ resultat: 'acceptée', bloquee: true })])?.libelle).toMatch(/bloquée/);
  });

  it('signale l anomalie sans changer la couleur', () => {
    const e = etatCellule([ligne({ nature: 'ARS', resultat: 'acceptée avec anomalie' })]);
    expect(e?.etat).toBe('vert');
    expect(e?.anomalie).toBe(true);
    expect(e?.libelle).toBe('acceptée avec anomalie');
  });

  /** L'anomalie est accolee dans « accepteesanoprecedement ». */
  it('detecte l anomalie collee dans « accepteesanoprecedement »', () => {
    const e = etatCellule([ligne({ nature: 'ARS', resultat: 'accepteesanoprecedement' })]);
    expect(e?.etat).toBe('vert');
    expect(e?.anomalie, "l'anomalie accolee passe inapercue").toBe(true);
  });

  /**
   * « sansretour » : le destinataire n'a pas repondu. Ce n'est ni un refus ni
   * une acceptation, et surtout pas une anomalie — c'est frequent et souvent
   * normal. Le libelle le nomme au lieu de le confondre avec une declaration
   * jamais deposee.
   */
  it('orange et nomme sur « sansretour »', () => {
    const e = etatCellule([
      ligne({ nature: 'ACS', resultat: 'acceptée' }),
      ligne({ nature: 'ARS', resultat: 'sansretour' }),
    ]);
    expect(e?.etat).toBe('orange');
    expect(e?.anomalie).toBe(false);
    expect(e?.libelle).toBe('déposée, sans retour de DGFIP');
  });

  it('orange quand seul l ACS existe : le depot ne vaut pas acceptation', () => {
    const e = etatCellule([ligne({ nature: 'ACS', resultat: 'acceptée' })]);
    expect(e?.etat).toBe('orange');
    expect(e?.libelle).toBe('déposée, en attente de réponse');
  });

  /** L'ACS atteste du depot, l'ARS y repond : a date egale, l'ACS passe devant. */
  it('ordonne les etapes, ACS avant ARS a date egale', () => {
    const e = etatCellule([
      ligne({ nature: 'ARS', resultat: 'acceptée', date_avis: '2026-07-15' }),
      ligne({ nature: 'ACS', resultat: 'acceptée', date_avis: '2026-07-15' }),
    ]);
    expect(e?.etapes[0]).toMatch(/^ACS/);
    expect(e?.etapes[1]).toMatch(/^ARS/);
  });

  it('additionne les montants des lignes', () => {
    const e = etatCellule([ligne({ montant: 1200 }), ligne({ montant: 300 })]);
    expect(e?.montant).toBe(1500);
  });
});

/**
 * Le destinataire nommé.
 * ---------------------------------------------------------------------------
 * ⚠️ SUR LE COMPTE RÉEL, 436 LIGNES SUR 6 075 NE VONT PAS À LA DGFiP mais à une
 * banque du client — la copie de la liasse. Le type `ILF` est même à 100 %
 * bancaire : 433 lignes, aucune vers l'administration (mesuré le 2026-08-03).
 *
 * Tant que le libellé disait « refusée par le destinataire », ces 27 refus
 * bancaires s'affichaient en rouge dans un onglet nommé « Liasses Fiscales » et
 * se lisaient comme un refus de l'administration.
 */
describe('etatCellule — le destinataire est nomme', () => {
  it('nomme la banque qui refuse, au lieu de « le destinataire »', () => {
    const e = etatCellule([
      ligne({ nature: 'ACS', resultat: 'acceptée', destinataire: 'Banque Populaire Occitane' }),
      ligne({ nature: 'ARS', resultat: 'refusees', destinataire: 'Banque Populaire Occitane' }),
    ]);
    expect(e?.etat).toBe('rouge');
    expect(e?.libelle, 'un refus bancaire lu comme un refus fiscal').toBe(
      'refusée par Banque Populaire Occitane'
    );
  });

  it('compte les destinataires plutot que de tous les enumerer', () => {
    const e = etatCellule([
      ligne({ nature: 'ARS', resultat: 'refusees', destinataire: 'LCL' }),
      ligne({ nature: 'ARS', resultat: 'refusees', destinataire: 'Société Générale' }),
    ]);
    expect(e?.libelle).toBe('refusée par 2 destinataires');
  });

  /** Une déclaration bloquée ne part chez personne : nommer serait mentir. */
  it('ne nomme personne quand la declaration est bloquee', () => {
    const e = etatCellule([ligne({ resultat: 'acceptée', bloquee: true, destinataire: 'LCL' })]);
    expect(e?.libelle).toBe('refusée (déclaration bloquée)');
  });

  it('retombe sur « le destinataire » quand jedeclare ne le donne pas', () => {
    const e = etatCellule([ligne({ nature: 'ARS', resultat: 'refusees', destinataire: '' })]);
    expect(e?.libelle).toBe('refusée par le destinataire');
  });

  it('expose les destinataires distincts, sans doublon ni vide', () => {
    const e = etatCellule([
      ligne({ destinataire: 'DGFiP - ESI Strasbourg' }),
      ligne({ destinataire: 'DGFiP - ESI Strasbourg' }),
      ligne({ destinataire: '' }),
      ligne({ destinataire: 'LCL' }),
    ]);
    expect(e?.destinataires).toEqual(['DGFiP - ESI Strasbourg', 'LCL']);
  });
});

describe('sirenDe', () => {
  it('prend les neuf premiers chiffres d un SIRET', () => {
    expect(sirenDe('30326504500017')).toBe('303265045');
  });
  it('rend vide sur une entree trop courte', () => {
    for (const mauvais of [null, undefined, '', '1234', 'abcdefghi']) {
      expect(sirenDe(mauvais)).toBe('');
    }
  });
});
