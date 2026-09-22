/**
 * La liste des champs écrivables par le connecteur, tenue avec l'écran.
 * ---------------------------------------------------------------------------
 * ⚠️ CE QUE CE FICHIER PROTÈGE N'EST PAS UNE ÉGALITÉ, C'EST UNE DÉRIVE
 * SILENCIEUSE. `server/src/mcp/champs-fiche.ts` énumère ce que le connecteur
 * peut écrire ; `src/pages/clientDetail/lignes.tsx` énumère ce que la fiche
 * laisse modifier. Les deux vivent de part et d'autre de la frontière posée par
 * le `tsconfig` du serveur (`rootDir: "src"`), qui lui interdit d'importer du
 * front — même raison que la jumelle de `facturation-electronique.ts`.
 *
 * Le jour où quelqu'un ajoute un champ à la fiche, rien ne lui rappellerait
 * d'ouvrir la liste du connecteur : le champ resterait inaccessible, et
 * personne ne le verrait avant d'essayer de le dicter à un modèle. Ce cas tombe
 * alors, et nomme le champ.
 *
 * ⚠️ LA PARITÉ N'EST PAS SYMÉTRIQUE, ET IL FAUT LE SAVOIR AVANT DE VOULOIR
 * « CORRIGER » CE TEST. Des champs de l'écran sont volontairement absents de la
 * liste du connecteur — ceux que la base recompose, ceux que les
 * synchronisations écrivent, et les deux qui portent déjà leur propre outil.
 * Ils sont nommés ici un par un, avec leur raison. Ajouter un champ à cette
 * liste d'exceptions doit rester un geste réfléchi, pas un réflexe pour faire
 * passer le test.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  CHAMPS_ECRIVABLES,
  CHAMPS_PAR_COLONNE,
  REFUS_EXPLIQUES,
  lireValeur,
  dejaRenseigne,
} from '../server/src/mcp/champs-fiche.js';

const RACINE = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/**
 * Les champs que l'écran modifie mais que le connecteur n'écrit PAS, et
 * pourquoi. Chaque entrée est une décision, pas une tolérance.
 */
const ABSENTS_VOULUS: Record<string, string> = {
  // La base les recompose depuis d'autres colonnes.
  adresse: 'recomposee par clients_adresse_trigger',
  tva_intracom: 'calcule par clients_tva_intracom_trigger',
  // Ils portent deja leur propre outil, avec leur propre garde.
  adresse_facturation_electronique: 'outil set_client_facturation_electronique',
  parts_totales: 'outil set_client_repartition',
  // Pose par la recherche d'adresse, jamais a la main.
  code_insee: 'pose par la recherche d adresse',
};

