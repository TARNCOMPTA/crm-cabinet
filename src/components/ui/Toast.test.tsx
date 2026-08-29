import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup, act } from '@testing-library/react';
import { ToastProvider, useToast } from '../../contexts/ToastContext';
import { ToastContainer } from './Toast';

/**
 * Ce que ce fichier garde : un bandeau est ANNONCÉ, et une barre de progression
 * ne l'est pas. Le second point compte autant que le premier — une region live
 * posee sur un compteur qui defile rend le logiciel inutilisable au lecteur
 * d'ecran.
 */

afterEach(cleanup);

let api: ReturnType<typeof useToast>;
function Prise() {
  api = useToast();
  return null;
}

function monter() {
  render(
    <ToastProvider>
      <Prise />
      <ToastContainer />
    </ToastProvider>
  );
}

describe('ToastContainer', () => {
  it('existe AVANT tout message : une region live creee avec son contenu n annonce rien', () => {
    monter();
    const region = screen.getByRole('region', { name: 'Notifications' });
    expect(region).toHaveAttribute('aria-live', 'polite');
    // Chaque bandeau est annonce pour lui-meme, pas la pile entiere a chaque
    // fois : sinon trois notifications de suite se liraient trois fois.
    expect(region).toHaveAttribute('aria-atomic', 'false');
    expect(region).toBeEmptyDOMElement();
  });

  it('annonce une reussite poliment', () => {
    monter();
    act(() => api.showToast('Affectations mises a jour', 'success'));
    expect(screen.getByRole('status')).toHaveTextContent('Affectations mises a jour');
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('interrompt pour une erreur et pour un avertissement', () => {
    monter();
    act(() => api.showToast('Droits insuffisants', 'error'));
    expect(screen.getByRole('alert')).toHaveTextContent('Droits insuffisants');

    act(() => api.showToast('Attention', 'warning'));
    expect(screen.getAllByRole('alert')).toHaveLength(2);
  });

  /**
   * ⚠️ LE CAS QUI FERAIT PLUS DE MAL QUE DE BIEN. `updateProgress` est appele
   * une fois par piece traitee. Sous une region live, chacun de ces passages
   * serait annonce.
   */
  it('ne fait annoncer aucune progression, meme apres cent mises a jour', () => {
    monter();
    let id = '';
    act(() => { id = api.startProgress('Recuperation', 100); });
    for (let i = 1; i <= 100; i += 1) act(() => api.updateProgress(id, i));

    expect(screen.queryByRole('status')).toBeNull();
    expect(screen.queryByRole('alert')).toBeNull();
    const bandeau = screen.getByText('Recuperation').closest('div[aria-live]');
    expect(bandeau).toHaveAttribute('aria-live', 'off');
    // Le compteur est bien affiche : c'est l'annonce qu'on tait, pas l'ecran.
    expect(screen.getByText('100 / 100')).toBeInTheDocument();
  });

  it('annonce en revanche le bandeau de fin, qui n est plus une progression', () => {
    monter();
    let id = '';
    act(() => { id = api.startProgress('Recuperation', 2); });
    act(() => api.finishProgress(id, '2 pieces recuperees', 'success'));

    expect(screen.getByRole('status')).toHaveTextContent('2 pieces recuperees');
  });
});
