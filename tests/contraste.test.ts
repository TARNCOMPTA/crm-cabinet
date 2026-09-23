/**
 * Le contraste du texte secondaire.
 * ---------------------------------------------------------------------------
 * ⚠️ CE FICHIER EXISTE PARCE QUE LE DEPOT PORTAIT DEUX CONVENTIONS OPPOSEES
 * POUR LE MEME ROLE, et que la minoritaire etait illisible.
 *
 * Le texte secondaire — une legende, une date, un compteur sous un libelle —
 * s'ecrivait de deux facons :
 *
 *   text-gray-500 dark:text-gray-400   402 usages   3,18:1 clair / 8,80:1 sombre
 *   text-gray-400 dark:text-gray-500   138 usages   2,00:1 clair / 5,54:1 sombre
 *
 * AUCUNE DES DEUX N'ATTEIGNAIT LE SEUIL EN MODE CLAIR. La charte a donc ete
 * tranchee le 2026-09-14 : le texte secondaire s'ecrit desormais
 *
 *   text-gray-600 dark:text-gray-400                 4,82:1 clair / 8,80:1 sombre
 *
 * 536 occurrences reprises, dont 109 qui n'avaient aucune variante sombre et
 * l'ont recue au passage — sans elle, `gray-600` serait tombe a 3,66:1 sur fond
 * sombre, c'est-a-dire PIRE que le `gray-500` de depart. Reparer un mode en
 * cassant l'autre n'est pas un progres.
 *
 * La seconde est la plus pale des deux DANS LES DEUX MODES. Ce n'est pas une
 * affaire de gout : c'est un rapport de luminance, calcule plus bas par la meme
 * formule que la norme, SUR LA PALETTE DU CABINET et non celle de Tailwind. Les
 * 86 occurrences qui portaient du VRAI TEXTE ont ete alignees sur la convention
 * majoritaire.
 *
 * ⚠️ CELA NE SUFFIT PAS A ATTEINDRE AA EN MODE CLAIR, et le taire serait
 * malhonnete : 3,18:1 reste sous 4,5:1. Il faudrait `gray-600`, voire
 * `gray-700` sur le fond de page. Voir la suite « ce que vaut reellement
 * chaque nuance » : la question y est figee, pas reglee.
 *
 * ⚠️ LES 75 AUTRES N'ONT PAS ETE TOUCHEES, ET C'EST DELIBERE. `text-gray-400`
 * sur une icone ou sur un separateur n'est pas du texte : la norme y demande
 * 3:1, et surtout la paleur y EST le signal. Tout aplatir aurait efface la
 * hierarchie visuelle au lieu de la servir. Le critere retenu — la presence
 * d'une taille de texte dans la meme classe — est grossier mais il separe
 * exactement ces deux familles.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

/** Luminance relative, formule WCAG 2.1. */
function luminance([r, g, b]: [number, number, number]): number {
  const f = (v: number) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}

/** Rapport de contraste entre deux couleurs, formule WCAG 2.1. */
export function contraste(a: [number, number, number], b: [number, number, number]): number {
  const [x, y] = [luminance(a), luminance(b)];
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}

/**
 * ⚠️ CES VALEURS SONT CELLES DU CABINET, PAS CELLES DE TAILWIND, et cette
 * distinction a failli me faire ecrire des chiffres faux.
 *
 * `src/styles/theme.css` (ex-`tailwind.config.js`) redefinit `gray`, `slate`, `zinc`, `neutral` et `stone`
 * sur une rampe de NEUTRES CHAUDS ancree sur `src/styles/tokens.css` : les
 * classes ecrites dans les composants ne changent pas, c'est ce qu'elles
 * designent qui change. Calculer un contraste sur le `gray-500` d'origine
 * (#6b7280) au lieu de celui du cabinet (#9a8d92) donne 4,83:1 au lieu de
 * 3,18:1 — de quoi declarer conforme ce qui ne l'est pas.
 *
 * C'est une mesure dans un vrai navigateur qui a rendu la couleur reellement
 * calculee, `rgb(154, 141, 146)`, et revele l'erreur.
 */
const BLANC: [number, number, number] = [255, 255, 255];
const FOND_PAGE: [number, number, number] = [247, 243, 240]; // gray-100, --canvas
const FOND_SOMBRE: [number, number, number] = [30, 22, 32]; // gray-900, --paper
const GRAY_400: [number, number, number] = [192, 180, 186];
const GRAY_500: [number, number, number] = [154, 141, 146];
const GRAY_600: [number, number, number] = [122, 111, 116];
const GRAY_700: [number, number, number] = [92, 82, 88];

const SEUIL_AA = 4.5;

describe('le calcul de contraste', () => {
  it('donne les valeurs de reference de la norme', () => {
    // Noir sur blanc : le maximum, 21:1.
    expect(contraste([0, 0, 0], BLANC)).toBeCloseTo(21, 1);
    // Blanc sur blanc : le minimum, 1:1.
    expect(contraste(BLANC, BLANC)).toBeCloseTo(1, 5);
  });
});

