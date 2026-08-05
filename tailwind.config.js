/**
 * Charte Tarn Compta, appliquée par remappage de la palette.
 * ---------------------------------------------------------------------------
 * Le CRM contient 9 463 utilitaires de couleur en dur — `gray-*` 5 480,
 * `teal-*` 1 551, `red-*` 586, `amber-*` 473, `green-*` 244, `blue-*` 208…
 * Les réécrire un par un serait absurde, et surtout intenable : la moindre
 * retouche de charte demanderait de tout reprendre.
 *
 * Les échelles ci-dessous sont donc redéfinies pour rendre la charte du
 * cabinet. Les classes déjà écrites dans les composants ne changent pas d'un
 * caractère ; c'est ce qu'elles désignent qui change.
 *
 *   teal, cyan, pink   ->  bordeaux, l'accent du cabinet
 *   gray, slate, zinc  ->  neutres chauds
 *   green, emerald     ->  --ok
 *   red, rose          ->  --red
 *   amber, yellow      ->  --gold
 *   blue, sky          ->  --navy
 *
 * Chaque échelle est ANCRÉE sur les valeurs réelles de `src/styles/tokens.css`,
 * jamais inventée : les nuances repères y sont annotées. Les intermédiaires
 * sont interpolés pour que la rampe reste régulière.
 *
 * Pourquoi des valeurs figées plutôt que des `var(--…)` : les composants
 * écrivent partout « bg-gray-100 dark:bg-gray-800 ». Si une nuance basculait
 * d'elle-même avec le thème, elle basculerait DEUX fois et le thème sombre
 * rendrait des fonds clairs. Ce sont les variantes `dark:` déjà en place qui
 * font la bascule — la palette, elle, doit rester stable.
 */

/** Neutres chauds — remplacent les gris neutres de Tailwind. */
const neutresChauds = {
  50: '#faf7f5', // --card-soft
  100: '#f7f3f0', // --canvas
  200: '#ece5e0', // --line
  300: '#ddd3cd', // --border-strong
  400: '#c0b4ba',
  500: '#9a8d92', // --faint
  600: '#7a6f74', // --neutral
  700: '#5c5258', // --muted
  800: '#2e2430', // --line (sombre)
  900: '#1e1620', // --paper (sombre)
  950: '#161015', // --canvas (sombre)
};

/**
 * Bordeaux — l'accent. Garde le nom « teal » par cohérence avec la charte, où
 * la variable s'appelle `--teal` et contient déjà du bordeaux : un vestige,
 * mais un vestige partagé par tous les outils du cabinet.
 */
const bordeaux = {
  50: '#fbf1f6',
  100: '#f7e3ee',
  200: '#efc7dc',
  300: '#e3a3c4',
  400: '#d06ba2', // --teal (sombre) : l'accent en thème sombre
  500: '#b04a80',
  600: '#7c2d5e', // --teal : l'accent
  700: '#63244b', // --teal-dark
  800: '#4e1d3c',
  900: '#3a1630',
  950: '#22111b', // --on-accent (sombre)
};

/** Vert de validation. */
const vert = {
  50: '#edf5f0',
  100: '#e7f1ea', // --ok-bg
  200: '#c8e2d3',
  300: '#9fcdb4',
  400: '#6fd29a', // --ok (sombre)
  500: '#4f9a6c',
  600: '#3f7d54', // --ok
  700: '#336344',
  800: '#284e36',
  900: '#1d3a28',
  950: '#16291f', // --ok-bg (sombre)
};

/** Rouge d'alerte. */
const rouge = {
  50: '#fbeeeb',
  100: '#f8e6e2', // --red-soft
  200: '#f2cbc3',
  300: '#e8a99c',
  400: '#f08a78', // --red (sombre)
  500: '#cc5843',
  600: '#b3402f', // --red
  700: '#8f3325', // --red (impression)
  800: '#71281d',
  900: '#551e16',
  950: '#351a16', // --red-soft (sombre)
};

/** Doré d'avertissement. */
const dore = {
  50: '#fcf6e9',
  100: '#faf0dd', // --gold-soft
  200: '#f2ddb4',
  300: '#e6c684',
  400: '#e3b15e', // --gold (sombre)
  500: '#c9922f',
  600: '#b5781f', // --gold
  700: '#7d5313', // --gold (impression)
  800: '#634211',
  900: '#4a320e',
  950: '#2e240f', // --gold-soft (sombre)
};

