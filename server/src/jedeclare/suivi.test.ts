import { describe, it, expect } from 'vitest';
import {
  decoupageDe,
  etatCellule,
  familleDe,
  periodiciteDe,
  sirenDe,
  type LigneTeletransmission,
} from './etat.js';
import { pieceLisible } from './prudence.js';

/**
 * L'état d'une cellule du suivi.
 * ---------------------------------------------------------------------------
 * ⚠️ LES VALEURS TESTÉES ICI SONT RÉELLES. Elles proviennent du relevé exhaustif
 * des 2 165 accusés du cabinet, le 2026-08-03 — dix combinaisons
 * (nature, résultat) et pas une de plus.
 *
 * Ce test existe parce que la première version cherchait `/rejet/i`, un mot que
 * jedeclare N'EMPLOIE JAMAIS : il écrit `refusees`. Les 35 déclarations refusées
 * s'affichaient donc en orange « en attente » au lieu de rouge. Le connecteur
 * d'origine porte encore ce défaut.
 */

const ligne = (p: Partial<LigneTeletransmission>): LigneTeletransmission => ({
  compte: 0,
  numero: 'P1', type_piece: '03', ligne: 0, procedure: 'EDI-TVA', nature: 'ARS',
  numero_ads: '', date_avis: '2026-07-15', siret: '', siren: '', societe: '',
  dossier: '', type_declaration: 'IDT', type_libelle: '', destinataire: 'DGFIP',
  periode_debut: '2026-06-01', periode_fin: '2026-06-30', resultat: '',
  bloquee: false, montant: null, rof: '', lien: '', ...p,
});

describe('etatCellule — les resultats reels de jedeclare', () => {
  it('rend null quand il n y a aucune ligne', () => {
    expect(etatCellule([])).toBeNull();
  });

  it('vert : un ARS accepte, qui seul fait foi', () => {
    const e = etatCellule([
      ligne({ nature: 'ACS', resultat: 'acceptée' }),
      ligne({ nature: 'ARS', resultat: 'acceptée' }),
    ]);
    expect(e?.etat).toBe('vert');
    expect(e?.libelle).toBe('acceptée');
  });

  it('vert aussi sur « accepteesprecedement »', () => {
    expect(etatCellule([ligne({ nature: 'ARS', resultat: 'accepteesprecedement' })])?.etat).toBe('vert');
  });

  /**
   * ⭐ LE DEFAUT CORRIGE. `refusees` ne contient ni « rejet » ni « refus » au
   * singulier : la detection initiale le laissait passer pour une attente.
   */
  it('ROUGE sur « refusees » — le mot « rejet » n existe pas chez jedeclare', () => {
    const e = etatCellule([ligne({ nature: 'ARS', resultat: 'refusees' })]);
    expect(e?.etat, 'un refus affiche en attente : le cabinet ne le verrait pas').toBe('rouge');
    expect(e?.libelle).toMatch(/refus/i);
  });

  it('rouge sur « refuseesprecedement »', () => {
    expect(etatCellule([ligne({ nature: 'ARS', resultat: 'refuseesprecedement' })])?.etat).toBe('rouge');
  });

  /** Un ACS refuse : le controle de conformite a echoue, rien n'est parti. */
  it('rouge sur un ACS refuse, avant meme la reponse du destinataire', () => {
    expect(etatCellule([ligne({ nature: 'ACS', resultat: 'refusees' })])?.etat).toBe('rouge');
  });

  /**
   * C'est le DERNIER mot qui compte, et ici c'est un refus. Le cas symétrique —
   * un refus suivi d'une acceptation — est vert, et vit plus bas.
   */
  it('rouge quand une acceptation est suivie d un refus', () => {
    const e = etatCellule([
      ligne({ nature: 'ARS', resultat: 'accepteesprecedement', date_avis: '2026-06-01' }),
      ligne({ nature: 'ARS', resultat: 'refusees', date_avis: '2026-07-01' }),
    ]);
    expect(e?.etat).toBe('rouge');
  });

  it('rouge sur une declaration bloquee, quel que soit le resultat', () => {
    expect(etatCellule([ligne({ resultat: 'acceptée', bloquee: true })])?.etat).toBe('rouge');
    expect(etatCellule([ligne({ resultat: 'acceptée', bloquee: true })])?.libelle).toMatch(/bloquée/);
  });

  it('signale l anomalie sans changer la couleur', () => {
    const e = etatCellule([ligne({ nature: 'ARS', resultat: 'acceptée avec anomalie' })]);
    expect(e?.etat).toBe('vert');
    expect(e?.anomalie).toBe(true);
    expect(e?.libelle).toBe('acceptée avec anomalie');
  });

  /** L'anomalie est accolee dans « accepteesanoprecedement ». */
  it('detecte l anomalie collee dans « accepteesanoprecedement »', () => {
    const e = etatCellule([ligne({ nature: 'ARS', resultat: 'accepteesanoprecedement' })]);
    expect(e?.etat).toBe('vert');
    expect(e?.anomalie, "l'anomalie accolee passe inapercue").toBe(true);
  });

  /**
   * « sansretour » : le destinataire n'a pas repondu. Ce n'est ni un refus ni
   * une acceptation, et surtout pas une anomalie — c'est frequent et souvent
   * normal. Le libelle le nomme au lieu de le confondre avec une declaration
   * jamais deposee.
   */
  it('orange et nomme sur « sansretour »', () => {
    const e = etatCellule([
      ligne({ nature: 'ACS', resultat: 'acceptée' }),
      ligne({ nature: 'ARS', resultat: 'sansretour' }),
    ]);
    expect(e?.etat).toBe('orange');
    expect(e?.anomalie).toBe(false);
    expect(e?.libelle).toBe('déposée, sans retour de DGFIP');
  });

  it('orange quand seul l ACS existe : le depot ne vaut pas acceptation', () => {
    const e = etatCellule([ligne({ nature: 'ACS', resultat: 'acceptée' })]);
    expect(e?.etat).toBe('orange');
    expect(e?.libelle).toBe('déposée, en attente de réponse');
  });

  /** L'ACS atteste du depot, l'ARS y repond : a date egale, l'ACS passe devant. */
  it('ordonne les etapes, ACS avant ARS a date egale', () => {
    const e = etatCellule([
      ligne({ nature: 'ARS', resultat: 'acceptée', date_avis: '2026-07-15' }),
      ligne({ nature: 'ACS', resultat: 'acceptée', date_avis: '2026-07-15' }),
    ]);
    expect(e?.etapes[0]).toMatch(/^ACS/);
    expect(e?.etapes[1]).toMatch(/^ARS/);
  });

  it('additionne les montants des lignes', () => {
    const e = etatCellule([ligne({ montant: 1200 }), ligne({ montant: 300 })]);
    expect(e?.montant).toBe(1500);
  });
});

