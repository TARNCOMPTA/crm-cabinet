import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { acquitter, consommer } from './limiteur';

/**
 * Le compteur d'essais.
 *
 * Il protège trois portes qui s'ouvrent avec un secret — connexion par passkey,
 * code d'enrôlement, clé du connecteur MCP — et aucune ne comptait les
 * tentatives. Ce qu'on vérifie ici tient en trois points : il laisse passer le
 * quota, il refuse au-delà, et il n'enferme pas un utilisateur légitime.
 */

const BORNES = { max: 3, fenetreMs: 60_000 };

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-08-02T10:00:00Z'));
});

afterEach(() => {
  vi.useRealTimers();
});

describe('consommer', () => {
  it('laisse passer le quota, puis refuse', () => {
    expect(consommer('a', BORNES)).toBe(true);
    expect(consommer('a', BORNES)).toBe(true);
    expect(consommer('a', BORNES)).toBe(true);
    expect(consommer('a', BORNES)).toBe(false);
    expect(consommer('a', BORNES)).toBe(false);
  });

  it('compte chaque adresse séparément', () => {
    for (let i = 0; i < 5; i++) consommer('bloquee', BORNES);
    expect(consommer('bloquee', BORNES)).toBe(false);
    // Une autre adresse ne doit pas payer pour la première.
    expect(consommer('innocente', BORNES)).toBe(true);
  });

  it('rouvre à la fenêtre suivante', () => {
    for (let i = 0; i < 5; i++) consommer('b', BORNES);
    expect(consommer('b', BORNES)).toBe(false);

    vi.advanceTimersByTime(BORNES.fenetreMs + 1);
    expect(consommer('b', BORNES)).toBe(true);
  });
});

describe('acquitter', () => {
  /**
   * Le point qui évite l'auto-blocage : un cabinet entier travaille souvent
   * derrière une seule adresse publique. Sans remise à zéro sur succès, les
   * connexions légitimes de la matinée finiraient par fermer la porte.
   */
  it('rend son crédit après une authentification réussie', () => {
    consommer('c', BORNES);
    consommer('c', BORNES);
    acquitter('c');

    expect(consommer('c', BORNES)).toBe(true);
    expect(consommer('c', BORNES)).toBe(true);
    expect(consommer('c', BORNES)).toBe(true);
    expect(consommer('c', BORNES)).toBe(false);
  });
});
