import { describe, it, expect } from 'vitest';
import { geometrieAscenseur } from './ascenseur';

/**
 * La geometrie de l'ascenseur horizontal dessine a la main.
 * ---------------------------------------------------------------------------
 * Les valeurs employees ici sont MESUREES sur la liste clients reelle, a
 * 1 440 px de large : conteneur visible de 1 126 px, tableau de 1 794 px, soit
 * 668 px hors champ. C'est la situation qui a motive le composant.
 */
describe('geometrieAscenseur', () => {
  it('rend une geometrie vide quand rien ne deborde', () => {
    expect(geometrieAscenseur({ visible: 1126, total: 900, position: 0 })).toEqual({
      debordement: 0, largeurCurseur: 0, courseCurseur: 0, gaucheCurseur: 0,
    });
    expect(geometrieAscenseur({ visible: 1126, total: 1126, position: 0 }).debordement).toBe(0);
  });

  /**
   * Un conteneur de largeur nulle arrive reellement : c'est l'etat du premier
   * rendu, avant que la mise en page ne soit faite. Diviser par lui donnerait
   * NaN, et un `translateX(NaNpx)` fait disparaitre le curseur sans erreur.
   */
  it('ne divise pas par zero au premier rendu', () => {
    const g = geometrieAscenseur({ visible: 0, total: 0, position: 0 });
    expect(g.debordement).toBe(0);
    expect(Number.isNaN(g.gaucheCurseur)).toBe(false);
  });

  it('proportionne le curseur a la part visible', () => {
    const g = geometrieAscenseur({ visible: 1126, total: 1794, position: 0 });
    expect(g.debordement).toBe(668);
    // 1126 / 1794 = 62,8 % du rail.
    expect(Math.round(g.largeurCurseur)).toBe(707);
    expect(Math.round(g.courseCurseur)).toBe(419);
    expect(g.gaucheCurseur).toBe(0);
  });

  it('pose le curseur en butee droite quand le contenu l est', () => {
    const g = geometrieAscenseur({ visible: 1126, total: 1794, position: 668 });
    expect(Math.round(g.gaucheCurseur)).toBe(Math.round(g.courseCurseur));
  });

  it('place le curseur au milieu de sa course a mi-defilement', () => {
    const g = geometrieAscenseur({ visible: 1126, total: 1794, position: 334 });
    expect(Math.round(g.gaucheCurseur)).toBe(Math.round(g.courseCurseur / 2));
  });

  /**
   * ⚠️ LE PLANCHER CHANGE LA COURSE, PAS SEULEMENT L ASPECT. Un tableau six
   * fois plus large que la fenetre donnerait un curseur de 18 px, impossible a
   * saisir. En l'elargissant de force on raccourcit d'autant ce qu'il peut
   * parcourir — et la conversion course -> defilement doit partir de la largeur
   * RETENUE, sinon un glisse jusqu'au bout du rail n'atteint pas le bout du
   * tableau.
   */
  it('impose une largeur minimale saisissable, et raccourcit la course en consequence', () => {
    // 332 / 6000 x 332 = 18 px de curseur sans le plancher.
    const g = geometrieAscenseur({ visible: 332, total: 6000, position: 0 });
    expect(Math.round((332 / 6000) * 332)).toBe(18);
    expect(g.largeurCurseur).toBe(48);
    expect(g.courseCurseur).toBe(332 - 48);
    // Butee droite : le curseur touche bien la fin du rail, et pas 18 px avant.
    const fin = geometrieAscenseur({ visible: 332, total: 6000, position: 6000 - 332 });
    expect(Math.round(fin.gaucheCurseur + fin.largeurCurseur)).toBe(332);
  });

  /** Sans plancher, la proportion s'applique telle quelle. */
  it('laisse la proportion faire quand elle donne deja un curseur saisissable', () => {
    const g = geometrieAscenseur({ visible: 332, total: 1794, position: 0 });
    expect(Math.round(g.largeurCurseur)).toBe(61);
  });

  /**
   * Le defilement elastique du pave tactile sort des bornes : sans bornage, le
   * curseur depasserait le rail, en haut comme en bas.
   */
  it('borne une position negative ou au-dela du debordement', () => {
    const avant = geometrieAscenseur({ visible: 1126, total: 1794, position: -120 });
    expect(avant.gaucheCurseur).toBe(0);
    const apres = geometrieAscenseur({ visible: 1126, total: 1794, position: 900 });
    expect(Math.round(apres.gaucheCurseur)).toBe(Math.round(apres.courseCurseur));
  });

  /** Un curseur plus large que son rail n'aurait aucun sens. */
  it('ne fait jamais un curseur plus large que le rail', () => {
    const g = geometrieAscenseur({ visible: 40, total: 2000, position: 0 });
    expect(g.largeurCurseur).toBeLessThanOrEqual(40);
    expect(g.courseCurseur).toBeGreaterThanOrEqual(0);
  });
});