/**
 * Le destinataire nommé.
 * ---------------------------------------------------------------------------
 * ⚠️ SUR LE COMPTE RÉEL, 436 LIGNES SUR 6 075 NE VONT PAS À LA DGFiP mais à une
 * banque du client — la copie de la liasse. Le type `ILF` est même à 100 %
 * bancaire : 433 lignes, aucune vers l'administration (mesuré le 2026-08-03).
 *
 * Tant que le libellé disait « refusée par le destinataire », ces 27 refus
 * bancaires s'affichaient en rouge dans un onglet nommé « Liasses Fiscales » et
 * se lisaient comme un refus de l'administration.
 */
describe('etatCellule — le destinataire est nomme', () => {
  it('nomme la banque qui refuse, au lieu de « le destinataire »', () => {
    const e = etatCellule([
      ligne({ nature: 'ACS', resultat: 'acceptée', destinataire: 'Banque Populaire Occitane' }),
      ligne({ nature: 'ARS', resultat: 'refusees', destinataire: 'Banque Populaire Occitane' }),
    ]);
    expect(e?.etat).toBe('rouge');
    expect(e?.libelle, 'un refus bancaire lu comme un refus fiscal').toBe(
      'refusée par Banque Populaire Occitane'
    );
  });

  it('compte les destinataires plutot que de tous les enumerer', () => {
    const e = etatCellule([
      ligne({ nature: 'ARS', resultat: 'refusees', destinataire: 'LCL' }),
      ligne({ nature: 'ARS', resultat: 'refusees', destinataire: 'Société Générale' }),
    ]);
    expect(e?.libelle).toBe('refusée par 2 destinataires');
  });

  /** Une déclaration bloquée ne part chez personne : nommer serait mentir. */
  it('ne nomme personne quand la declaration est bloquee', () => {
    const e = etatCellule([ligne({ resultat: 'acceptée', bloquee: true, destinataire: 'LCL' })]);
    expect(e?.libelle).toBe('refusée (déclaration bloquée)');
  });

  it('retombe sur « le destinataire » quand jedeclare ne le donne pas', () => {
    const e = etatCellule([ligne({ nature: 'ARS', resultat: 'refusees', destinataire: '' })]);
    expect(e?.libelle).toBe('refusée par le destinataire');
  });

  it('expose les destinataires distincts, sans doublon ni vide', () => {
    const e = etatCellule([
      ligne({ destinataire: 'DGFiP - ESI Strasbourg' }),
      ligne({ destinataire: 'DGFiP - ESI Strasbourg' }),
      ligne({ destinataire: '' }),
      ligne({ destinataire: 'LCL' }),
    ]);
    expect(e?.destinataires).toEqual(['DGFiP - ESI Strasbourg', 'LCL']);
  });
});

