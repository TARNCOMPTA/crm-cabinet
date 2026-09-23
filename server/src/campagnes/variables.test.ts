import { describe, it, expect } from 'vitest';
import { VARIABLES_CAMPAGNE, colonnesVariables, valeurVariable } from './variables';
import { construireCourriel, nettoyerSujet, substituer, substituerTexte } from './gabarit';

/**
 * Les variables des campagnes.
 * ---------------------------------------------------------------------------
 * Les trois premiers blocs reproduisent les trois défauts relevés le 2026-09-23,
 * tous trois en production et tous trois muets : une exception sur les dates, un
 * code technique à la place du régime, et un sujet échappé comme du HTML.
 */

const CLIENT = {
  id: '11111111-1111-1111-1111-111111111111',
  nom_entreprise: "L'Atelier Dupont & Fils",
  email: 'contact@atelier.invalid',
  email_2: null,
  dirigeant: 'M. Jean Dupont',
  numero_dossier: 'C-2024-018',
  regime_fiscal: 'IS_REEL',
  date_cloture: '2026-12-31',
  date_creation_entreprise: '2011-04-12',
  capital_social: '50000',
  ville: 'Albi',
};

const REGIMES = { libellesRegimes: new Map([['IS_REEL', 'IS réel normal']]) };

describe('les dates', () => {
  /*
    ⚠️ LE DEFAUT D'ORIGINE. node-pg rend une colonne `date` en objet `Date`, et
    l'echappement appelait `.replace` dessus : « v.replace is not a function ».
    La route lit desormais les dates en texte ; ce cas prouve que meme un objet
    `Date` oublie par un appelant ne fait plus tomber l'envoi.
  */
  it('ne leve plus sur un objet Date, et rend le bon jour', () => {
    const c = { ...CLIENT, date_cloture: new Date(2026, 11, 31) };
    expect(() => substituer('{{date_cloture}}', c)).not.toThrow();
    expect(substituer('{{date_cloture}}', c)).toBe('31/12/2026');
  });

  it('ecrit une date en francais, JJ/MM/AAAA', () => {
    expect(valeurVariable('date_cloture', CLIENT)).toBe('31/12/2026');
    expect(valeurVariable('date_creation', CLIENT)).toBe('12/04/2011');
  });

  it('lit la chaine sans passer par new Date — aucun decalage de fuseau', () => {
    // `new Date('2026-01-01')` est minuit UTC : le 31 decembre dans un fuseau a
    // l'ouest de Greenwich. La chaine, elle, dit le 1er janvier partout.
    expect(valeurVariable('date_cloture', { ...CLIENT, date_cloture: '2026-01-01' })).toBe('01/01/2026');
  });

  it('dit le mois en toutes lettres, en minuscules, pour une phrase', () => {
    expect(valeurVariable('mois_cloture', CLIENT)).toBe('décembre');
    expect(valeurVariable('mois_cloture', { ...CLIENT, date_cloture: '2026-08-31' })).toBe('août');
  });

  /* Mieux vaut un blanc dans une phrase qu'une date fausse dans une lettre. */
  it('rend vide une date qu il ne sait pas lire, plutot que de la deviner', () => {
    for (const d of ['31/12/2026', 'demain', '2026-13-01', 42]) {
      expect(valeurVariable('date_cloture', { ...CLIENT, date_cloture: d }), String(d)).toBe('');
    }
  });
});

describe('le regime fiscal', () => {
  /* ⚠️ Le courriel imprimait `IS_REEL` : le code stocke, pas le libelle. */
  it('ecrit le libelle que le cabinet a donne, pas le code stocke', () => {
    expect(valeurVariable('regime_fiscal', CLIENT, REGIMES)).toBe('IS réel normal');
  });

  /*
    Un code absent de la table s'imprime BRUT : visiblement technique, il
    signale a l'apercu qu'un regime manque dans les reglages. Le remplacer par
    un blanc le cacherait.
  */
  it('garde le code quand la table ne le connait pas', () => {
    expect(valeurVariable('regime_fiscal', { ...CLIENT, regime_fiscal: 'BNC_DC' }, REGIMES)).toBe('BNC_DC');
    expect(valeurVariable('regime_fiscal', CLIENT)).toBe('IS_REEL');
  });
});

