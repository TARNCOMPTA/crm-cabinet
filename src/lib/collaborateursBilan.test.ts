import { describe, it, expect } from 'vitest';
import { initiales, nomComplet, vignettesDuBilan } from './collaborateursBilan';

const AYMERIC = { prenom: 'Aymeric', nom: 'Hebrard', avatar_color: '#7C2D5E' };
const VANESSA = { prenom: 'Vanessa', nom: 'Sirven', avatar_color: null };

describe('initiales', () => {
  it('prend la premiere lettre du prenom et du nom', () => {
    expect(initiales(AYMERIC)).toBe('AH');
    expect(initiales(VANESSA)).toBe('VS');
  });

  it('retombe sur display_name quand le compte n a ni prenom ni nom', () => {
    expect(initiales({ display_name: 'Cabinet Tarn Compta' })).toBe('CC');
    expect(initiales({ display_name: 'Robot' })).toBe('RO');
  });

  it('rend « ? » plutot qu une vignette vide pour un compte sans aucun nom', () => {
    // Une pastille vide se lit comme un defaut d'affichage ; « ? » se lit comme
    // une fiche incomplete, ce qui est la verite.
    expect(initiales({})).toBe('?');
    expect(initiales(null)).toBe('?');
  });

  it('garde les accents en majuscule', () => {
    expect(initiales({ prenom: 'Elodie', nom: 'Emery' })).toBe('EE');
    expect(initiales({ prenom: 'Élodie', nom: 'Émery' })).toBe('ÉÉ');
  });
});

describe('nomComplet', () => {
  it('prefere prenom + nom a display_name', () => {
    expect(nomComplet({ prenom: 'Aymeric', nom: 'Hebrard', display_name: 'ah' })).toBe('Aymeric Hebrard');
  });

  it('se contente du prenom quand le nom manque', () => {
    expect(nomComplet({ prenom: 'Aymeric' })).toBe('Aymeric');
  });
});

describe('vignettesDuBilan', () => {
  it('rend une vignette par personne affectee au dossier', () => {
    const v = vignettesDuBilan(
      [
        { user_id: 'u-vanessa', role: 'paie', user: VANESSA },
        { user_id: 'u-aymeric', role: 'principal', user: AYMERIC },
      ],
      null
    );
    expect(v.map((x) => x.initiales)).toEqual(['AH', 'VS']);
    expect(v.map((x) => x.role)).toEqual(['principal', 'paie']);
  });

  it('classe l equipe par ordre alphabetique', () => {
    const v = vignettesDuBilan(
      [
        { user_id: 'u-z', user: { prenom: 'Zoe', nom: 'Zunino' } },
        { user_id: 'u-e', user: { prenom: 'Elodie', nom: 'Emery' } },
        { user_id: 'u-a', user: AYMERIC },
      ],
      null
    );
    expect(v.map((x) => x.nomComplet)).toEqual(['Aymeric Hebrard', 'Elodie Emery', 'Zoe Zunino']);
  });

  it('met le responsable du bilan en tete et le marque', () => {
    const v = vignettesDuBilan(
      [
        { user_id: 'u-aymeric', role: 'principal', user: AYMERIC },
        { user_id: 'u-vanessa', role: 'paie', user: VANESSA },
      ],
      { id: 'u-vanessa' }
    );
    expect(v.map((x) => x.initiales)).toEqual(['VS', 'AH']);
    expect(v.map((x) => x.responsableBilan)).toEqual([true, false]);
  });

  it('n affiche jamais deux fois la meme personne', () => {
    const v = vignettesDuBilan(
      [{ user_id: 'u-aymeric', role: 'principal', user: AYMERIC }],
      { id: 'u-aymeric', prenom: 'Aymeric', nom: 'Hebrard' }
    );
    expect(v).toHaveLength(1);
    expect(v[0].responsableBilan).toBe(true);
    // Le role vient de la ligne d'equipe, pas du responsable : c'est la seule
    // des deux sources qui le porte.
    expect(v[0].role).toBe('principal');
  });

  it('donne au responsable la couleur de sa ligne d equipe', () => {
    // Sinon la meme personne aurait deux couleurs selon l'ecran, ce qui se lit
    // comme deux personnes.
    const [aymeric] = vignettesDuBilan(
      [{ user_id: 'u-aymeric', role: 'principal', user: AYMERIC }],
      { id: 'u-aymeric', prenom: 'Aymeric', nom: 'Hebrard', avatar_color: '#000000' }
    );
    expect(aymeric.couleur).toBe('#7C2D5E');
  });

  it('affiche le responsable meme s il n est pas affecte au dossier', () => {
    // Un renfort de saison, un associe qui reprend un retard : il pilote le
    // bilan sans etre dans l'equipe du dossier. L'omettre le rendrait invisible
    // sur sa propre carte.
    const v = vignettesDuBilan(
      [{ user_id: 'u-vanessa', role: 'paie', user: VANESSA }],
      { id: 'u-renfort', prenom: 'Remi', nom: 'Fort' }
    );
    expect(v.map((x) => x.initiales)).toEqual(['RF', 'VS']);
    expect(v[0].role).toBeNull();
    expect(v[0].responsableBilan).toBe(true);
  });

  it('rend une liste vide quand personne n est affecte', () => {
    expect(vignettesDuBilan(null, null)).toEqual([]);
    expect(vignettesDuBilan([], undefined)).toEqual([]);
  });

  it('ignore une ligne d affectation sans utilisateur', () => {
    // `client_collaborators.user_id` est NOT NULL, mais la jointure sur
    // `profiles` peut ne rien rendre si le compte a ete supprime.
    const v = vignettesDuBilan(
      [
        { user_id: 'u-fantome', role: 'paie', user: null },
        { user_id: 'u-aymeric', role: 'principal', user: AYMERIC },
      ],
      null
    );
    expect(v.map((x) => x.nomComplet)).toEqual(['Aymeric Hebrard', 'Utilisateur']);
    expect(v.map((x) => x.initiales)).toEqual(['AH', '?']);
  });

  it('donne une couleur stable a chaque personne', () => {
    const [sansCouleur] = vignettesDuBilan([{ user_id: 'u-vanessa', user: VANESSA }], null);
    const [encore] = vignettesDuBilan([{ user_id: 'u-vanessa', user: VANESSA }], null);
    expect(sansCouleur.couleur).toBe(encore.couleur);
    expect(sansCouleur.couleur).toMatch(/^#[0-9A-F]{6}$/i);
  });
});