describe('sirenDe', () => {
  it('prend les neuf premiers chiffres d un SIRET', () => {
    expect(sirenDe('30326504500017')).toBe('303265045');
  });
  it('rend vide sur une entree trop courte', () => {
    for (const mauvais of [null, undefined, '', '1234', 'abcdefghi']) {
      expect(sirenDe(mauvais)).toBe('');
    }
  });
});

/**
 * La règle qui autorise — ou non — à lire un accusé.
 * ---------------------------------------------------------------------------
 * C'est la seule décision du module dont une erreur est IRRÉVERSIBLE : lire un
 * accusé le marque « récupéré » chez jedeclare, et le logiciel de production du
 * cabinet, qui filtre sur « non récupérés », ne le reverra jamais comme nouveau.
 * Un test qui passe ici ne prouve pas grand-chose ; un test qui casse dit qu'on
 * s'apprête à prendre des accusés à quelqu'un.
 */
describe('pieceLisible — la prudence, compte par compte', () => {
  const FERME = [{ marquageAutorise: false }, { marquageAutorise: false }];
  const SECOND_OUVERT = [{ marquageAutorise: false }, { marquageAutorise: true }];

  it('en mode prudent, n ouvre que les accuses deja recuperes', () => {
    expect(pieceLisible({ compte: 0, recuperee: true }, true, FERME)).toBe(true);
    expect(pieceLisible({ compte: 0, recuperee: false }, true, FERME)).toBe(false);
  });

  it('hors mode prudent, tout est lisible', () => {
    expect(pieceLisible({ compte: 0, recuperee: false }, false, FERME)).toBe(true);
    expect(pieceLisible({ compte: 1, recuperee: false }, false, FERME)).toBe(true);
  });

  // Le cas qui a motivé le réglage : un compte que personne ne relève n'a jamais
  // d'accusé récupéré, donc jamais un seul accusé lisible. 204 pièces écartées
  // sur 204, à chaque analyse, mesuré le 2026-08-09.
  it('ouvre le compte dont le marquage est autorise, et lui SEUL', () => {
    expect(pieceLisible({ compte: 1, recuperee: false }, true, SECOND_OUVERT)).toBe(true);
    expect(pieceLisible({ compte: 0, recuperee: false }, true, SECOND_OUVERT)).toBe(false);
  });

  // Un rang hors liste vient d'une numérotation trouée ou d'une configuration
  // changée entre deux analyses. Il ne doit surtout pas hériter de l'ouverture
  // d'un voisin : l'inconnu se traite en prudent.
  it('refuse un compte absent de la configuration', () => {
    expect(pieceLisible({ compte: 7, recuperee: false }, true, SECOND_OUVERT)).toBe(false);
    expect(pieceLisible({ compte: 7, recuperee: false }, true, [])).toBe(false);
  });

  it('un accuse deja recupere reste lisible meme sur un compte ferme', () => {
    expect(pieceLisible({ compte: 1, recuperee: true }, true, FERME)).toBe(true);
  });
});

/**
 * La déclaration régénérée.
 * ---------------------------------------------------------------------------
 * Le cabinet corrige une déclaration refusée, la redépose, et le destinataire
 * l'accepte. La cellule doit passer au VERT : le travail est fait.
 *
 * Elle restait rouge. Le jugement cherchait « un refus quelque part » sans
 * jamais regarder les dates — alors que son commentaire affirmait le contraire
 * (« l'ordre compte : un refus l'emporte sur une acceptation antérieure »).
 * Conséquence : un arriéré qui n'existait plus restait affiché indéfiniment, et
 * une correction déjà faite se relisait comme une correction à faire.
 */
