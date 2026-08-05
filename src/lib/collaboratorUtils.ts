export function getCollaboratorInitials(fullName: string): string {
  if (!fullName || fullName.trim() === '') return '?';

  const names = fullName.trim().split(/\s+/);

  if (names.length === 1) {
    return names[0].substring(0, 2).toUpperCase();
  }

  return (names[0][0] + names[names.length - 1][0]).toUpperCase();
}

/**
 * Couleurs d'avatar — pigments sourds accordés à la charte.
 *
 * Deux contraintes, et elles tirent en sens opposés :
 *
 *   · elles doivent rester DISTINCTES les unes des autres, puisque leur seul
 *     rôle est de reconnaître un collaborateur d'un coup d'œil. Décliner
 *     l'accent en trente nuances de bordeaux les rendrait inutiles ;
 *   · elles ne doivent pas jurer sur un canevas crème et bordeaux. Les trente
 *     couleurs vives de Tailwind qui figuraient ici — cyan, lime, fuchsia —
 *     criaient sur la page.
 *
 * D'où cette gamme de tons rabattus, tous dans la même plage de luminosité :
 * assez sombres pour que les initiales blanches restent lisibles, assez sourds
 * pour cohabiter. Le bordeaux du cabinet ouvre la liste.
 */
export const AVATAR_COLORS = [
  '#7C2D5E', // Bordeaux — l'accent du cabinet
  '#63244B', // Bordeaux profond
  '#B04A80', // Rose ancien
  '#8E3A67', // Fuchsia sourd
  '#6B4A7E', // Prune
  '#55407A', // Violet ardoise
  '#45477F', // Indigo sourd
  '#3F5F8A', // Bleu de Prusse
  '#3F7293', // Bleu ardoise
  '#2F5674', // Bleu ardoise profond
  '#33707A', // Bleu-vert sourd
  '#2F6B63', // Sarcelle profonde
  '#3F7D54', // Vert
  '#336344', // Vert profond
  '#5A7A3A', // Olive
  '#7A7A33', // Olive dore
  '#B5781F', // Dore
  '#8E5E19', // Ambre profond
  '#A5602A', // Terre de Sienne
  '#B3402F', // Rouge
  '#8F3325', // Brique
  '#A34A55', // Bois de rose
  '#7A4A4A', // Taupe rose
  '#6E5A4E', // Brun chaud
  '#7A6F74', // Gris chaud
  '#5C5258', // Gris sourd
  '#4A5A5F', // Ardoise froide
  '#445565', // Bleu-gris
  '#5F4B66', // Mauve grise
  '#3E3A44', // Anthracite
];

export function getCollaboratorColor(userId: string | undefined | null, customColor?: string | null): string {
  if (customColor) return customColor;

  if (!userId) return AVATAR_COLORS[0];

  let hash = 0;
  for (let i = 0; i < userId.length; i++) {
    hash = userId.charCodeAt(i) + ((hash << 5) - hash);
  }

  const index = Math.abs(hash) % AVATAR_COLORS.length;
  return AVATAR_COLORS[index];
}

export function getContrastColor(hexColor: string): string {
  const hex = hexColor.replace('#', '');
  const r = parseInt(hex.substring(0, 2), 16);
  const g = parseInt(hex.substring(2, 4), 16);
  const b = parseInt(hex.substring(4, 6), 16);

  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;

  return luminance > 0.5 ? '#000000' : '#FFFFFF';
}
