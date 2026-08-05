/**
 * Découpage des adresses héritées, en un seul endroit.
 * ---------------------------------------------------------------------------
 * `clients.adresse` a longtemps été la seule colonne d'adresse : une chaîne
 * « 12 RUE de l Exemple, 81120 Villeneuve », parfois un objet JSON d'une version
 * antérieure de l'application. Elle est désormais doublée par des composants
 * (`adresse_ligne1`, `code_postal`, `ville`…) que le déclencheur
 * `clients_composer_adresse` recompose.
 *
 * POURQUOI CE MODULE EXISTE. Cinq parseurs concurrents redécoupaient cette
 * chaîne à la lecture, chacun avec ses angles morts :
 *
 *   · `src/lib/adresse.ts` ne traitait que le JSON ;
 *   · `contactsDirectoryService` faisait `split(',')`, donc cassait sur une rue
 *     contenant une virgule ;
 *   · `dashboardService` n'extrayait que la ville, par expression régulière ;
 *   · `CompanyFormModal` traitait le cas SANS virgule, seul des cinq ;
 *   · et un cinquième en SQL, dans `get_dashboard_stats`.
 *
 * Ce module porte la réunion des cas connus. Il sert au remplissage des fiches
 * que le découpage SQL n'a pas su traiter, et son ordre de tentatives est le
 * même que celui de la fonction SQL de `schema/increments/002` — les deux
 * doivent rendre le même résultat sur la même entrée.
 *
 * ⚠️ CE N'EST PAS UN VALIDATEUR D'ADRESSE. Il ne devine rien : ce qu'il ne sait
 * pas lire part entièrement dans `ligne1`, jamais réparti au hasard. Une adresse
 * mal découpée est réécrite dans `clients.adresse` par le déclencheur, donc une
 * erreur ici est destructrice — d'où le repli systématique plutôt que
 * l'approximation.
 */

export interface AdresseDecoupee {
  ligne1: string;
  codePostal: string;
  ville: string;
}

interface AdresseJson {
  ligne1?: string;
  codePostal?: string;
  ville?: string;
}

const VIDE: AdresseDecoupee = { ligne1: '', codePostal: '', ville: '' };

/** « … 81120 Villeneuve » : cinq chiffres, puis une ville d'au moins un caractère. */
const CP_VILLE = /^(\d{5})\s+(.+)$/;
/** Le cas sans virgule : « 12 RUE DES LILAS 31000 TOULOUSE ». */
const SANS_VIRGULE = /^(.*?)\s+(\d{5})\s+(.+)$/;

/**
 * Découpe une adresse héritée en ligne1 / code postal / ville.
 *
 * Quatre tentatives, dans cet ordre — et l'ordre compte :
 *
 *   1. le JSON `{"ligne1":…}` d'une version antérieure ;
 *   2. la dernière virgule gagnante, si ce qui la suit est « CP ville ». La
 *      DERNIÈRE et non la première : « ZAC des Portes, rue Lavoisier, 81000 Albi »
 *      se découpe correctement, là où un `split(',')` produisait trois morceaux
 *      dont deux faux ;
 *   3. sans virgule du tout, en repérant les cinq chiffres ;
 *   4. sinon, tout dans `ligne1`. Une adresse étrangère (code postal belge à
 *      quatre chiffres) atterrit ici, et c'est le bon résultat : mieux vaut une
 *      ligne1 complète qu'un code postal inventé.
 */