describe('etatCellule — une declaration refusee puis regeneree', () => {
  it('VERT quand le dernier ARS accepte, malgre un refus anterieur', () => {
    const e = etatCellule([
      ligne({ nature: 'ACS', resultat: 'acceptée', date_avis: '2026-06-01' }),
      ligne({ nature: 'ARS', resultat: 'refusees', date_avis: '2026-06-03' }),
      ligne({ nature: 'ACS', resultat: 'acceptée', date_avis: '2026-06-10' }),
      ligne({ nature: 'ARS', resultat: 'acceptée', date_avis: '2026-06-12' }),
    ]);
    expect(e?.etat, 'un travail refait qui reste affiche comme a faire').toBe('vert');
    expect(e?.libelle).toBe('acceptée');
  });

  it('le refus reste le dernier mot quand rien ne l a suivi', () => {
    const e = etatCellule([
      ligne({ nature: 'ARS', resultat: 'acceptée', date_avis: '2026-06-01' }),
      ligne({ nature: 'ARS', resultat: 'refusees', date_avis: '2026-07-01' }),
    ]);
    expect(e?.etat).toBe('rouge');
  });

  /** Un ACS refusé arrête tout — sauf si un dépôt ultérieur a abouti. */
  it('VERT quand un ACS refuse est suivi d un ARS accepte', () => {
    const e = etatCellule([
      ligne({ nature: 'ACS', resultat: 'refusees', date_avis: '2026-06-01' }),
      ligne({ nature: 'ACS', resultat: 'acceptée', date_avis: '2026-06-05' }),
      ligne({ nature: 'ARS', resultat: 'acceptée', date_avis: '2026-06-07' }),
    ]);
    expect(e?.etat).toBe('vert');
  });

  /** Une déclaration bloquée n'est partie chez personne — le redépôt, si. */
  it('VERT quand une declaration bloquee est redeposee et acceptee', () => {
    const e = etatCellule([
      ligne({ resultat: 'acceptée', bloquee: true, date_avis: '2026-06-01' }),
      ligne({ nature: 'ARS', resultat: 'acceptée', date_avis: '2026-06-08' }),
    ]);
    expect(e?.etat).toBe('vert');
  });

  /** L'anomalie de la tentative ratée ne doit pas survivre à la correction. */
  it('n herite pas de l anomalie de la tentative precedente', () => {
    const e = etatCellule([
      ligne({ nature: 'ARS', resultat: 'acceptée avec anomalie', date_avis: '2026-06-01' }),
      ligne({ nature: 'ARS', resultat: 'acceptée', date_avis: '2026-06-20' }),
    ]);
    expect(e?.etat).toBe('vert');
    expect(e?.anomalie).toBe(false);
    expect(e?.libelle).toBe('acceptée');
  });

  it('a date egale, l ARS tranche apres l ACS', () => {
    const e = etatCellule([
      ligne({ nature: 'ARS', resultat: 'acceptée', date_avis: '2026-06-12' }),
      ligne({ nature: 'ACS', resultat: 'refusees', date_avis: '2026-06-12' }),
    ]);
    expect(e?.etat).toBe('vert');
  });
});

/**
 * ⚠️ LE GARDE-FOU DE LA REGLE PRECEDENTE.
 *
 * « Le dernier ARS fait foi » est juste POUR UN DESTINATAIRE DONNE. Applique a
 * la cellule entiere, il efface un refus : une meme cellule part souvent a la
 * DGFiP ET aux banques du client — 436 lignes sur 6 075 au releve du
 * 2026-08-03, et le type ILF est a 100 % bancaire. Une liasse refusee par
 * l'administration passerait au vert parce qu'une banque l'a acceptee deux
 * jours plus tard.
 *
 * C'est le seul endroit ou la regle demandee devait etre resserree, et ces
 * tests sont ce qui l'empeche de se relacher.
 */
