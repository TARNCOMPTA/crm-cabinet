/**
 * Numéro de TVA intracommunautaire — miroir côté navigateur.
 * ---------------------------------------------------------------------------
 * ⚠️ CE MODULE N'EST PAS L'AUTORITÉ. Le numéro est calculé par le déclencheur
 * `clients_calculer_tva_intracom` en base, et `crm_meta.numero_tva_fr` est la
 * seule implémentation qui compte. La raison est dans le SQL : `siren` est écrit
 * par quatre chemins dont trois n'ont aucun JavaScript dans la boucle — le
 * déclencheur du SIRET, la synchronisation INPI côté serveur, le cron nocturne.
 * Un calcul en TypeScript laisserait le numéro vide sur tous les clients
 * synchronisés la nuit.
 *
 * Ce que ce module sert : afficher, et valider une saisie AVANT de l'envoyer.
 * Les deux implémentations doivent rendre le même résultat, et
 * `tests/schema.test.ts` comme `src/lib/tva.test.ts` emploient les MÊMES numéros
 * d'or — si l'une dérive, l'autre le dit.
 */

import { cleLuhn } from './cles';

/** Deux lettres de pays, puis 2 à 13 caractères alphanumériques. */
export const TVA_INTRACOM_RE = /^[A-Z]{2}[0-9A-Z]{2,13}$/;

