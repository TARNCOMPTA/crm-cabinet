import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { Tabs, TabsList, TabsTrigger, TabsContent } from './Tabs';

/**
 * Ce que ce fichier garde.
 * ---------------------------------------------------------------------------
 * Les onglets étaient des `<button>` sans rôle : rien ne cassait, et rien
 * n'était annoncé. Un défaut de cette nature ne se voit pas à l'écran — seul un
 * test peut le retenir. Chaque cas ci-dessous a été vérifié en le cassant
 * d'abord : retirer `role="tab"`, retirer le `tabIndex` roulant, retirer le
 * filet — les trois font tomber une assertion et une seule.
 */

function Exemple({ valeur, sansTroisieme = false }: { valeur?: string; sansTroisieme?: boolean }) {
  return (
    <Tabs defaultValue="un" value={valeur}>
      <TabsList aria-label="Onglets d'essai">
        <TabsTrigger value="un">Premier</TabsTrigger>
        <TabsTrigger value="deux">Deuxieme</TabsTrigger>
        {!sansTroisieme && <TabsTrigger value="trois">Troisieme</TabsTrigger>}
      </TabsList>
      <TabsContent value="un">Contenu un</TabsContent>
      <TabsContent value="deux">Contenu deux</TabsContent>
      <TabsContent value="trois">Contenu trois</TabsContent>
    </Tabs>
  );
}

const ongletsRendus = () => within(screen.getByRole('tablist')).getAllByRole('tab');

describe('Tabs — ce qu un lecteur d ecran percoit', () => {
  it('annonce un groupe, ses onglets, et lequel est choisi', () => {
    render(<Exemple />);

    const liste = screen.getByRole('tablist');
    expect(liste).toHaveAccessibleName("Onglets d'essai");
    expect(within(liste).getAllByRole('tab')).toHaveLength(3);

    // `{ selected: true }` n'interroge que `aria-selected` : sans l'attribut,
    // cette requete ne trouve rien, quelle que soit la couleur du bouton.
    expect(screen.getByRole('tab', { selected: true })).toHaveTextContent('Premier');
    expect(screen.getByRole('tab', { name: 'Deuxieme' })).toHaveAttribute('aria-selected', 'false');
  });

  it('lie l onglet actif a son panneau, dans les deux sens', () => {
    render(<Exemple />);

    const actif = screen.getByRole('tab', { selected: true });
    const panneau = screen.getByRole('tabpanel');

    expect(panneau).toHaveTextContent('Contenu un');
    expect(actif.getAttribute('aria-controls')).toBe(panneau.id);
    expect(panneau.getAttribute('aria-labelledby')).toBe(actif.id);
    expect(panneau).toHaveAccessibleName('Premier');
  });

  it('ne fait pointer aucun aria-controls vers un panneau demonte', () => {
    render(<Exemple />);

    // Les panneaux inactifs ne sont pas dans le document : une reference vers
    // leur identifiant serait une promesse creuse.
    expect(screen.getAllByRole('tabpanel')).toHaveLength(1);
    for (const onglet of ongletsRendus()) {
      const cible = onglet.getAttribute('aria-controls');
      if (cible === null) continue;
      expect(document.getElementById(cible)).not.toBeNull();
    }
  });

  it('donne des identifiants distincts a deux jeux d onglets coexistants', () => {
    render(
      <>
        <Exemple />
        <Exemple />
      </>
    );

    const [a, b] = screen.getAllByRole('tabpanel');
    expect(a.id).not.toBe(b.id);
    const [ongletA, ongletB] = screen.getAllByRole('tab', { selected: true });
    expect(ongletA.getAttribute('aria-controls')).toBe(a.id);
    expect(ongletB.getAttribute('aria-controls')).toBe(b.id);
  });
});

describe('Tabs — le clavier', () => {
  it('ne laisse que l onglet actif dans l ordre de tabulation', () => {
    render(<Exemple />);
    const [un, deux, trois] = ongletsRendus();

    expect(un.tabIndex).toBe(0);
    expect(deux.tabIndex).toBe(-1);
    expect(trois.tabIndex).toBe(-1);
  });

  it('la fleche droite selectionne le suivant ET y porte le focus', () => {
    render(<Exemple />);
    const [un] = ongletsRendus();
    un.focus();

    fireEvent.keyDown(un, { key: 'ArrowRight' });

    const actif = screen.getByRole('tab', { selected: true });
    expect(actif).toHaveTextContent('Deuxieme');
    expect(actif).toHaveFocus();
    expect(actif.tabIndex).toBe(0);
    expect(screen.getByRole('tabpanel')).toHaveTextContent('Contenu deux');
  });

  it('boucle aux deux extremites, et Home / End vont au bout', () => {
    render(<Exemple />);
    const onglets = ongletsRendus();

    onglets[0].focus();
    fireEvent.keyDown(onglets[0], { key: 'ArrowLeft' });
    expect(screen.getByRole('tab', { selected: true })).toHaveTextContent('Troisieme');

    fireEvent.keyDown(document.activeElement!, { key: 'ArrowRight' });
    expect(screen.getByRole('tab', { selected: true })).toHaveTextContent('Premier');

    fireEvent.keyDown(document.activeElement!, { key: 'End' });
    expect(screen.getByRole('tab', { selected: true })).toHaveTextContent('Troisieme');

    fireEvent.keyDown(document.activeElement!, { key: 'Home' });
    expect(screen.getByRole('tab', { selected: true })).toHaveTextContent('Premier');
  });

  it('laisse passer les touches qui ne sont pas les siennes', () => {
    render(<Exemple />);
    const [un] = ongletsRendus();
    un.focus();

    fireEvent.keyDown(un, { key: 'ArrowDown' });
    fireEvent.keyDown(un, { key: 'a' });

    expect(screen.getByRole('tab', { selected: true })).toHaveTextContent('Premier');
  });

  it('trouve la fleche meme depuis une icone a l interieur du bouton', () => {
    render(
      <Tabs defaultValue="un">
        <TabsList>
          <TabsTrigger value="un"><span data-testid="icone">*</span>Premier</TabsTrigger>
          <TabsTrigger value="deux">Deuxieme</TabsTrigger>
        </TabsList>
        <TabsContent value="un">Contenu un</TabsContent>
        <TabsContent value="deux">Contenu deux</TabsContent>
      </Tabs>
    );

    fireEvent.keyDown(screen.getByTestId('icone'), { key: 'ArrowRight' });
    expect(screen.getByRole('tab', { selected: true })).toHaveTextContent('Deuxieme');
  });

  /**
   * ⚠️ LE CAS QUI RENDRAIT CETTE CORRECTION NUISIBLE.
   *
   * `value` designe un onglet qui n'existe pas — un onglet conditionnel disparu
   * alors qu'il etait ouvert. Sans filet, aucun onglet ne porte `tabIndex = 0`
   * et le groupe entier sort de l'ordre de tabulation : le clavier ne peut plus
   * l'atteindre du tout, alors qu'avant cette correction il le pouvait.
   */
  it('garde un onglet atteignable quand l onglet actif n existe plus', () => {
    const { rerender } = render(<Exemple valeur="trois" />);
    expect(screen.getByRole('tab', { selected: true })).toHaveTextContent('Troisieme');

    rerender(<Exemple valeur="trois" sansTroisieme />);

    const onglets = ongletsRendus();
    expect(onglets).toHaveLength(2);
    expect(screen.queryByRole('tab', { selected: true })).toBeNull();
    expect(onglets.filter((o) => o.tabIndex === 0)).toHaveLength(1);
    expect(onglets[0].tabIndex).toBe(0);
  });
});