describe('etatCellule — un refus ne s efface pas par un autre destinataire', () => {
  it('ROUGE quand la DGFiP refuse et qu une banque accepte apres', () => {
    const e = etatCellule([
      ligne({ nature: 'ARS', resultat: 'refusees', destinataire: 'DGFiP', date_avis: '2026-06-03' }),
      ligne({ nature: 'ARS', resultat: 'acceptée', destinataire: 'LCL', date_avis: '2026-06-20' }),
    ]);
    expect(e?.etat, 'un refus de l administration masque par une banque').toBe('rouge');
    expect(e?.libelle).toBe('refusée par DGFiP');
  });

  it('ne nomme que le destinataire dont le dernier mot est un refus', () => {
    const e = etatCellule([
      // La banque a refuse, puis accepte le redepot : elle n'est plus en cause.
      ligne({ nature: 'ARS', resultat: 'refusees', destinataire: 'LCL', date_avis: '2026-06-01' }),
      ligne({ nature: 'ARS', resultat: 'acceptée', destinataire: 'LCL', date_avis: '2026-06-15' }),
      ligne({ nature: 'ARS', resultat: 'refusees', destinataire: 'DGFiP', date_avis: '2026-06-10' }),
    ]);
    expect(e?.etat).toBe('rouge');
    expect(e?.libelle, 'nommer qui a fini par accepter serait un contresens').toBe(
      'refusée par DGFiP'
    );
  });

  it('VERT quand chaque destinataire a fini par accepter', () => {
    const e = etatCellule([
      ligne({ nature: 'ARS', resultat: 'refusees', destinataire: 'DGFiP', date_avis: '2026-06-01' }),
      ligne({ nature: 'ARS', resultat: 'acceptée', destinataire: 'DGFiP', date_avis: '2026-06-15' }),
      ligne({ nature: 'ARS', resultat: 'refusees', destinataire: 'LCL', date_avis: '2026-06-02' }),
      ligne({ nature: 'ARS', resultat: 'acceptée', destinataire: 'LCL', date_avis: '2026-06-16' }),
    ]);
    expect(e?.etat).toBe('vert');
  });
});

/**
 * La périodicité, déduite de la période déclarée.
 * ---------------------------------------------------------------------------
 * Elle décide dans LEQUEL des trois tableaux de TVA une société apparaît. Se
 * tromper ne casse rien de visible : la ligne va simplement dans le mauvais
 * onglet, et un client au régime trimestriel se lit comme un mensuel en retard
 * deux mois sur trois.
 *
 * La fourchette est large à dessein. Un trimestre déclaré ne fait pas toujours
 * trois mois pleins — une création ou une cessation en cours de trimestre en
 * donne deux, ou quatre à cheval.
 */
describe('periodiciteDe', () => {
  it('un mois plein est mensuel', () => {
    expect(periodiciteDe('2026-06-01', '2026-06-30')).toBe('mensuelle');
    expect(periodiciteDe('2026-02-01', '2026-02-28')).toBe('mensuelle');
  });

  it('un trimestre est trimestriel', () => {
    expect(periodiciteDe('2026-01-01', '2026-03-31')).toBe('trimestrielle');
    expect(periodiciteDe('2026-10-01', '2026-12-31')).toBe('trimestrielle');
  });

  it('une annee est annuelle', () => {
    expect(periodiciteDe('2026-01-01', '2026-12-31')).toBe('annuelle');
  });

  /** Une periode a cheval sur deux annees compte quand meme ses mois. */
  it('compte les mois par-dela le changement d annee', () => {
    expect(periodiciteDe('2025-12-01', '2026-02-28')).toBe('trimestrielle');
    expect(periodiciteDe('2025-07-01', '2026-06-30')).toBe('annuelle');
  });

  /** Creation ou cessation en cours de trimestre : deux ou quatre mois. */
  it('reste trimestriel sur un trimestre incomplet ou a cheval', () => {
    expect(periodiciteDe('2026-02-15', '2026-03-31')).toBe('trimestrielle');
    expect(periodiciteDe('2026-01-01', '2026-04-30')).toBe('trimestrielle');
  });

  /**
   * Sans bornes exploitables, on ne devine pas : la ligne reste dans le tableau
   * du type, sans periodicite. Une periodicite inventee vaudrait moins que pas
   * de periodicite du tout — elle rangerait un client ailleurs qu'ou il est.
   */
  it('rend null plutot que de deviner', () => {
    for (const [d, f] of [
      ['', '2026-06-30'],
      ['2026-06-01', ''],
      ['', ''],
      [null, null],
      [undefined, undefined],
      ['pas une date', '2026-06-30'],
      // Bornes inversees : la donnee se contredit.
      ['2026-06-30', '2026-01-01'],
    ] as [string | null | undefined, string | null | undefined][]) {
      expect(periodiciteDe(d, f), `${d} → ${f}`).toBeNull();
    }
  });
});

/**
 * Le classement en onglets : TVA, Bilan, Autres.
 * ---------------------------------------------------------------------------
 * Il decide de l'onglet ou une declaration se trouve, et il est deduit de la
 * SEULE teleprocedure : aucun code fiscal (`IDT`, `IS`, `ILF`) n'est ecrit dans
 * le classement. Ces tests exercent donc la regle, pas un referentiel.
 *
 * Les teleprocedures employees ici sont celles que jedeclare renvoie
 * reellement — voir `TELEPROCEDURES` dans `client.ts`.
 */