/** Nettoie une saisie : majuscules, ni espaces ni ponctuation. */
export function normaliserNumeroTva(valeur: string | null | undefined): string {
  return (valeur ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');
}

/**
 * Ce que le bouton « Vérifier » doit faire, selon ce qui est en base et ce qui
 * est tapé.
 * ---------------------------------------------------------------------------
 * La route de vérification relit `tva_intracom` DEPUIS LA BASE quand on lui
 * passe un `clientId`. En lecture, base et écran disent la même chose et il n'y
 * a rien à décider. En édition, non : taper un nouveau numéro puis cliquer
 * « Vérifier » avant d'enregistrer faisait vérifier l'ANCIEN, et affichait son
 * verdict sous le nouveau — un « valide » rassurant sur un numéro que personne
 * n'avait contrôlé.
 *
 * D'où deux chemins, et un seul endroit pour choisir entre eux :
 *
 *   `enregistrable: true`   le numéro tapé est celui de la base (ou rien n'est
 *                           en cours de saisie) : on vérifie par `clientId`, et
 *                           le verdict est retenu en base.
 *   `enregistrable: false`  le champ porte autre chose : contrôle ponctuel du
 *                           numéro tapé, aucune écriture. Le verdict ne vaut
 *                           qu'à l'écran, et le message doit le dire.
 *
 * La comparaison porte sur les numéros NORMALISÉS : « FR 40 303 265 045 » et
 * « fr40303265045 » sont le même numéro, et repartir en contrôle ponctuel pour
 * une différence d'espaces priverait l'utilisateur de l'enregistrement.
 */
export interface VerificationADemander {
  /** Le numéro à soumettre, normalisé. Vide : il n'y a rien à vérifier. */
  numero: string;
  /** Le verdict sera-t-il retenu en base ? */
  enregistrable: boolean;
}

export function verificationADemander(
  numeroEnregistre: string | null | undefined,
  /** `undefined` hors édition : il n'y a pas de saisie en cours. */
  numeroSaisi?: string | null
): VerificationADemander {
  const enregistre = normaliserNumeroTva(numeroEnregistre);
  if (numeroSaisi === undefined) return { numero: enregistre, enregistrable: true };

  const saisi = normaliserNumeroTva(numeroSaisi);
  return saisi === enregistre
    ? { numero: enregistre, enregistrable: true }
    : { numero: saisi, enregistrable: false };
}

/**
 * Numéro français depuis un SIREN : `FR` + clé + SIREN.
 * clé = (12 + 3 × (SIREN mod 97)) mod 97
 *
 * Vérifié contre VIES le 2026-08-03 : 303265045 → FR40303265045 (SA SODIMAS).
 */
export function calculerTvaFr(siren: string | null | undefined): string | null {
  const chiffres = (siren ?? '').replace(/\D/g, '');
  if (chiffres.length !== 9) return null;
  const cle = (12 + 3 * (Number(chiffres) % 97)) % 97;
  return `FR${String(cle).padStart(2, '0')}${chiffres}`;
}

export type ControleCleTva = 'ok' | 'cle_fausse' | 'longueur' | 'format' | 'hors_france';

/**
 * Contrôle local de la clé, pour dire ce qu'on peut dire sans réseau.
 *
 * ⚠️ CE CONTRÔLE NE VAUT QUE POUR LA FRANCE. Chaque État membre a sa propre
 * règle de composition, et les implémenter toutes serait s'engager à les suivre.
 * Un numéro étranger bien formé rend donc `hors_france` : la clé ne peut pas être
 * vérifiée ici, ce qui n'est pas la même chose qu'être fausse. C'est VIES qui
 * tranche.
 */
export function verifierCleTvaFr(numero: string | null | undefined): ControleCleTva {
  const propre = normaliserNumeroTva(numero);
  if (!TVA_INTRACOM_RE.test(propre)) return 'format';
  if (!propre.startsWith('FR')) return 'hors_france';
  if (propre.length !== 13) return 'longueur';

  const siren = propre.slice(4);
  // Le SIREN porte sa propre clé de Luhn : un SIREN faux rend le numéro faux,
  // même si la clé à deux chiffres correspond.
  if (!cleLuhn(siren, 9)) return 'cle_fausse';
  return calculerTvaFr(siren) === propre ? 'ok' : 'cle_fausse';
}

/**
 * Message de contrôle à afficher sous le champ de saisie.
 *
 * ⚠️ POURQUOI PAS DANS `validateField` de `incompleteFieldsConfig.ts`, où vivent
 * les autres contrôles de champ : cette fonction n'accepte que des
 * `TrackedFieldKey`, et `tva_intracom` n'en est délibérément pas un — il est
 * calculé par la base dès qu'un SIREN existe, donc rempli à ~100 %, et un champ
 * suivi toujours rempli DILUE le score des champs qui manquent vraiment. Un
 * `case 'tva_intracom'` y serait donc du code mort : l'écran des fiches
 * incomplètes n'affiche jamais ce champ.
 *
 * Les trois niveaux reprennent la sémantique de `validateField` : `invalid` pour
 * une faute de saisie certaine, `warning` pour ce qui n'est pas vérifiable ici,
 * `valid` sinon.
 */
export interface ControleAffichable {
  niveau: 'valid' | 'warning' | 'invalid';
  message: string;
}

export function controlerSaisieTva(valeur: string | null | undefined): ControleAffichable | null {
  const propre = normaliserNumeroTva(valeur);
  if (!propre) return null;

  switch (verifierCleTvaFr(propre)) {
    case 'ok':
      return { niveau: 'valid', message: 'Cle de controle coherente.' };
    case 'format':
      return {
        niveau: 'invalid',
        message: 'Format attendu : deux lettres de pays puis 2 a 13 caracteres, ex. FR40303265045.',
      };
    case 'longueur':
      return { niveau: 'invalid', message: 'Un numero francais fait 13 caracteres : FR + 11 chiffres.' };
    case 'cle_fausse':
      // Le SEUL cas rouge de tout l'axe TVA : la cle est arithmetiquement fausse,
      // c'est donc une faute de saisie et rien d'autre.
      return { niveau: 'invalid', message: 'La cle de controle ne correspond pas au SIREN.' };
    case 'hors_france':
      return {
        niveau: 'warning',
        message: "Numero etranger : la cle ne peut pas etre verifiee localement, seul VIES tranchera.",
      };
  }
}

/** « FR40303265045 » → « FR 40 303 265 045 ». Affichage seulement. */
export function formaterNumeroTva(valeur: string | null | undefined): string {
  const propre = normaliserNumeroTva(valeur);
  if (!propre.startsWith('FR') || propre.length !== 13) return propre;
  return `FR ${propre.slice(2, 4)} ${propre.slice(4, 7)} ${propre.slice(7, 10)} ${propre.slice(10)}`;
}
