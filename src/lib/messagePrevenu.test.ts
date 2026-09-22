/**
 * La phrase affichée après avoir prévenu quelqu'un.
 *
 * Ce qui se joue ici : ne rien affirmer qu'on ne sache. « Prévenu par courriel »
 * est faux quand la personne a coupé ce type de notification, et ne se vérifie
 * pas quand la lecture de ses préférences a échoué.
 */

import { describe, it, expect } from 'vitest';
import { messagePrevenu } from './notificationService';

describe('messagePrevenu', () => {
  it('annonce le courriel quand il partira', () => {
    expect(messagePrevenu('Melanie', true)).toBe('Melanie est prevenu(e) par courriel.');
  });

  /*
    Le cas qui compte : la personne recevra bien la notification dans
    l'application, mais PAS de courriel. Dire « prevenue par courriel » ici
    ferait chercher un message qui n'arrivera jamais.
  */
  it('dit que le courriel ne partira PAS quand la personne l a coupe', () => {
    const m = messagePrevenu('Melanie', false);
    expect(m).toContain('dans l');
    expect(m).toContain('desactive');
    expect(m).not.toMatch(/prevenu\(e\) par courriel/);
  });

  /*
    ⚠️ `null` N'EST PAS `false`. Lecture echouee : on ne sait pas. La phrase ne
    doit alors NI promettre le courriel, NI affirmer qu'il ne partira pas.
  */
  it('ne tranche pas quand on n a pas pu savoir', () => {
    const m = messagePrevenu('Melanie', null);
    expect(m).toBe('Melanie est prevenu(e).');
    expect(m).not.toContain('courriel');
  });

  it('reprend le nom tel qu on le lui donne', () => {
    expect(messagePrevenu('la personne concernee', true)).toContain('la personne concernee');
  });
});