export function decouperAdresse(valeur: string | null | undefined): AdresseDecoupee {
  const brut = (valeur ?? '').trim();
  if (!brut) return { ...VIDE };

  if (brut.startsWith('{')) {
    const depuisJson = decouperJson(brut);
    if (depuisJson) return depuisJson;
    // JSON invalide ou sans champ connu : on continue avec le texte brut plutôt
    // que de rendre les accolades comme ligne1.
  }

  const derniereVirgule = brut.lastIndexOf(',');
  if (derniereVirgule !== -1) {
    const rue = brut.slice(0, derniereVirgule).trim();
    const reste = brut.slice(derniereVirgule + 1).trim();
    const m = CP_VILLE.exec(reste);
    if (m) return { ligne1: rue, codePostal: m[1]!, ville: m[2]!.trim() };
    return { ligne1: brut, codePostal: '', ville: '' };
  }

  const m = SANS_VIRGULE.exec(brut);
  if (m) return { ligne1: m[1]!.trim(), codePostal: m[2]!, ville: m[3]!.trim() };

  return { ligne1: brut, codePostal: '', ville: '' };
}

function decouperJson(brut: string): AdresseDecoupee | null {
  let objet: AdresseJson;
  try {
    objet = JSON.parse(brut) as AdresseJson;
  } catch {
    return null;
  }
  const ligne1 = (objet.ligne1 ?? '').trim();
  const codePostal = (objet.codePostal ?? '').trim();
  const ville = (objet.ville ?? '').trim();
  if (!ligne1 && !codePostal && !ville) return null;
  return { ligne1, codePostal, ville };
}

/**
 * Répartit une adresse INPI dans les colonnes de `clients`.
 *
 * Extraite en fonction pure et exportée pour une seule raison : la
 * concaténation qu'elle remplace vivait dans `ClientCreateModal`, donc était
 * intestable sans monter React.
 *
 * `complement`, `pays` et `codeInsee` sont optionnels dans `INPICompanyData` :
 * le chemin `action:'search'` ne les renvoie pas encore. Les lire ici les rend
 * disponibles dès que le serveur les fournira, sans une ligne de plus.
 */
export function repartirAdresseInpi(adresse: {
  ligne1?: string | null;
  codePostal?: string | null;
  ville?: string | null;
  complement?: string | null;
  pays?: string | null;
  codeInsee?: string | null;
}): {
  adresse_ligne1: string;
  adresse_complement: string;
  code_postal: string;
  ville: string;
  pays: string;
  code_insee: string;
} {
  const propre = (v: string | null | undefined) => (v ?? '').trim();
  const codePostal = propre(adresse.codePostal);
  return {
    adresse_ligne1: propre(adresse.ligne1),
    adresse_complement: propre(adresse.complement),
    code_postal: codePostal,
    ville: propre(adresse.ville),
    // On n'affirme un pays que si l'INPI l'a dit, ou si un code postal français
    // a été reconnu — même prudence que le remplissage SQL.
    pays: propre(adresse.pays) || (/^\d{5}$/.test(codePostal) ? 'France' : ''),
    code_insee: propre(adresse.codeInsee),
  };
}

/**
 * Recompose le texte lisible depuis les composants.
 *
 * Miroir exact du déclencheur `clients_composer_adresse`, et il faut qu'il le
 * reste : l'écran affiche le résultat de cette fonction avant l'enregistrement,
 * la base écrit celui du déclencheur après. Une divergence se verrait comme un
 * champ qui « bouge tout seul » au rechargement.
 *
 * « France » n'est jamais ajouté — `get_dashboard_stats` extrait la ville par
 * expression régulière sur la fin de la chaîne.
 */
export function composerAdresse(parties: {
  ligne1?: string | null;
  complement?: string | null;
  codePostal?: string | null;
  ville?: string | null;
  pays?: string | null;
}): string {
  let ligne = (parties.ligne1 ?? '').trim();
  const complement = (parties.complement ?? '').trim();
  if (complement) ligne = `${ligne} - ${complement}`.trim();

  const cpVille = [(parties.codePostal ?? '').trim(), (parties.ville ?? '').trim()]
    .filter(Boolean)
    .join(' ');

  const morceaux = [ligne, cpVille].filter(Boolean);

  const pays = (parties.pays ?? '').trim();
  if (pays && pays.toUpperCase() !== 'FRANCE') morceaux.push(pays);

  return morceaux.join(', ');
}