describe('le sujet', () => {
  /*
    ⚠️ LE DEFAUT D'ORIGINE. Le sujet passait par `substituer`, qui echappe pour
    le HTML : « L'Atelier Dupont & Fils » arrivait ecrit `L&#39;Atelier Dupont
    &amp; Fils` dans la boite de reception. Constate en rendant le sujet d'une
    fiche du harnais.
  */
  it('arrive tel qu il s ecrit, apostrophe et esperluette comprises', () => {
    const sujet = nettoyerSujet(substituerTexte('Votre TVA — {{nom_entreprise}}', CLIENT));
    expect(sujet).toBe("Votre TVA — L'Atelier Dupont & Fils");
    expect(sujet).not.toContain('&#39;');
    expect(sujet).not.toContain('&amp;');
  });

  /*
    Ne plus echapper ne veut pas dire ne plus proteger : c'est un en-tete SMTP,
    et le danger y est le retour chariot. `nettoyerSujet` passe APRES.
  */
  it('reste protege contre l injection d en-tete', () => {
    const c = { ...CLIENT, nom_entreprise: 'Piege\r\nBcc: tiers@exemple.invalid' };
    const sujet = nettoyerSujet(substituerTexte('Bonjour {{nom_entreprise}}', c));
    expect(sujet).not.toMatch(/[\r\n]/);
  });
});

describe('le corps reste echappe', () => {
  /*
    Le sujet ne s'echappe plus ; le corps, SI. Une raison sociale contenant du
    balisage ne doit toujours rien injecter dans le courriel.
  */
  it('echappe une valeur inseree dans le corps', () => {
    const c = { ...CLIENT, nom_entreprise: '<img src=x onerror=alert(1)>' };
    const html = construireCourriel({
      corps: 'Bonjour {{nom_entreprise}}',
      client: c,
      urlDesinscription: 'https://exemple.invalid/d',
      nomCabinet: 'Cabinet',
    });
    expect(html).not.toContain('<img');
    expect(html).toContain('&lt;img');
  });

  it('porte le libelle du regime jusque dans le courriel', () => {
    const html = construireCourriel({
      corps: 'Votre regime : {{regime_fiscal}}',
      client: CLIENT,
      urlDesinscription: 'https://exemple.invalid/d',
      nomCabinet: 'Cabinet',
      contexte: REGIMES,
    });
    expect(html).toContain('IS réel normal');
    expect(html).not.toContain('IS_REEL');
  });
});

describe('les autres formats', () => {
  it('ecrit un capital en euros, a la francaise', () => {
    const v = valeurVariable('capital_social', CLIENT)!;
    // Les espaces de `fr-FR` sont insecables (U+202F) : on les normalise pour comparer.
    expect(v.replace(/\s/g, ' ')).toBe('50 000 €');
    expect(valeurVariable('capital_social', { ...CLIENT, capital_social: '1500.5' })!.replace(/\s/g, ' ')).toBe('1 500,50 €');
  });

  it('rend vide un capital qui n est pas un nombre, jamais « NaN € »', () => {
    expect(valeurVariable('capital_social', { ...CLIENT, capital_social: 'dix mille' })).toBe('');
  });
});

describe('inconnu et absent ne se confondent pas', () => {
  /* Un inconnu reste visible a l'apercu, pour se corriger avant l'envoi. */
  it('laisse une variable inconnue ecrite telle quelle', () => {
    expect(valeurVariable('dirigeant2', CLIENT)).toBeNull();
    expect(substituer('Bonjour {{dirigeant2}}', CLIENT)).toBe('Bonjour {{dirigeant2}}');
  });

  /* Un absent disparait : pas de « Bonjour {{dirigeant}} » chez le client. */
  it('efface une variable connue mais vide', () => {
    expect(substituer('Bonjour {{prenom}}', { ...CLIENT, prenom: null })).toBe('Bonjour ');
  });

  it('accepte les espaces et les majuscules dans le marqueur', () => {
    expect(substituerTexte('{{ Ville }}', CLIENT)).toBe('Albi');
  });
});

describe('le catalogue', () => {
  /*
    ⚠️ Des modeles de courriel emploient deja ces cinq noms. Les renommer ferait
    apparaitre `{{dirigeant}}` en clair au prochain envoi.
  */
  it('garde les cinq noms historiques', () => {
    const noms = VARIABLES_CAMPAGNE.map((v) => v.nom);
    for (const n of ['nom_entreprise', 'dirigeant', 'numero_dossier', 'date_cloture', 'regime_fiscal']) {
      expect(noms, n).toContain(n);
    }
  });

  it('ne porte aucun nom en double', () => {
    const noms = VARIABLES_CAMPAGNE.map((v) => v.nom);
    expect(new Set(noms).size).toBe(noms.length);
  });

  /*
    Ce qui n'a pas sa place dans une lettre adressee AU client : un resume
    produit par un modele, un statut interne, une date de sortie du cabinet.
  */
  it('n ouvre ni le resume IA, ni le statut, ni la sortie du cabinet', () => {
    const colonnes = colonnesVariables().map((c) => c.colonne);
    for (const interdite of ['resume_ia', 'statut', 'date_sortie_cabinet', 'is_lmnp']) {
      expect(colonnes, interdite).not.toContain(interdite);
    }
  });

  it('ne lit chaque colonne qu une fois, meme servie par deux variables', () => {
    const colonnes = colonnesVariables().map((c) => c.colonne);
    expect(colonnes.filter((c) => c === 'date_cloture')).toHaveLength(1);
  });
});
