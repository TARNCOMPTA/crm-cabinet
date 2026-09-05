import { getCollaboratorColor, getCollaboratorInitials } from './collaboratorUtils';

/**
 * Qui travaille sur ce bilan — et la différence, longtemps invisible, entre
 * deux faits que l'écran confondait.
 * ---------------------------------------------------------------------------
 * La carte d'un bilan ne montrait qu'UNE personne : `bilan_cards.assignee_id`,
 * c'est-à-dire qui pilote CE bilan-là. Or un dossier est tenu par une équipe —
 * `client_collaborators` en porte la liste, avec un rôle par ligne (principal,
 * superviseur, paie). Regarder une carte ne disait donc pas à qui s'adresser :
 * il fallait ouvrir la fiche client pour l'apprendre.
 *
 * Ce module rend la liste des vignettes à afficher, initiales comprises. Il est
 * pur et testé parce que quatre règles s'y cachent, et qu'aucune ne se voit à
 * l'œil nu sur du JSX :
 *
 *   · LE RESPONSABLE DU BILAN N'EST PAS FORCÉMENT DANS L'ÉQUIPE DU DOSSIER.
 *     Un bilan peut être confié à quelqu'un qui n'y est pas affecté — un
 *     renfort de saison, un associé qui reprend un retard. L'omettre le rendrait
 *     invisible sur sa propre carte ; le fondre dans l'équipe mentirait sur le
 *     dossier. Il est donc affiché, à son rang, et marqué.
 *   · UNE MÊME PERSONNE PEUT PARAÎTRE DEUX FOIS. Elle est presque toujours à la
 *     fois responsable du bilan et collaboratrice du dossier ; sans
 *     déduplication, sa vignette s'afficherait en double.
 *   · LES INITIALES VIENNENT DU PRÉNOM ET DU NOM QUAND ON LES A. « Aymeric
 *     Hébrard » donne AH, « Vanessa Sirven » VS. Le repli sur `display_name`
 *     n'existe que pour les comptes qui n'ont ni l'un ni l'autre — il y en a.
 *   · L'ORDRE NE DÉPEND PAS DE QUI EST RESPONSABLE. Une première version
 *     plaçait le responsable en tête, ce qui se défendait tant que les
 *     vignettes n'étaient qu'un affichage. Elles sont devenues cliquables — un
 *     clic désigne le responsable — et l'ordre s'est mis à bouger SOUS LE
 *     POINTEUR : cliquer sur la deuxième pastille l'amenait en première
 *     position, si bien qu'un second clic au même endroit tombait sur
 *     quelqu'un d'autre et le désignait à sa place. Vu à l'écran. L'ordre est
 *     donc alphabétique et stable ; c'est le cercle qui dit qui est
 *     responsable, et lui seul.
 */

/** Une ligne de `client_collaborators`, jointe au profil de la personne. */
export interface CollaborateurDossier {
  user_id: string;
  /** `client_collaborators.role` : DEFAULT sans NOT NULL, donc nullable. */
  role?: string | null;
  user?: {
    prenom?: string | null;
    nom?: string | null;
    display_name?: string | null;
    avatar_color?: string | null;
  } | null;
}

/** Le responsable du bilan, tel que la carte le porte. */
export interface ResponsableBilan {
  id: string;
  prenom?: string | null;
  nom?: string | null;
  display_name?: string | null;
  avatar_color?: string | null;
}

export interface Vignette {
  userId: string;
  nomComplet: string;
  initiales: string;
  couleur: string;
  /** Le rôle sur le dossier, absent pour un responsable hors équipe. */
  role: string | null;
  /** Vrai pour la personne à qui CE bilan est attribué. */
  responsableBilan: boolean;
}

interface Identite {
  prenom?: string | null;
  nom?: string | null;
  display_name?: string | null;
}

/** « Aymeric Hébrard » → « Aymeric Hébrard » ; un compte sans nom → « Utilisateur ». */
export function nomComplet(identite: Identite | null | undefined): string {
  if (!identite) return 'Utilisateur';
  const compose = `${identite.prenom || ''} ${identite.nom || ''}`.trim();
  return compose || identite.display_name?.trim() || 'Utilisateur';
}

/** « Aymeric » + « Hébrard » → « AH ». */
export function initiales(identite: Identite | null | undefined): string {
  const prenom = identite?.prenom?.trim();
  const nom = identite?.nom?.trim();
  if (prenom && nom) return (prenom[0] + nom[0]).toUpperCase();
  // Sans les deux champs, on retombe sur la règle générale des avatars du
  // dossier — un seul mot donne ses deux premières lettres.
  return getCollaboratorInitials(nomComplet(identite) === 'Utilisateur' ? '' : nomComplet(identite));
}

/**
 * Les vignettes d'une carte de bilan : l'équipe du dossier, plus le responsable
 * s'il n'en fait pas partie, par ordre alphabétique. Jamais deux fois la même
 * personne, et l'ordre ne bouge pas quand le responsable change.
 */
export function vignettesDuBilan(
  collaborateurs: CollaborateurDossier[] | null | undefined,
  responsable: ResponsableBilan | null | undefined
): Vignette[] {
  const equipe = (collaborateurs || []).filter((c) => c.user_id);

  const vues = new Set<string>();
  const vignettes: Vignette[] = [];

  function ajouter(
    userId: string,
    identite: Identite | null | undefined,
    couleurChoisie: string | null | undefined,
    role: string | null
  ) {
    if (vues.has(userId)) return;
    vues.add(userId);
    vignettes.push({
      userId,
      nomComplet: nomComplet(identite),
      initiales: initiales(identite),
      couleur: getCollaboratorColor(userId, couleurChoisie),
      role,
      responsableBilan: userId === responsable?.id,
    });
  }

  for (const c of equipe) {
    ajouter(c.user_id, c.user, c.user?.avatar_color, c.role ?? null);
  }

  // Le responsable qui n'est PAS dans l'équipe entre quand même — sinon il
  // serait invisible sur le bilan qu'il pilote. Sans rôle : il n'en a aucun sur
  // ce dossier, et lui en inventer un serait pire que de n'en montrer aucun.
  if (responsable?.id) {
    ajouter(responsable.id, responsable, responsable.avatar_color, null);
  }

  return vignettes.sort((a, b) => a.nomComplet.localeCompare(b.nomComplet, 'fr'));
}
