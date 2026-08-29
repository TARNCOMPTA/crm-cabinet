import { describe, it, expect } from 'vitest';
import { COLONNES_LISTE, SELECT_LISTE } from './colonnesListe';

/**
 * Le contrat entre la liste de colonnes et la projection PostgREST.
 * ---------------------------------------------------------------------------
 * ⚠️ CES DEUX-LA SONT ECRITS SEPAREMENT, ET C'EST CONTRAINT. `COLONNES_LISTE`
 * donne le TYPE `ClientListe` — c'est lui qui fait tomber au compilateur la
 * lecture d'une colonne non demandee. `SELECT_LISTE` doit rester une chaine
 * LITTERALE, parce que le client PostgREST deduit son type de retour en la
 * lisant : calculee, elle n'aurait que le type `string` et rendrait
 * `GenericStringError[]`.
 *
 * Rien dans le langage ne les oblige donc a s'accorder. C'est le role de ce
 * test : ajouter une colonne d'un seul cote le fait echouer, la ou le defaut se
 * serait sinon manifeste par un champ `undefined` a l'ecran, sans erreur.
 */
describe('colonnes de la liste clients', () => {
  it('la projection commence par exactement les colonnes declarees', () => {
    expect(SELECT_LISTE.startsWith(COLONNES_LISTE.join(','))).toBe(true);
  });

  it('la projection ne demande aucune colonne de plus', () => {
    const [colonnes] = SELECT_LISTE.split(',collaborators:');
    expect(colonnes?.split(',')).toEqual([...COLONNES_LISTE]);
  });

  /**
   * La jointure porte le nom que le code lit (`client.collaborators`) et les
   * quatre champs qu'il affiche. La perdre viderait la colonne « Collab. » sans
   * rien casser par ailleurs.
   */
  it('emporte les collaborateurs rattaches, avec leur profil', () => {
    expect(SELECT_LISTE).toContain('collaborators:client_collaborators(');
    for (const champ of ['id', 'user_id', 'role', 'user:profiles(prenom,nom,avatar_color)']) {
      expect(SELECT_LISTE, champ).toContain(champ);
    }
  });

  /**
   * Le poids est la raison d'etre de tout ceci : `select('*')` rendait 1,11 Mo
   * sur 403 dossiers, dont 203 Ko de `resume_ia`. Ces colonnes-la sont lourdes
   * et cet ecran ne les affiche nulle part.
   */
  it('ne rapatrie aucune des colonnes lourdes que la liste n affiche pas', () => {
    for (const lourde of [
      'resume_ia',
      'description_activite',
      'tva_verif_adresse',
      'tva_verif_nom',
      'habilitation_commentaire',
    ]) {
      expect(COLONNES_LISTE as readonly string[], lourde).not.toContain(lourde);
      expect(SELECT_LISTE, lourde).not.toContain(lourde);
    }
  });
});
