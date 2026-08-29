import { describe, it, expect } from 'vitest';
import { aInserer, type Affectation } from './affectationCollaborateurs';

/**
 * Ce qu'un « ajout » ajoute — et ce qu'il ne retire pas.
 * ---------------------------------------------------------------------------
 * Ce calcul décidait déjà ce qui partait en base, mais il vivait en ligne dans
 * `handleSave` : aucun test ne pouvait l'atteindre. Le défaut qu'il accompagnait
 * est resté invisible d'autant plus longtemps — la fenêtre proposait de retirer
 * un collaborateur dans un mode qui n'a jamais retiré personne, et annonçait un
 * succès.
 *
 * Les cas ci-dessous figent les deux moitiés du contrat : ce qui est inséré, et
 * le fait que RIEN ne l'est en trop.
 */

const roles = (a: Affectation[]) => a.map((x) => [x.user_id, x.role]);

describe('aInserer', () => {
  it('insère tout quand le client n’a aucun collaborateur', () => {
    const r = aInserer([], [
      { user_id: 'u1', role: 'gestionnaire' },
      { user_id: 'u2', role: 'assistant' },
    ]);
    expect(roles(r)).toEqual([
      ['u1', 'gestionnaire'],
      ['u2', 'assistant'],
    ]);
  });

  /** Le cœur du mode : on n’écrase pas, on complète. */
  it('écarte ceux qui sont déjà affectés', () => {
    const r = aInserer([{ user_id: 'u1' }], [
      { user_id: 'u1', role: 'associe' },
      { user_id: 'u2', role: 'assistant' },
    ]);
    expect(roles(r)).toEqual([['u2', 'assistant']]);
  });

  /**
   * ⭐ LE CAS QUI A FAIT LE DÉFAUT. Un utilisateur retire quelqu’un de la liste
   * en mode « Ajouter » : la liste ne contient plus que des gens déjà affectés,
   * donc il n’y a RIEN à insérer. La fonction le dit — tableau vide — et c’est à
   * l’appelant d’en tirer un message honnête plutôt qu’un « mis à jour ».
   */
  it('ne rend rien quand tout le monde est déjà affecté', () => {
    const r = aInserer(
      [{ user_id: 'u1' }, { user_id: 'u2' }],
      [{ user_id: 'u1', role: 'associe' }]
    );
    expect(r).toEqual([]);
  });

  /** Un ajout ne retire jamais : l’absent de la liste souhaitée reste absent du résultat. */
  it('ne propose aucune suppression, même implicite', () => {
    const r = aInserer([{ user_id: 'u1' }, { user_id: 'u2' }], [{ user_id: 'u3', role: null }]);
    expect(roles(r)).toEqual([['u3', null]]);
    // u1 et u2 ne sont mentionnés nulle part : la fonction ne sait pas les retirer.
    expect(r.some((x) => x.user_id === 'u1' || x.user_id === 'u2')).toBe(false);
  });

  it('conserve le rôle demandé, y compris nul', () => {
    const r = aInserer([], [{ user_id: 'u1', role: null }]);
    expect(r).toEqual([{ user_id: 'u1', role: null }]);
  });

  it('conserve l’ordre de choix', () => {
    const r = aInserer([], [
      { user_id: 'c', role: null },
      { user_id: 'a', role: null },
      { user_id: 'b', role: null },
    ]);
    expect(r.map((x) => x.user_id)).toEqual(['c', 'a', 'b']);
  });

  /**
   * ⚠️ La table porte `UNIQUE (client_id, user_id)`. Une répétition ne créerait
   * pas un doublon : elle ferait échouer l’`insert` ENTIER en 23505, emportant
   * les collaborateurs qui n’y étaient pour rien.
   */
  it('dédoublonne une même personne demandée deux fois', () => {
    const r = aInserer([], [
      { user_id: 'u1', role: 'gestionnaire' },
      { user_id: 'u1', role: 'assistant' },
      { user_id: 'u2', role: null },
    ]);
    expect(roles(r)).toEqual([
      ['u1', 'gestionnaire'],
      ['u2', null],
    ]);
  });

  it('ne rend rien pour une liste souhaitée vide', () => {
    expect(aInserer([{ user_id: 'u1' }], [])).toEqual([]);
  });

  /** Les identifiants sont des uuid : la comparaison est exacte, sans normalisation. */
  it('ne rapproche pas deux identifiants différents', () => {
    const r = aInserer([{ user_id: 'U1' }], [{ user_id: 'u1', role: null }]);
    expect(roles(r)).toEqual([['u1', null]]);
  });
});
