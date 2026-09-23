import { describe, it, expect } from 'vitest';
import { insererAuCurseur } from './insererAuCurseur';

describe('insererAuCurseur', () => {
  it('insere a l endroit du curseur, pas en fin de texte', () => {
    expect(insererAuCurseur('Bonjour ,', 8, 8, '{{prenom}}')).toEqual({
      texte: 'Bonjour {{prenom}},',
      curseur: 18,
    });
  });

  it('remplace la selection', () => {
    expect(insererAuCurseur('Bonjour Monsieur,', 8, 16, '{{civilite}}').texte).toBe('Bonjour {{civilite}},');
  });

  it('accepte une selection faite a l envers', () => {
    expect(insererAuCurseur('abcdef', 4, 2, 'X').texte).toBe('abXef');
  });

  /* Un champ jamais focalise peut rendre `null` : on ajoute en fin, sans lever. */
  it('insere en fin quand la position est inconnue', () => {
    expect(insererAuCurseur('Bonjour', null, undefined, ' !')).toEqual({ texte: 'Bonjour !', curseur: 9 });
  });

  it('ramene dans le texte une position qui le depasse', () => {
    expect(insererAuCurseur('abc', 99, 120, 'X')).toEqual({ texte: 'abcX', curseur: 4 });
    expect(insererAuCurseur('abc', -5, -1, 'X')).toEqual({ texte: 'Xabc', curseur: 1 });
  });

  it('fonctionne sur un champ vide', () => {
    expect(insererAuCurseur('', 0, 0, '{{ville}}')).toEqual({ texte: '{{ville}}', curseur: 9 });
  });
});
