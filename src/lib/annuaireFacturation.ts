/**
 * L'annuaire de la facturation électronique, côté écran.
 * ---------------------------------------------------------------------------
 * Le navigateur n'appelle jamais l'annuaire directement : il passe par
 * `/api/facturation-electronique/annuaire`, donc par le cookie de session.
 * C'est le serveur qui sort, comme pour VIES.
 *
 * ⚠️ CE FICHIER PORTE LA SEULE DÉCISION DÉLICATE DE LA FONCTIONNALITÉ :
 * que proposer, sachant ce que l'annuaire répond ET ce que la fiche porte
 * déjà. Elle est ici, pure et testée, plutôt que dans le JSX — parce qu'une
 * erreur à cet endroit ne se voit pas à l'écran : elle se voit six semaines
 * plus tard, quand une facture n'arrive pas.
 */

import { normaliserAdresseFacturation } from './facturationElectronique';
import { appelerFonction } from './api/fonctions';

export type EtatAnnuaire = 'une-adresse' | 'plusieurs' | 'inactives' | 'aucune' | 'indisponible';

export interface AdresseAnnuaire {
  identifiant: string;
  actif: boolean;
  nom: string | null;
  siren: string | null;
  ville: string | null;
}

export interface ResultatAnnuaire {
  success: true;
  siren: string;
  /** L'adresse déjà enregistrée sur la fiche, telle que le serveur l'a relue. */
  adresseEnregistree: string | null;
  etat: EtatAnnuaire;
  adresses: AdresseAnnuaire[];
  code: string;
  message: string;
}

export type Proposition =
  /** L'annuaire confirme ce que la fiche porte déjà : rien à faire, et le dire. */
  | { genre: 'identique'; adresse: AdresseAnnuaire }
  /** La fiche est vide et l'annuaire donne une seule adresse active. */
  | { genre: 'a-renseigner'; adresse: AdresseAnnuaire }
  /** La fiche porte AUTRE CHOSE. Le remplacement doit être un geste explicite. */
  | { genre: 'a-remplacer'; adresse: AdresseAnnuaire; actuelle: string }
  /** Plusieurs adresses actives : c'est le cabinet qui tranche. */
  | { genre: 'choix'; adresses: AdresseAnnuaire[] }
  /** Rien à proposer — et le message dit laquelle des trois raisons c'est. */
  | { genre: 'rien'; message: string };

/**
 * Deux adresses désignent-elles le même destinataire ?
 *
 * Comparaison sur la valeur NORMALISÉE — la même règle que celle qui écrit,
 * sans quoi « 303 265 045 00069 » saisi à la main paraîtrait différent de
 * « 30326504500069 » rendu par l'annuaire, et l'écran proposerait de remplacer
 * une adresse par elle-même.
 *
 * Casse ignorée : un identifiant Peppol ne se distingue pas par sa casse, et
 * proposer un remplacement pour un `0225:` contre `0225:` identique ne ferait
 * que du bruit sur lequel on finirait par cliquer sans lire.
 */
export function memeAdresse(a: string | null | undefined, b: string | null | undefined): boolean {
  const n = (v: string | null | undefined) => normaliserAdresseFacturation(v).toLowerCase();
  const ga = n(a);
  const gb = n(b);
  return ga !== '' && ga === gb;
}

/**
 * Ce que l'écran doit proposer. FONCTION PURE.
 *
 * `adresseActuelle` est passée à part plutôt que lue dans le résultat : en mode
 * édition, ce qui compte est la valeur EN COURS DE SAISIE, pas celle qui est en
 * base. Sans cela, taper une adresse puis lancer la recherche proposerait de
 * remplacer l'ancienne, celle que l'utilisateur vient justement de changer.
 */
export function propositionAnnuaire(
  resultat: ResultatAnnuaire,
  adresseActuelle: string | null | undefined
): Proposition {
  if (resultat.etat === 'une-adresse') {
    const adresse = resultat.adresses.find((a) => a.actif);
    // Défensif : `une-adresse` sans adresse active serait une incohérence du
    // serveur. On ne fabrique pas une proposition à partir de rien.
    if (!adresse) return { genre: 'rien', message: resultat.message };
    if (memeAdresse(adresseActuelle, adresse.identifiant)) return { genre: 'identique', adresse };
    const actuelle = (adresseActuelle ?? '').trim();
    return actuelle === ''
      ? { genre: 'a-renseigner', adresse }
      : { genre: 'a-remplacer', adresse, actuelle };
  }

  if (resultat.etat === 'plusieurs') {
    return { genre: 'choix', adresses: resultat.adresses.filter((a) => a.actif) };
  }

  // `inactives`, `aucune` et `indisponible` ne proposent RIEN, et surtout pas
  // la même chose : le message du serveur les distingue, et c'est lui qui
  // s'affiche. Écrire « aucune adresse » sur une indisponibilité ferait saisir
  // une adresse à la main par-dessus celle qui existe.
  return { genre: 'rien', message: resultat.message };
}

/** Interroge l'annuaire pour une fiche. */
export async function chercherAdresseAnnuaire(clientId: string): Promise<ResultatAnnuaire> {
  const rep = await appelerFonction<ResultatAnnuaire>('facturation-electronique/annuaire', {
    clientId,
  });
  if (!rep.ok || !rep.data) {
    throw new Error(rep.message ?? 'La recherche dans l’annuaire a échoué.');
  }
  return rep.data;
}