/** Les affectations que l'écran fait à la fiche, lues dans son propre source. */
function champsDeLEcran(): Set<string> {
  const fichiers = [
    'src/pages/clientDetail/lignes.tsx',
    'src/components/clients/AdresseFields.tsx',
  ];
  const trouves = new Set<string>();
  for (const f of fichiers) {
    let source = readFileSync(resolve(RACINE, f), 'utf8');
    /*
     * ⚠️ LES COMMENTAIRES SONT RETIRES D'ABORD. Sans cela le test lisait
     * `modifier({ x: v })` dans un commentaire d'en-tete et reclamait un champ
     * « x » qui n'existe pas. Un test de parite qui invente un champ est pire
     * qu'inutile : il pousse a elargir la liste blanche pour le faire taire.
     */
    source = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    // `modifier({ champ: ... })` cote fiche, `onChange({ champ: ... })` cote adresse.
    for (const m of source.matchAll(/(?:modifier|onChange)\(\{\s*([a-z_][a-z_0-9]*)\s*:/g)) {
      trouves.add(m[1]!);
    }
  }
  return trouves;
}

describe('les champs ecrivables, tenus avec l ecran', () => {
  it("n'oublie aucun champ que la fiche laisse modifier", () => {
    const ecran = champsDeLEcran();
    // Le test ne prouve rien s'il ne lit rien : une refonte de la fiche qui
    // changerait la forme des appels doit tomber ici, pas passer au vert.
    expect(ecran.size, "aucun champ lu dans l'ecran — le motif a change ?").toBeGreaterThan(15);

    const manquants = [...ecran].filter(
      (c) => !CHAMPS_PAR_COLONNE.has(c) && !(c in ABSENTS_VOULUS)
    );
    expect(
      manquants,
      `l'ecran modifie ces champs, le connecteur ne les connait pas : ${manquants.join(', ')}. ` +
        'Ajoutez-les a CHAMPS_ECRIVABLES, ou a ABSENTS_VOULUS avec leur raison.'
    ).toEqual([]);
  });

  it("n'ouvre rien que l'ecran ne modifie pas", () => {
    const ecran = champsDeLEcran();
    // `nom_entreprise` est le seul ecart admis : la fiche l'edite sous le nom
    // `raison_sociale` dans son formulaire, et l'ecrit par une autre voie.
    const enTrop = CHAMPS_ECRIVABLES.map((c) => c.colonne).filter(
      (c) => !ecran.has(c) && c !== 'nom_entreprise'
    );
    expect(
      enTrop,
      `le connecteur ouvrirait des champs que la fiche ne modifie pas : ${enTrop.join(', ')}`
    ).toEqual([]);
  });

  /*
    ⚠️ AUCUNE COLONNE MAINTENUE PAR UN DECLENCHEUR NE DOIT ETRE ECRIVABLE.
    Les quatre sont nommees en dur : ce test doit tomber meme si quelqu'un les
    ajoute a CHAMPS_ECRIVABLES en croyant bien faire.
  */
  it('exclut les quatre colonnes que la base recompose', () => {
    for (const c of ['siren', 'adresse', 'tva_intracom', 'numero_tva']) {
      expect(CHAMPS_PAR_COLONNE.has(c), `${c} ne doit pas etre ecrivable`).toBe(false);
    }
  });

  it('exclut ce que les synchronisations ecrivent', () => {
    for (const c of ['etat_administratif', 'date_radiation', 'last_inpi_sync', 'tva_verif_statut']) {
      expect(CHAMPS_PAR_COLONNE.has(c), `${c} ne doit pas etre ecrivable`).toBe(false);
    }
  });

  it('explique nommement les refus les plus previsibles', () => {
    // Un refus « colonne inconnue » sur `siren` ferait chercher une faute de
    // frappe. Celui-ci dit quoi ecrire a la place.
    for (const c of ['siren', 'adresse', 'adresse_facturation_electronique', 'parts_totales']) {
      expect(REFUS_EXPLIQUES[c], `${c} merite un refus explique`).toBeTruthy();
    }
  });
});

describe('lireValeur', () => {
  const champ = (colonne: string) => CHAMPS_PAR_COLONNE.get(colonne)!;

  it('accepte du texte et le debarrasse de ses blancs', () => {
    expect(lireValeur(champ('ville'), '  Albi  ')).toEqual({ ok: true, valeur: 'Albi' });
  });

  /*
    Effacer est un geste : « ce client n'a pas de second courriel » se dit en
    passant null, et ce n'est pas la meme chose que ne pas mentionner le champ.
  */
  it('traite null et la chaine vide comme un effacement', () => {
    expect(lireValeur(champ('email_2'), null)).toEqual({ ok: true, valeur: null });
    expect(lireValeur(champ('email_2'), '   ')).toEqual({ ok: true, valeur: null });
  });

  it('accepte un nombre, et un nombre ecrit en texte', () => {
    expect(lireValeur(champ('capital_social'), 10000)).toEqual({ ok: true, valeur: 10000 });
    expect(lireValeur(champ('capital_social'), '10000')).toEqual({ ok: true, valeur: 10000 });
  });

  /*
    ⚠️ « 10 000 EUR » N'EST PAS LU COMME 10000. Un modele qui recopie un montant
    depuis un document l'ecrit souvent ainsi ; l'interpreter ferait ecrire 10,
    silencieusement, dans le capital social d'une societe reelle.
  */
  it('REFUSE un nombre avec unite ou separateur, plutot que de deviner', () => {
    const r = lireValeur(champ('capital_social'), '10 000 EUR');
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.raison).toContain('sans unite');
  });

  it('accepte une date au format de la base', () => {
    expect(lireValeur(champ('date_cloture'), '2026-12-31')).toEqual({
      ok: true,
      valeur: '2026-12-31',
    });
  });

  /*
    ⚠️ « 12/03/2026 » EST REFUSEE, PAS CONVERTIE. Le modele a peut-etre lu un
    document americain : deviner ferait ecrire le 3 decembre pour le 12 mars.
  */
  it('REFUSE une date au format francais ou americain', () => {
    expect(lireValeur(champ('date_cloture'), '12/03/2026').ok).toBe(false);
    expect(lireValeur(champ('date_cloture'), '31-12-2026').ok).toBe(false);
  });

  it('REFUSE une date qui respecte le format sans exister', () => {
    const r = lireValeur(champ('date_cloture'), '2026-02-31');
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.raison).toContain("n'est pas une date reelle");
  });

  it('REFUSE un type qui ne correspond pas', () => {
    expect(lireValeur(champ('ville'), 42).ok).toBe(false);
    expect(lireValeur(champ('capital_social'), true).ok).toBe(false);
    expect(lireValeur(champ('is_lmnp'), 'oui').ok).toBe(false);
  });

  it('accepte un booleen, et lui seul', () => {
    expect(lireValeur(champ('is_lmnp'), true)).toEqual({ ok: true, valeur: true });
    expect(lireValeur(champ('is_lmnp'), false)).toEqual({ ok: true, valeur: false });
  });
});

describe('dejaRenseigne', () => {
  it('voit une valeur posee', () => {
    expect(dejaRenseigne('Albi')).toBe(true);
    expect(dejaRenseigne(0)).toBe(true);
    expect(dejaRenseigne(false)).toBe(true);
  });

  /*
    Une chaine de blancs compte pour vide : sinon un champ « rempli » d'un
    espace ferait refuser une ecriture legitime, avec un message qui montre
    deux valeurs identiques a l'oeil.
  */
  it('compte le vide, le blanc et l absence comme non renseignes', () => {
    expect(dejaRenseigne(null)).toBe(false);
    expect(dejaRenseigne(undefined)).toBe(false);
    expect(dejaRenseigne('')).toBe(false);
    expect(dejaRenseigne('   ')).toBe(false);
  });
});
