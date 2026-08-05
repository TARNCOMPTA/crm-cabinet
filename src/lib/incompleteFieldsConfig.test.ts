import { describe, it, expect } from 'vitest';
import {
  CRITICAL_SCORE_THRESHOLD,
  FIELD_WEIGHT,
  MAX_SCORE,
  PRIMARY_STAT_FIELDS,
  SECONDARY_STAT_FIELDS,
  TOTAL_TRACKED_FIELDS,
  TRACKED_FIELDS,
} from './incompleteFieldsConfig';

/**
 * Le dénominateur du taux de complétude.
 * ---------------------------------------------------------------------------
 * Ces deux constantes gouvernent un pourcentage affiché sur 649 fiches. Les
 * faire bouger sans y penser décale silencieusement tous les scores du cabinet :
 * un comptable verrait « 87 % » devenir « 82 % » sans qu'aucune donnée n'ait
 * changé, et chercherait ce qu'il a perdu.
 *
 * Ces tests ne vérifient donc pas une propriété, ils EXIGENT UNE DÉCISION
 * CONSCIENTE : ajouter un champ suivi rend le test rouge, et il faut venir ici
 * écrire le nouveau chiffre en connaissance de cause.
 */
describe('champs suivis', () => {
  it('compte 18 champs pour un score maximal de 32', () => {
    expect(TOTAL_TRACKED_FIELDS, 'le nombre de champs suivis a change').toBe(18);
    expect(MAX_SCORE, 'le denominateur du score a change').toBe(32);
  });

  /**
   * `adresse` est partie, remplacee par ses composants : la laisser aurait
   * produit dans « Fiches incompletes » un champ de saisie ecrivant une colonne
   * desormais recomposee par un declencheur — la saisie aurait ete ecrasee au
   * premier enregistrement de la fiche.
   */
  it('ne suit plus la colonne adresse, mais ses composants', () => {
    const cles = TRACKED_FIELDS.map((f) => f.key);
    expect(cles, 'adresse est encore suivie : risque de perte de saisie').not.toContain('adresse');
    for (const attendue of ['adresse_ligne1', 'code_postal', 'ville']) {
      expect(cles).toContain(attendue);
    }
  });

  /**
   * Les trois qui n'entrent PAS, et il faut que cela reste vrai : un champ
   * legitimement vide chez 90 % des clients fabrique de la fausse incompletude,
   * et un champ toujours rempli dilue le score de ceux qui manquent vraiment.
   */
  it('ne suit ni le complement, ni le pays, ni le code INSEE, ni la TVA', () => {
    const cles = TRACKED_FIELDS.map((f) => f.key) as string[];
    for (const exclue of ['adresse_complement', 'pays', 'code_insee', 'tva_intracom', 'tva_verif_statut']) {
      expect(cles, `${exclue} ne devrait pas etre un champ suivi`).not.toContain(exclue);
    }
  });

  it('donne un poids a chaque champ suivi, et a rien d autre', () => {
    const cles = TRACKED_FIELDS.map((f) => f.key).sort();
    expect(Object.keys(FIELD_WEIGHT).sort()).toEqual(cles);
  });

  it('range chaque champ dans exactement une des deux familles de statistiques', () => {
    const rangees = [...PRIMARY_STAT_FIELDS, ...SECONDARY_STAT_FIELDS].sort();
    expect(rangees).toEqual(TRACKED_FIELDS.map((f) => f.key).sort());
    expect(new Set(rangees).size, 'un champ figure dans les deux familles').toBe(rangees.length);
  });

  /**
   * ⚠️ LE SEUIL DE CRITICITE RESTE A 8, ET C'EST UN CALCUL, PAS UNE HABITUDE.
   *
   * L'adresse pese desormais 3 (trois champs) au lieu de 1. Pour un client actif
   * le score est multiplie par 1,5 : une adresse totalement absente vaut donc
   * 4,5, et 7,5 avec l'email — sous le seuil. AUCUN client ne devient critique
   * par la seule adresse, ce qui etait le risque du decoupage.
   */
  it('ne rend pas un client critique par la seule absence d adresse', () => {
    const adresse = FIELD_WEIGHT.adresse_ligne1 + FIELD_WEIGHT.code_postal + FIELD_WEIGHT.ville;
    expect(adresse * 1.5).toBeLessThan(CRITICAL_SCORE_THRESHOLD);
    expect((adresse + FIELD_WEIGHT.email) * 1.5).toBeLessThan(CRITICAL_SCORE_THRESHOLD);
  });
});
