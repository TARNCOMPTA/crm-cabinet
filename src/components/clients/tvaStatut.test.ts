import { describe, it, expect } from 'vitest';
import { etatTva } from './tvaStatut';

/**
 * L'état affiché d'un numéro de TVA.
 * ---------------------------------------------------------------------------
 * Ce fichier existe pour figer DEUX décisions qu'un remaniement bien intentionné
 * défera, parce qu'elles paraissent contre-intuitives :
 *
 *   · « invalide » s'affiche en ORANGE et non en rouge ;
 *   · une indisponibilité de VIES PRIME sur le statut enregistré.
 *
 * Les deux protègent le même utilisateur : un comptable à qui l'on ferait
 * courir après un numéro parfaitement correct.
 */
describe('etatTva', () => {
  it("n'affiche rien quand il n'y a pas de numero", () => {
    expect(etatTva({ numero: null, statut: 'non_verifie' })).toBeNull();
    expect(etatTva({ numero: '   ', statut: 'valide' })).toBeNull();
  });

  it('annonce une verification en cours, meme sans numero', () => {
    const e = etatTva({ numero: null, statut: null, enCours: true });
    expect(e?.texte).toMatch(/Verification/i);
    expect(e?.anime, "l'icone doit tourner pendant l'appel").toBe(true);
  });

  it('rend « Non verifie » par defaut, en gris', () => {
    const e = etatTva({ numero: 'FR40303265045', statut: 'non_verifie' });
    expect(e?.variant).toBe('gray');
    expect(e?.texte).toBe('Non verifie');
    // Le message doit dire que rien n'a encore ete envoye : c'est la promesse du
    // produit, et c'est ce qui rassure sur l'appel sortant.
    expect(e?.infobulle).toMatch(/sans un clic/i);
  });

  it('rend « Valide » en vert, avec la date et le nom officiel', () => {
    const e = etatTva({
      numero: 'FR40303265045',
      statut: 'valide',
      nomVies: 'SA SODIMAS',
      nomEnBase: 'SODIMAS',
      verifieLe: '2026-08-03T12:18:24.587Z',
    });
    expect(e?.variant).toBe('green');
    expect(e?.texte).toBe('Valide');
    expect(e?.infobulle).toContain('SA SODIMAS');
    expect(e?.infobulle).toContain('03/08/2026');
  });

  /**
   * « SA SODIMAS » face a « SODIMAS » est une difference de FORME. Un score de
   * similarite produirait des faux positifs anxiogenes sur 649 fiches : la forme
   * juridique et la ponctuation sont normalisees, le reste est compare a
   * l'identique.
   */
  it('ne crie pas a la divergence sur une simple forme juridique', () => {
    const e = etatTva({
      numero: 'FR40303265045',
      statut: 'valide',
      nomVies: 'SA SODIMAS',
      nomEnBase: 'Sodimas',
    });
    expect(e?.variant).toBe('green');
  });

  it('signale une raison sociale reellement differente, sans la juger', () => {
    const e = etatTva({
      numero: 'FR40303265045',
      statut: 'valide',
      nomVies: 'SA SODIMAS',
      nomEnBase: 'BOULANGERIE MARTEL',
    });
    expect(e?.variant).toBe('orange');
    expect(e?.texte).toMatch(/raison sociale differente/i);
    // Les DEUX noms doivent figurer : c'est a l'humain de trancher.
    expect(e?.infobulle).toContain('SA SODIMAS');
    expect(e?.infobulle).toContain('BOULANGERIE MARTEL');
    expect(e?.infobulle).toMatch(/difference de forme, pas une erreur/i);
  });

  /**
   * ⭐ LA DECISION DE COULEUR, et le test qui existe pour qu'on ne la « corrige »
   * pas. Le rouge dit « erreur, corrigez » ; ici le numero est peut-etre
   * parfaitement correct et l'entreprise simplement en franchise en base de TVA.
   */
  it('affiche « invalide » en ORANGE, jamais en danger', () => {
    const e = etatTva({ numero: 'FR44732829320', statut: 'invalide' });
    expect(e?.variant, 'le rouge accuserait la saisie a tort').toBe('orange');
    expect(e?.variant).not.toBe('danger');
    expect(e?.texte).toBe('Non confirme par VIES');
  });

  /** Le vocabulaire, fige : jamais d'accusation de faute de frappe. */
  it("n'accuse jamais la saisie dans le message d'un numero non confirme", () => {
    const infobulle = etatTva({ numero: 'FR44732829320', statut: 'invalide' })!.infobulle;
    expect(infobulle).toMatch(/franchise en base de TVA/i);
    expect(infobulle).toMatch(/pourtant correct/i);
    for (const interdit of [/mal ecrit/i, /erreur de saisie/i, /corrigez/i, /verifiez la saisie/i]) {
      expect(infobulle, `le message accuse la saisie : ${infobulle}`).not.toMatch(interdit);
    }
  });

  /**
   * ⭐ L'INDISPONIBILITE PRIME SUR LE STATUT ENREGISTRE.
   *
   * Le statut en base reste « valide » — la route ne persiste rien sur une
   * indisponibilite, la colonne n'a que trois valeurs. Mais l'ecran doit montrer
   * ce que le DERNIER appel a donne, sinon l'utilisateur clique « Verifier »,
   * rien ne bouge, et il recommence.
   */
  it('fait primer une indisponibilite transitoire sur un « valide » enregistre', () => {
    const e = etatTva({
      numero: 'FR40303265045',
      statut: 'valide',
      verifieLe: '2026-08-03T12:18:24.587Z',
      indisponibleTransitoire: true,
    });
    expect(e?.texte).toBe('VIES indisponible');
    expect(e?.variant).toBe('orange');
    expect(e?.infobulle).toMatch(/statut precedent est conserve/i);
    expect(e?.infobulle, "il faut dire que le numero n'est pas en cause").toMatch(
      /aucune conclusion n'est tiree du numero/i
    );
  });

  it('et sur un « invalide » enregistre aussi', () => {
    const e = etatTva({
      numero: 'FR44732829320',
      statut: 'invalide',
      indisponibleTransitoire: true,
    });
    expect(e?.texte).toBe('VIES indisponible');
  });

  /** La verification en cours l'emporte sur tout le reste. */
  it('la verification en cours passe devant l indisponibilite', () => {
    const e = etatTva({
      numero: 'FR40303265045',
      statut: 'valide',
      indisponibleTransitoire: true,
      enCours: true,
    });
    expect(e?.texte).toMatch(/Verification/i);
  });

  /**
   * `indisponible` ne devrait jamais venir de la base — la contrainte CHECK ne
   * l'autorise pas. Si cela arrivait malgre tout, on le traite comme une
   * non-information et non comme un verdict.
   */
  it('traite un « indisponible » persiste comme une non-information', () => {
    const e = etatTva({ numero: 'FR40303265045', statut: 'indisponible' });
    expect(e?.variant).toBe('orange');
    expect(e?.texte).toBe('VIES indisponible');
  });
});
