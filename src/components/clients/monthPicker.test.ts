import { describe, it, expect } from 'vitest';
import { MOIS_CLOTURE, libelleMois } from './MonthPicker';

describe('MOIS_CLOTURE', () => {
  it('porte les douze mois, DECEMBRE EN TETE', () => {
    // L'ordre n'est pas un oubli : decembre est la cloture de la grande
    // majorite des dossiers, et le mettre en premier evite de derouler toute
    // la liste pour le cas courant.
    expect(MOIS_CLOTURE).toHaveLength(12);
    expect(MOIS_CLOTURE[0]).toEqual({ value: '12', label: 'Décembre' });
    expect(new Set(MOIS_CLOTURE.map((m) => m.value)).size).toBe(12);
  });

  it('porte les accents', () => {
    // ⚠️ `/i` est insensible a la CASSE, JAMAIS aux ACCENTS. Un libelle sans
    // accent se reintroduit sans bruit ; ici, il fait tomber ce cas.
    const libelles = MOIS_CLOTURE.map((m) => m.label);
    expect(libelles).toContain('Février');
    expect(libelles).toContain('Août');
    expect(libelles).toContain('Décembre');
  });
});

describe('libelleMois', () => {
  it('rend le libelle d un numero de mois', () => {
    expect(libelleMois('01')).toBe('Janvier');
    expect(libelleMois('06')).toBe('Juin');
    expect(libelleMois('12')).toBe('Décembre');
  });

  it('rend undefined pour ce qui n est pas un mois', () => {
    // La fiche affiche alors « - ». Un mois faux vaut mieux absent qu'invente.
    expect(libelleMois('00')).toBeUndefined();
    expect(libelleMois('13')).toBeUndefined();
    expect(libelleMois('')).toBeUndefined();
    expect(libelleMois('6')).toBeUndefined();
  });
});