describe('ce que vaut reellement chaque nuance du texte secondaire', () => {
  /**
   * ⚠️ LE CONSTAT QUI DEPASSE LA CORRECTION FAITE, et qu'il ne faut pas taire :
   * en mode CLAIR, `gray-500` ne passe pas non plus. Aligner `gray-400` sur
   * `gray-500` a fait passer le texte secondaire de 2,00:1 a 3,18:1 — un gain
   * reel, mais le seuil AA est a 4,5:1 et il faudrait `gray-600` sur fond blanc,
   * `gray-700` sur le fond de page.
   *
   * Ce dernier pas n'a pas ete franchi ici parce qu'il assombrirait TOUT le
   * texte secondaire du produit — plus de quatre cents endroits — et que c'est
   * une decision de charte, pas une correction de defaut. Ces assertions le
   * figent noir sur blanc pour que la question reste posee.
   */
  it('les deux nuances ecartees echouaient en mode clair', () => {
    expect(contraste(GRAY_400, BLANC)).toBeLessThan(SEUIL_AA);
    expect(contraste(GRAY_500, BLANC)).toBeLessThan(SEUIL_AA);
  });

  it('la charte retenue, gray-600 sur blanc et gray-400 sur fond sombre, passe', () => {
    expect(contraste(GRAY_600, BLANC)).toBeGreaterThanOrEqual(SEUIL_AA);
    expect(contraste(GRAY_400, FOND_SOMBRE)).toBeGreaterThanOrEqual(SEUIL_AA);
  });

  /**
   * ⚠️ LA RESERVE QUI SUBSISTE, et qu'il vaut mieux ecrire que decouvrir.
   * Le texte pose DIRECTEMENT sur le fond de page (#f7f3f0) et non sur une
   * carte blanche tombe a 4,37:1 : il manque trois centiemes. La quasi-totalite
   * du texte secondaire vit sur des cartes blanches, ou la charte tient a
   * 4,82:1 ; le jour ou un ecran posera de la legende a meme le fond, il
   * faudra `gray-700` pour lui.
   */
  it('sur le fond de page, gray-600 manque de peu et gray-700 tient', () => {
    expect(contraste(GRAY_600, FOND_PAGE)).toBeLessThan(SEUIL_AA);
    expect(contraste(GRAY_600, FOND_PAGE)).toBeGreaterThan(4.3);
    expect(contraste(GRAY_700, FOND_PAGE)).toBeGreaterThanOrEqual(SEUIL_AA);
  });

  it('en mode sombre, gray-400 est nettement meilleur que gray-500', () => {
    expect(contraste(GRAY_400, FOND_SOMBRE)).toBeGreaterThan(contraste(GRAY_500, FOND_SOMBRE));
    expect(contraste(GRAY_400, FOND_SOMBRE)).toBeGreaterThanOrEqual(SEUIL_AA);
  });

  /**
   * ⚠️ CE CAS EST LA PREUVE PAR LA NEGATIVE, et il est le plus important du
   * fichier : sans lui, rien ne dirait POURQUOI l'autre convention a ete
   * retiree. Le jour ou quelqu'un la retablira en la croyant equivalente, ces
   * deux lignes lui montreront le chiffre.
   */
  it('la charte ameliore les deux modes par rapport aux deux conventions d avant', () => {
    // Clair : 2,00 et 3,18 -> 4,82.  Sombre : 5,54 -> 8,80.
    expect(contraste(GRAY_600, BLANC)).toBeGreaterThan(contraste(GRAY_500, BLANC));
    expect(contraste(GRAY_600, BLANC)).toBeGreaterThan(contraste(GRAY_400, BLANC));
    expect(contraste(GRAY_400, FOND_SOMBRE)).toBeGreaterThan(contraste(GRAY_500, FOND_SOMBRE));
  });
});

function fichiersTsx(racine: string): string[] {
  const trouves: string[] = [];
  for (const entree of readdirSync(racine, { withFileTypes: true })) {
    const chemin = join(racine, entree.name);
    if (entree.isDirectory()) trouves.push(...fichiersTsx(chemin));
    else if (entree.name.endsWith('.tsx')) trouves.push(chemin);
  }
  return trouves;
}

describe('aucun texte pale ne revient', () => {
  it('ne laisse ni gray-400 ni gray-500 sur du texte', () => {
    // ⚠️ `text-\[11px\]` EST DANS CE MOTIF PARCE QUE DEUX LIBELLES DU MENU
    // LATERAL LUI ONT ECHAPPE. La premiere passe ne cherchait que l'echelle
    // Tailwind ; les intitules de section et le numero de version portaient une
    // taille sur mesure, et sont sortis a 2:1 — le pire contraste du produit,
    // sur l'element le plus regarde de tous. C'est la mesure dans un vrai
    // navigateur qui les a trouves, pas la recherche de motif : elle ne voit
    // que ce qu'on lui demande de voir.
    const TAILLE = /\btext-(xs|sm|base|lg|xl|2xl|3xl)\b|text-\[\d+px\]/;
    const fautifs: string[] = [];

    for (const fichier of fichiersTsx('src')) {
      const source = readFileSync(fichier, 'utf-8');
      for (const classe of source.match(/className=(?:"[^"]*"|\{`[^`]*`\})/gs) ?? []) {
        // `(?<![:\w-])` : `hover:text-gray-500` et consorts sont des etats
        // passagers, pas du texte a lire en continu.
        const pale = /(?<![:\w-])text-gray-(400|500)\b/.test(classe);
        if (pale && TAILLE.test(classe)) {
          fautifs.push(`${fichier} — ${classe.slice(0, 90)}`);
        }
      }
    }

    expect(
      fautifs,
      'Texte secondaire sous le seuil AA en mode clair (gray-400 : 2,00:1, ' +
        'gray-500 : 3,18:1, seuil 4,5:1). La charte est ' +
        `« text-gray-600 dark:text-gray-400 ».\n${fautifs.join('\n')}`
    ).toEqual([]);
  });
});