describe('familleDe — l onglet ou une declaration se range', () => {
  it('range la TVA en TVA', () => {
    expect(familleDe(['EDI-TVA'])).toBe('tva');
  });

  /**
   * `EDI-TDFC` porte la liasse : la declaration fiscale (`IDF`), l'IS, et la
   * copie envoyee aux banques du client (`ILF`). Les trois vont dans le meme
   * onglet, c'est le meme moment de production.
   */
  it('range la liasse et l IS en Bilan', () => {
    expect(familleDe(['EDI-TDFC'])).toBe('bilan');
  });

  it('range tout le reste en Autres', () => {
    for (const p of ['DSN', 'EDI-PAIE', 'EDI-IR', 'EDI-OGA', 'DUCS', 'BPIJ', 'RELEVE']) {
      expect(familleDe([p]), p).toBe('autres');
    }
  });

  /**
   * Un groupe sans procedure exploitable ne disparait pas : il se range dans
   * « Autres ». L'ecarter le ferait sortir des onglets sans que rien ne le dise,
   * alors que ses declarations comptent toujours dans les totaux de la page.
   */
  it('range en Autres ce qui n a aucune procedure', () => {
    expect(familleDe([])).toBe('autres');
    expect(familleDe([''])).toBe('autres');
  });

  /**
   * ⚠️ LA PRIORITE NE DOIT PAS DEPENDRE DE L ORDRE. Les procedures arrivent
   * dans un `Set` alimente par l'ordre des accuses : sans priorite explicite, un
   * meme portefeuille rangerait le tableau tantot en TVA, tantot en Bilan, selon
   * l'ordre d'analyse.
   */
  it('donne la TVA gagnante quand les deux procedures coexistent, dans les deux sens', () => {
    expect(familleDe(['EDI-TVA', 'EDI-TDFC'])).toBe('tva');
    expect(familleDe(['EDI-TDFC', 'EDI-TVA'])).toBe('tva');
  });

  it('lit un Set aussi bien qu un tableau — c est ce que lui passe le pivot', () => {
    expect(familleDe(new Set(['DSN', 'EDI-TDFC']))).toBe('bilan');
  });
});

/**
 * Le pas des colonnes de la grille.
 * ---------------------------------------------------------------------------
 * Ce qui est verifie ici n'est pas un gout d'affichage mais une regle de
 * lecture : une colonne vide par construction — le mois ou une societe au
 * trimestriel n'a par definition rien a declarer — se lit comme du retard.
 * Regrouper au bon pas est ce qui fait disparaitre ces faux trous.
 */
describe('decoupageDe — le pas des colonnes de la grille', () => {
  it('met la TVA trimestrielle au trimestre', () => {
    expect(decoupageDe('tva', 'trimestrielle')).toBe('trimestre');
  });

  it('met la TVA annuelle a l annee', () => {
    expect(decoupageDe('tva', 'annuelle')).toBe('annee');
  });

  it('laisse la TVA mensuelle au mois', () => {
    expect(decoupageDe('tva', 'mensuelle')).toBe('mois');
  });

  /**
   * Le bilan est annuel PAR SA FAMILLE, sans passer par la periodicite : elle
   * n'est calculee que pour la TVA, et une liasse n'a pas cette question.
   */
  it('met tout le Bilan a l annee, meme sans periodicite', () => {
    expect(decoupageDe('bilan')).toBe('annee');
    expect(decoupageDe('bilan', null)).toBe('annee');
    expect(decoupageDe('bilan', 'mensuelle')).toBe('annee');
  });

  /**
   * « Autres » melange des rythmes — DSN mensuelle, DUCS, IR annuel. Un
   * decoupage devine y afficherait des trimestres faux ; le mois ne ment pas.
   */
  it('laisse Autres au mois', () => {
    expect(decoupageDe('autres')).toBe('mois');
    expect(decoupageDe('autres', 'trimestrielle')).toBe('mois');
  });

  /**
   * ⚠️ LE CAS QUI COMPTE : une TVA dont les bornes ne donnent aucune
   * periodicite. La ranger d'office au trimestre ferait passer une inconnue
   * pour une certitude, et regrouperait des mois qui n'ont rien a voir.
   */
  it('laisse au mois une TVA sans periodicite exploitable', () => {
    expect(decoupageDe('tva')).toBe('mois');
    expect(decoupageDe('tva', null)).toBe('mois');
  });
});
