/**
 * L'état affiché d'un numéro de TVA — dérivation PURE.
 * ---------------------------------------------------------------------------
 * Sorti du composant à dessein. Le harnais de test React n'existe pas dans ce
 * dépôt, et `vitest.config.ts` pose `css: false` : les classes Tailwind ne sont
 * pas résolues, donc ce qu'un test de badge voudrait vérifier — la variante de
 * couleur — est précisément ce qu'il ne pourrait pas voir. En sortant la
 * dérivation ici, on obtient l'essentiel de la valeur sans monter React.
 *
 * ---------------------------------------------------------------------------
 * ⚠️ « INVALIDE » S'AFFICHE EN ORANGE, JAMAIS EN ROUGE.
 *
 * C'est la décision la plus importante du fichier, et elle vient du métier, pas
 * de l'esthétique. Une entreprise française réelle et en activité mais non
 * immatriculée aux opérations intracommunautaires répond « invalide » à VIES : le
 * numéro est syntaxiquement juste, la clé est bonne, l'entreprise existe. Une
 * microentreprise en franchise en base de TVA est dans ce cas PAR CONSTRUCTION.
 *
 * Le rouge (`danger`) dit « erreur, corrigez ». La sémantique exacte est celle du
 * `warning` de `validateField` : syntaxiquement bon, non confirmé. Le rouge est
 * réservé à l'échec de la CLÉ DE CONTRÔLE, qui est une vraie faute de saisie et
 * que `validateField` signale en amont, avant tout appel réseau.
 *
 * Mettre du rouge ici ferait courir un comptable après un numéro parfaitement
 * correct. Un test fige la décision.
 */

import type { BadgeProps } from '../ui/Badge';

export type StatutTvaAffiche = 'non_verifie' | 'valide' | 'invalide' | 'indisponible';

export type IconeTva = 'horloge' | 'coche' | 'alerte' | 'reseau' | 'chargement';

export interface EtatTva {
  variant: NonNullable<BadgeProps['variant']>;
  icone: IconeTva;
  texte: string;
  infobulle: string;
  /** L'infobulle fait deux à quatre phrases : un `title` HTML ne suffit pas. */
  anime: boolean;
}

export interface EntreeEtatTva {
  numero: string | null | undefined;
  statut: StatutTvaAffiche | null | undefined;
  /** Ce que VIES a renvoyé comme raison sociale, s'il en a renvoyé une. */
  nomVies?: string | null;
  /** Ce que le cabinet a en base, pour la comparaison au regard de l'humain. */
  nomEnBase?: string | null;
  verifieLe?: string | null;
  /** Vérification en cours : état local du bouton, jamais persisté. */
  enCours?: boolean;
  /**
   * Indisponibilité TRANSITOIRE, rendue par le dernier appel. Elle n'est jamais
   * en base — la colonne `tva_verif_statut` n'a que trois valeurs — et elle
   * disparaît au rechargement. Elle PRIME sur le statut persisté le temps qu'on
   * la voie.
   */
  indisponibleTransitoire?: boolean;
}

function dateLisible(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString('fr-FR');
}

/**
 * Rend `null` quand il n'y a rien à afficher — pas de numéro, donc rien à dire.
 * L'appelant n'affiche alors aucun badge, plutôt qu'un badge vide.
 */
export function etatTva(entree: EntreeEtatTva): EtatTva | null {
  if (entree.enCours) {
    return {
      variant: 'gray',
      icone: 'chargement',
      texte: 'Verification...',
      infobulle: 'Interrogation du registre europeen VIES. Le service repond en une a quatre secondes.',
      anime: true,
    };
  }

  const numero = (entree.numero ?? '').trim();
  if (!numero) return null;

  // L'indisponibilité prime : elle décrit le dernier appel, et le statut
  // persisté ne dit rien de ce qui vient de se passer.
  if (entree.indisponibleTransitoire) {
    return {
      variant: 'orange',
      icone: 'reseau',
      texte: 'VIES indisponible',
      infobulle:
        "Le registre europeen n'a pas pu verifier ce numero. Le statut precedent est " +
        "conserve : aucune conclusion n'est tiree du numero lui-meme. Reessayez dans " +
        'quelques instants.',
      anime: false,
    };
  }

  const quand = dateLisible(entree.verifieLe);

  switch (entree.statut) {
    case 'valide': {
      const nomVies = (entree.nomVies ?? '').trim();
      const nomBase = (entree.nomEnBase ?? '').trim();
      /**
       * Comparaison AU REGARD DE L'HUMAIN, jamais automatique. « SA SODIMAS »
       * face à un `nom_entreprise` « SODIMAS » est une divergence de forme, pas
       * une anomalie ; un score de similarité produirait des faux positifs
       * anxiogènes. On signale la divergence, on ne la juge pas — la fiche
       * affiche les deux côte à côte.
       */
      const divergent =
        nomVies !== '' && nomBase !== '' && normaliserNom(nomVies) !== normaliserNom(nomBase);

      return divergent
        ? {
            variant: 'orange',
            icone: 'alerte',
            texte: 'Valide, raison sociale differente',
            infobulle:
              `VIES confirme ce numero${quand ? ` (verifie le ${quand})` : ''}, mais la raison ` +
              `sociale qu'il renvoie — « ${nomVies} » — differe de celle en base — « ${nomBase} ». ` +
              "C'est souvent une difference de forme, pas une erreur.",
            anime: false,
          }
        : {
            variant: 'green',
            icone: 'coche',
            texte: 'Valide',
            infobulle:
              `Numero actif au registre des operations intracommunautaires` +
              `${quand ? `, verifie le ${quand}` : ''}${nomVies ? ` — ${nomVies}` : ''}.`,
            anime: false,
          };
    }

    case 'invalide':
      return {
        // ⚠️ ORANGE, PAS `danger`. Voir l'avertissement en tête de fichier.
        variant: 'orange',
        icone: 'alerte',
        texte: 'Non confirme par VIES',
        infobulle:
          `Ce numero n'est pas actif au registre des operations intracommunautaires` +
          `${quand ? ` (verifie le ${quand})` : ''}. Cela ne veut pas dire qu'il est mal ` +
          'saisi : une entreprise en franchise en base de TVA, ou qui n\'a jamais demande ' +
          'son numero intracommunautaire, repond « non » avec un numero pourtant correct.',
        anime: false,
      };

    case 'indisponible':
      // Ne devrait pas venir de la base — la colonne n'a que trois valeurs — mais
      // si cela arrivait, on le traite comme une non-information et non un verdict.
      return {
        variant: 'orange',
        icone: 'reseau',
        texte: 'VIES indisponible',
        infobulle: "Le registre europeen n'a pas pu verifier ce numero.",
        anime: false,
      };

    default:
      return {
        variant: 'gray',
        icone: 'horloge',
        texte: 'Non verifie',
        infobulle:
          'Ce numero est calcule depuis le SIREN et syntaxiquement correct, mais il ' +
          "n'a pas encore ete confronte au registre europeen. Rien n'est envoye a " +
          'Bruxelles sans un clic.',
        anime: false,
      };
  }
}

/** Comparaison indulgente : casse, accents, ponctuation et forme juridique. */
function normaliserNom(nom: string): string {
  return nom
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toUpperCase()
    .replace(/\b(SA|SAS|SASU|SARL|EURL|SCI|SNC|SELARL)\b/g, '')
    .replace(/[^A-Z0-9]/g, '');
}
