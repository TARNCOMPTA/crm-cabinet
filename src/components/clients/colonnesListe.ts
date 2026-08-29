/**
 * Ce que la liste clients demande vraiment à la base — et rien de plus.
 * ---------------------------------------------------------------------------
 * LE DÉFAUT CORRIGÉ. `loadClients` faisait un `select('*')` : soixante colonnes,
 * tout le portefeuille, sans limite. Mesuré sur 403 dossiers : **1,11 Mo** de
 * JSON à chaque ouverture de l'écran, dont 203 Ko de `resume_ia` — un résumé
 * généré par IA que la liste n'affiche NULLE PART. Avec les seules colonnes
 * utiles, la même requête rend 373 Ko, et le coût grandit linéairement avec le
 * portefeuille : ce qui coûte 1 Mo à 400 dossiers en coûtera 2 à 800.
 *
 * ⚠️ CE FICHIER EST UN GARDE-FOU, PAS UNE LISTE DE COURSES. Le danger d'une
 * sélection explicite est d'oublier un champ : il arrive `undefined` et l'écran
 * affiche un vide au lieu d'une erreur — personne ne le voit avant le client.
 * D'où le montage en deux temps : la liste est déclarée UNE fois ci-dessous,
 * `ClientListe` en est déduit par `Pick`, et tout le sous-arbre de l'écran
 * emploie ce type. Lire une colonne absente d'ici ne compile plus.
 *
 * Pour ajouter une colonne à l'écran : l'ajouter ICI d'abord. Le compilateur
 * indique ensuite tout ce qui reste à faire.
 */

import type { Database } from '../../types/database';

/**
 * Les colonnes lues par l'écran, recensées dans son sous-arbre complet :
 * `ClientsTable` (affichage et saisie sur place), `useClientFilters`
 * (recherche, filtres, tri) et `Clients.tsx` (mise à jour optimiste).
 */
export const COLONNES_LISTE = [
  'id',
  'nom_entreprise',
  'dirigeant',
  'numero_dossier',
  'siren',
  'siret',
  'ville',
  'regime_fiscal',
  'date_cloture',
  'statut',
  'email',
  // Affichée par `LegalFormDisplay` dans la colonne Entreprise.
  'forme_juridique',
  // Jamais affiché, mais la recherche le balaie : « Rechercher par nom, SIRET,
  // numero de dossier... » remonte aussi sur le contact principal.
  'contact_principal',
] as const satisfies readonly (keyof Database['public']['Tables']['clients']['Row'])[];

/** Les collaborateurs rattachés, tels que la jointure PostgREST les rend. */
export interface CollaborateurRattache {
  id: string;
  user_id: string;
  /** `client_collaborators.role` : DEFAULT sans NOT NULL, donc nullable. */
  role: string | null;
  user?: { prenom: string | null; nom: string | null; avatar_color?: string | null } | null;
}

/**
 * Un client TEL QUE LA LISTE LE CONNAÎT.
 *
 * Volontairement plus étroit que la ligne complète : c'est ce qui fait tomber au
 * typage la lecture d'une colonne qu'on n'a pas demandée, au lieu de la laisser
 * arriver `undefined` à l'écran.
 */
export type ClientListe = Pick<
  Database['public']['Tables']['clients']['Row'],
  (typeof COLONNES_LISTE)[number]
> & {
  collaborators?: CollaborateurRattache[];
};

/**
 * La projection PostgREST.
 *
 * ⚠️ ÉCRITE EN CLAIR, ET NON CALCULÉE PAR `COLONNES_LISTE.join(',')`. Le client
 * PostgREST déduit le type de retour EN LISANT LA CHAÎNE : une chaîne calculée
 * n'a que le type `string`, et il rend alors `GenericStringError[]` — on perdrait
 * précisément le typage qui fait tout l'intérêt du montage.
 *
 * Les deux ne peuvent pas diverger en silence : `colonnesListe.test.ts` échoue
 * si la projection cesse de correspondre à `COLONNES_LISTE`.
 */
export const SELECT_LISTE =
  'id,nom_entreprise,dirigeant,numero_dossier,siren,siret,ville,regime_fiscal,date_cloture,statut,email,forme_juridique,contact_principal,collaborators:client_collaborators(id,user_id,role,user:profiles(prenom,nom,avatar_color))' as const;
