/**
 * Le nom d'une personne, tel qu'on l'écrit dans un message à l'écran.
 * ---------------------------------------------------------------------------
 * Trois écrans annoncent « untel a été prévenu » après avoir créé une
 * notification — le tableau des bilans, la fiche d'un bilan, la liste des
 * tâches. Trois recompositions du nom auraient divergé, et c'est celle qu'on
 * aurait oublié de corriger qui aurait affiché « null null ».
 *
 * ⚠️ CETTE FONCTION NE REND JAMAIS DE CHAÎNE VIDE. Un message qui dirait
 * « a été prévenu » sans nom est pire qu'inutile : il laisse croire à un défaut
 * d'affichage là où il n'y a qu'une fiche incomplète. D'où le repli final.
 */

export interface PersonneAffichable {
  prenom?: string | null;
  nom?: string | null;
  display_name?: string | null;
  email?: string | null;
}

/**
 * L'ordre des sources suit celui de la base :
 *
 *   1. `display_name`, quand la personne a choisi comment on l'appelle ;
 *   2. « Prénom Nom », la forme courante d'un profil rempli ;
 *   3. l'un des deux seul, si l'autre manque ;
 *   4. l'adresse, qui identifie toujours quelqu'un ;
 *   5. « la personne concernée », qui ne ment pas.
 */
export function nomAffichable(p: PersonneAffichable | null | undefined): string {
  if (!p) return 'la personne concernee';

  const display = p.display_name?.trim();
  if (display) return display;

  // `filter(Boolean)` après `trim` : un prénom réduit à des espaces ne doit pas
  // produire « " " Dupont », avec sa double espace.
  const complet = [p.prenom?.trim(), p.nom?.trim()].filter(Boolean).join(' ');
  if (complet) return complet;

  const email = p.email?.trim();
  if (email) return email;

  return 'la personne concernee';
}
