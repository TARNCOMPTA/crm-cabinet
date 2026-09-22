import { describe, it, expect } from 'vitest';
import { nomAffichable } from './nomAffichable';

describe('nomAffichable', () => {
  it('prefere le nom choisi par la personne', () => {
    expect(
      nomAffichable({ display_name: 'Mel', prenom: 'Melanie', nom: 'Doolaeghe' })
    ).toBe('Mel');
  });

  it('compose « Prenom Nom » quand il n y a pas de nom choisi', () => {
    expect(nomAffichable({ prenom: 'Melanie', nom: 'Doolaeghe' })).toBe('Melanie Doolaeghe');
  });

  it('se contente de ce qui existe quand l un des deux manque', () => {
    expect(nomAffichable({ prenom: 'Melanie', nom: null })).toBe('Melanie');
    expect(nomAffichable({ prenom: null, nom: 'Doolaeghe' })).toBe('Doolaeghe');
  });

  /*
    Le piege que ferme ce cas : un prenom reduit a des espaces passerait un
    `filter(Boolean)` pose AVANT le `trim`, et donnerait « " " Doolaeghe » —
    avec sa double espace visible dans le message.
  */
  it('ne laisse pas une double espace quand un champ n est que du blanc', () => {
    expect(nomAffichable({ prenom: '   ', nom: 'Doolaeghe' })).toBe('Doolaeghe');
  });

  it('retombe sur l adresse quand aucun nom n est renseigne', () => {
    expect(nomAffichable({ email: 'melanie@tarncompta.fr' })).toBe('melanie@tarncompta.fr');
  });

  /*
    ⚠️ JAMAIS DE CHAINE VIDE. « a ete prevenu » sans nom se lit comme un defaut
    d'affichage, alors que c'est une fiche incomplete.
  */
  it('rend toujours quelque chose de lisible, meme sur un profil vide', () => {
    expect(nomAffichable({})).toBe('la personne concernee');
    expect(nomAffichable(null)).toBe('la personne concernee');
    expect(nomAffichable(undefined)).toBe('la personne concernee');
    expect(nomAffichable({ prenom: '  ', nom: '  ', display_name: ' ', email: ' ' })).toBe(
      'la personne concernee'
    );
  });
});
