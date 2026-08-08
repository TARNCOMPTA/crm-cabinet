/**
 * Le code NAF, rendu choisissable.
 * ---------------------------------------------------------------------------
 * Un code NAF est un nombre : `6201Z`. Personne ne cible une campagne en
 * récitant des nombres — on veut « mes clients du bâtiment », « les
 * professions de santé ». La fiche client ne stocke que le code, jamais son
 * libellé : c'est ici qu'on lui rend un sens lisible.
 *
 * ⚠️ CE MODULE NE PORTE QUE LES 21 SECTIONS, pas les 732 codes. Le libellé exact
 * d'une classe (`6201Z` = « Programmation informatique ») n'est ni en base ni
 * ici, et l'inventer de mémoire produirait des étiquettes plausibles et fausses
 * — le genre d'erreur qu'un utilisateur croit sur parole. La section, elle, est
 * une donnée stable de la nomenclature NAF rév. 2 : elle situe l'activité sans
 * rien prétendre de plus.
 *
 * La structure lue : `6201Z` → division `62` → section `J`.
 */

/** Un code présent dans le portefeuille, tel que le serveur le renvoie. */
export interface CodeNafPresent {
  /** Déjà réduit par le serveur : majuscules, sans point ni espace. */
  code: string;
  nb: number;
}

/** Une entrée proposée au choix : une classe précise, ou toute une division. */
export interface OptionNaf {
  /** Le préfixe envoyé au serveur : `62` pour la division, `6201Z` pour la classe. */
  valeur: string;
  libelle: string;
  /** Section et effectif, la ligne qui permet de reconnaître le métier. */
  detail: string;
  /** Vrai pour une division — l'écran la présente autrement. */
  groupe: boolean;
}

/**
 * Les 21 sections de la NAF rév. 2, par plages de divisions.
 *
 * Les plages sont celles de la nomenclature, trous compris : 04, 34 et 89 par
 * exemple n'existent pas. Un code hors plage ne reçoit donc aucun libellé plutôt
 * qu'un libellé approché.
 */
const SECTIONS: ReadonlyArray<{ de: number; a: number; lettre: string; libelle: string }> = [
  { de: 1, a: 3, lettre: 'A', libelle: 'Agriculture, sylviculture et pêche' },
  { de: 5, a: 9, lettre: 'B', libelle: 'Industries extractives' },
  { de: 10, a: 33, lettre: 'C', libelle: 'Industrie manufacturière' },
  { de: 35, a: 35, lettre: 'D', libelle: "Production et distribution d'électricité et de gaz" },
  { de: 36, a: 39, lettre: 'E', libelle: "Production et distribution d'eau, déchets et dépollution" },
  { de: 41, a: 43, lettre: 'F', libelle: 'Construction' },
  { de: 45, a: 47, lettre: 'G', libelle: "Commerce et réparation d'automobiles et de motocycles" },
  { de: 49, a: 53, lettre: 'H', libelle: 'Transports et entreposage' },
  { de: 55, a: 56, lettre: 'I', libelle: 'Hébergement et restauration' },
  { de: 58, a: 63, lettre: 'J', libelle: 'Information et communication' },
  { de: 64, a: 66, lettre: 'K', libelle: "Activités financières et d'assurance" },
  { de: 68, a: 68, lettre: 'L', libelle: 'Activités immobilières' },
  { de: 69, a: 75, lettre: 'M', libelle: 'Activités spécialisées, scientifiques et techniques' },
  { de: 77, a: 82, lettre: 'N', libelle: 'Services administratifs et de soutien' },
  { de: 84, a: 84, lettre: 'O', libelle: 'Administration publique' },
  { de: 85, a: 85, lettre: 'P', libelle: 'Enseignement' },
  { de: 86, a: 88, lettre: 'Q', libelle: 'Santé humaine et action sociale' },
  { de: 90, a: 93, lettre: 'R', libelle: 'Arts, spectacles et activités récréatives' },
  { de: 94, a: 96, lettre: 'S', libelle: 'Autres activités de services' },
  { de: 97, a: 98, lettre: 'T', libelle: "Activités des ménages en tant qu'employeurs" },
  { de: 99, a: 99, lettre: 'U', libelle: 'Activités extra-territoriales' },
];

/**
 * La section d'un code ou d'une division — `''` si le code n'en désigne aucune.
 *
 * Une chaîne vide plutôt qu'un « Autre » fourre-tout : un code hors nomenclature
 * vient d'une saisie fautive, et lui coller une étiquette la rendrait invisible.
 */
export function libelleSection(codeOuDivision: string): string {
  const division = Number((codeOuDivision ?? '').slice(0, 2));
  if (!Number.isInteger(division)) return '';
  return SECTIONS.find((s) => division >= s.de && division <= s.a)?.libelle ?? '';
}

/** La lettre de section (`J`), pour qui veut la chercher au clavier. */
export function lettreSection(codeOuDivision: string): string {
  const division = Number((codeOuDivision ?? '').slice(0, 2));
  if (!Number.isInteger(division)) return '';
  return SECTIONS.find((s) => division >= s.de && division <= s.a)?.lettre ?? '';
}

function effectif(nb: number): string {
  return `${nb} client${nb > 1 ? 's' : ''}`;
}

/**
 * Les entrées proposées au choix, classes et divisions mêlées.
 *
 * LA DIVISION N'APPARAÎT QUE SI ELLE REGROUPE PLUSIEURS CLASSES. Une division
 * qui n'en contient qu'une viserait exactement les mêmes clients que cette
 * classe : deux entrées pour un même résultat font hésiter sans rien offrir.
 *
 * L'ordre est celui de la nomenclature — division, puis ses classes — parce que
 * c'est celui dans lequel on cherche : on descend d'un métier vers ses
 * spécialités, jamais l'inverse.
 */
export function optionsNaf(presents: readonly CodeNafPresent[]): OptionNaf[] {
  const divisions = new Map<string, { nb: number; classes: CodeNafPresent[] }>();

  for (const { code, nb } of presents) {
    if (!code) continue;
    const division = code.slice(0, 2);
    const entree = divisions.get(division) ?? { nb: 0, classes: [] };
    entree.nb += nb;
    entree.classes.push({ code, nb });
    divisions.set(division, entree);
  }

  const options: OptionNaf[] = [];
  for (const division of [...divisions.keys()].sort()) {
    const { nb, classes } = divisions.get(division)!;
    const section = libelleSection(division);
    const lettre = lettreSection(division);

    if (classes.length > 1) {
      options.push({
        valeur: division,
        libelle: `${division} — toute la division`,
        detail: [section, lettre, effectif(nb)].filter(Boolean).join(' · '),
        groupe: true,
      });
    }
    for (const c of [...classes].sort((a, b) => a.code.localeCompare(b.code))) {
      options.push({
        valeur: c.code,
        libelle: c.code,
        detail: [section, lettre, effectif(c.nb)].filter(Boolean).join(' · '),
        groupe: false,
      });
    }
  }
  return options;
}
