import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { useState } from 'react';
import { Modal } from './Modal';

/**
 * Ce que ce fichier garde : une fenêtre s'annonce, retient le clavier, se ferme
 * sur Échap, et rend le focus d'où il venait. Aucun de ces quatre points ne se
 * voit à l'écran — c'est exactement pourquoi ils manquaient tous les quatre.
 */

afterEach(cleanup);

function Exemple({ onClose = () => {} }: { onClose?: () => void }) {
  return (
    <Modal isOpen onClose={onClose} title="Gerer les affectations">
      <input aria-label="Recherche" />
      <button type="button">Annuler</button>
      <button type="button">Sauvegarder</button>
    </Modal>
  );
}

const dialogue = () => screen.getByRole('dialog');
const focalisables = () => [
  screen.getByRole('button', { name: 'Fermer' }),
  screen.getByLabelText('Recherche'),
  screen.getByRole('button', { name: 'Annuler' }),
  screen.getByRole('button', { name: 'Sauvegarder' }),
];

describe('Modal — ce qui est annonce', () => {
  it('est un dialogue modal, et porte le nom de son titre', () => {
    render(<Exemple />);
    const d = dialogue();
    expect(d).toHaveAttribute('aria-modal', 'true');
    expect(d).toHaveAccessibleName('Gerer les affectations');
  });

  it('donne un nom au bouton de fermeture, qui n a qu une icone', () => {
    render(<Exemple />);
    expect(screen.getByRole('button', { name: 'Fermer' })).toBeInTheDocument();
  });
});

describe('Modal — le clavier', () => {
  it('porte le focus dans la fenetre a l ouverture, et non derriere', () => {
    render(<Exemple />);
    expect(dialogue()).toHaveFocus();
  });

  it('ferme sur Echap', () => {
    const onClose = vi.fn();
    render(<Exemple onClose={onClose} />);
    fireEvent.keyDown(dialogue(), { key: 'Escape' });
    expect(onClose).toHaveBeenCalledOnce();
  });

  /**
   * ⚠️ LE CAS QUI JUSTIFIE DE NE PAS ECOUTER `document`. Un `SearchableSelect`
   * ouvert dans la fenetre se ferme sur Echap et appelle `preventDefault()`. La
   * fenetre ne doit PAS se fermer aussi : l'utilisateur voulait refermer la
   * liste, pas abandonner sa saisie.
   */
  it('ne ferme pas sur un Echap deja traite en dessous', () => {
    const onClose = vi.fn();
    render(
      <Modal isOpen onClose={onClose} title="Avec une liste">
        <input
          aria-label="Choix"
          onKeyDown={(e) => { if (e.key === 'Escape') e.preventDefault(); }}
        />
      </Modal>
    );
    fireEvent.keyDown(screen.getByLabelText('Choix'), { key: 'Escape' });
    expect(onClose).not.toHaveBeenCalled();
  });

  it('boucle la tabulation du dernier vers le premier', () => {
    render(<Exemple />);
    const cibles = focalisables();
    const dernier = cibles[cibles.length - 1];
    dernier.focus();

    fireEvent.keyDown(dernier, { key: 'Tab' });

    expect(cibles[0]).toHaveFocus();
  });

  it('boucle la tabulation arriere du premier vers le dernier', () => {
    render(<Exemple />);
    const cibles = focalisables();
    cibles[0].focus();

    fireEvent.keyDown(cibles[0], { key: 'Tab', shiftKey: true });

    expect(cibles[cibles.length - 1]).toHaveFocus();
  });

  it('fait entrer la premiere tabulation depuis la boite dans le contenu', () => {
    render(<Exemple />);
    expect(dialogue()).toHaveFocus();

    fireEvent.keyDown(dialogue(), { key: 'Tab' });

    expect(focalisables()[0]).toHaveFocus();
  });

  it('laisse passer une tabulation au milieu de la fenetre', () => {
    render(<Exemple />);
    const [, recherche] = focalisables();
    recherche.focus();

    // Ni premier ni dernier : le navigateur fait son travail, on ne touche a
    // rien. Le focus ne bouge donc pas dans jsdom, qui n'implemente pas Tab.
    fireEvent.keyDown(recherche, { key: 'Tab' });

    expect(recherche).toHaveFocus();
  });
});

describe('Modal — le focus rendu', () => {
  function AvecDeclencheur() {
    const [ouvert, setOuvert] = useState(false);
    return (
      <>
        <button type="button" onClick={() => setOuvert(true)}>Ouvrir</button>
        <Modal isOpen={ouvert} onClose={() => setOuvert(false)} title="Une fenetre">
          <button type="button">Dedans</button>
        </Modal>
      </>
    );
  }

  it('revient sur le bouton qui l avait ouverte', () => {
    render(<AvecDeclencheur />);
    const declencheur = screen.getByRole('button', { name: 'Ouvrir' });
    declencheur.focus();
    fireEvent.click(declencheur);

    expect(screen.getByRole('dialog')).toHaveFocus();

    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });

    expect(screen.queryByRole('dialog')).toBeNull();
    // Sans cette restitution, le focus repart sur <body> et la tabulation
    // suivante recommence au tout debut de la page.
    expect(declencheur).toHaveFocus();
  });
});

describe('Modal — le defilement de l arriere-plan', () => {
  /**
   * ⚠️ UNE CONFIRMATION PAR-DESSUS UN FORMULAIRE. L'ancienne version remettait
   * `overflow` a `unset` a la fermeture de la premiere fenetre venue : la page
   * se remettait a defiler sous le voile de celle qui restait ouverte.
   */
  it('ne rend le defilement qu a la fermeture de la DERNIERE fenetre', () => {
    const { rerender } = render(
      <>
        <Modal isOpen onClose={() => {}} title="Formulaire"><button type="button">a</button></Modal>
        <Modal isOpen onClose={() => {}} title="Confirmation"><button type="button">b</button></Modal>
      </>
    );
    expect(document.body.style.overflow).toBe('hidden');

    rerender(
      <>
        <Modal isOpen onClose={() => {}} title="Formulaire"><button type="button">a</button></Modal>
        <Modal isOpen={false} onClose={() => {}} title="Confirmation"><button type="button">b</button></Modal>
      </>
    );
    expect(document.body.style.overflow).toBe('hidden');

    rerender(
      <>
        <Modal isOpen={false} onClose={() => {}} title="Formulaire"><button type="button">a</button></Modal>
        <Modal isOpen={false} onClose={() => {}} title="Confirmation"><button type="button">b</button></Modal>
      </>
    );
    expect(document.body.style.overflow).toBe('unset');
  });
});