/** Bleu ardoise, pour l'information. */
const navy = {
  50: '#eef4f8',
  100: '#dde9f1',
  200: '#bcd3e3',
  300: '#9dbdd4',
  400: '#86aed3', // --navy (sombre)
  500: '#5b8cad',
  600: '#3f7293', // --navy
  700: '#325b76',
  800: '#27475c',
  900: '#1d3444',
  950: '#142530',
};

/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],

  // `data-theme` et non la classe `.dark` : c'est la langue que parlent les
  // autres outils du cabinet, et celle qu'attend le verrou d'impression de
  // tokens.css. Les milliers de variantes `dark:` des composants continuent de
  // fonctionner telles quelles.
  darkMode: ['selector', '[data-theme="dark"]'],

  theme: {
    extend: {
      fontFamily: {
        sans: ['Hanken Grotesk', 'system-ui', '-apple-system', 'Segoe UI', 'sans-serif'],
        mono: ['Consolas', 'ui-monospace', 'monospace'],
      },

      colors: {
        gray: neutresChauds,
        slate: neutresChauds,
        zinc: neutresChauds,
        neutral: neutresChauds,
        stone: neutresChauds,

        teal: bordeaux,
        cyan: bordeaux,
        pink: bordeaux,

        green: vert,
        emerald: vert,
        lime: vert,

        red: rouge,
        rose: rouge,

        amber: dore,
        yellow: dore,
        orange: dore,

        blue: navy,
        sky: navy,
        indigo: navy,

        ink: {
          950: '#161015',
          900: '#1e1620',
          850: '#241b27',
          800: '#2e2430',
          750: '#3d3040',
          700: '#4a3d4d',
        },
      },

      // Les rayons de la charte. `lg` vaut déjà 8 px chez Tailwind, soit
      // --radius-xs : rien à y changer.
      borderRadius: {
        xl: '11px', // --radius-sm
        '2xl': '16px', // --radius
      },

      // Ombres teintées à l'encre du cabinet (44, 35, 41) plutôt qu'au noir pur :
      // sur un canevas chaud, une ombre neutre paraît grise et sale.
      boxShadow: {
        sm: '0 1px 2px rgba(44, 35, 41, 0.04)',
        card: '0 1px 2px rgba(44, 35, 41, 0.04), 0 8px 24px rgba(44, 35, 41, 0.06)',
        'card-hover': '0 4px 12px rgba(44, 35, 41, 0.08), 0 12px 28px rgba(44, 35, 41, 0.06)',
        elevated: '0 8px 24px rgba(44, 35, 41, 0.08), 0 2px 8px rgba(44, 35, 41, 0.05)',
        accent: '0 4px 14px rgba(124, 45, 94, 0.3)', // --shadow-accent
        'glow-cyan': '0 0 0 1px rgba(208, 107, 162, 0.25), 0 10px 30px -10px rgba(208, 107, 162, 0.35)',
        'glow-cyan-sm': '0 0 0 1px rgba(208, 107, 162, 0.2), 0 4px 16px -4px rgba(208, 107, 162, 0.25)',
        'dark-card': '0 1px 0 rgba(255, 255, 255, 0.04) inset, 0 20px 40px -24px rgba(0, 0, 0, 0.6)',
        'dark-soft': '0 1px 0 rgba(255, 255, 255, 0.03) inset, 0 8px 24px -12px rgba(0, 0, 0, 0.5)',
      },

      backgroundImage: {
        'dark-radial':
          'radial-gradient(at 20% 10%, rgba(208, 107, 162, 0.10) 0, transparent 50%), radial-gradient(at 85% 90%, rgba(63, 114, 147, 0.08) 0, transparent 55%), radial-gradient(at 50% 50%, rgba(22, 16, 21, 0) 0, #161015 100%)',
      },

      keyframes: {
        'fade-in': {
          '0%': { opacity: '0', transform: 'translateY(4px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        'icon-spin': {
          '0%': { transform: 'rotate(0deg) scale(1)' },
          '50%': { transform: 'rotate(180deg) scale(0.8)' },
          '100%': { transform: 'rotate(360deg) scale(1)' },
        },
        'slide-in-up': {
          '0%': { opacity: '0', transform: 'translateY(8px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
      },
      animation: {
        'fade-in': 'fade-in 300ms ease-out',
        'icon-spin': 'icon-spin 400ms ease-in-out',
        'slide-in-up': 'slide-in-up 400ms cubic-bezier(0.16, 1, 0.3, 1)',
      },
    },
  },
  plugins: [],
};
