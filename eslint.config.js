import js from '@eslint/js';
import globals from 'globals';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  // `server` a son propre tsconfig, son propre package.json et son propre job
  // de CI, qui exige zero erreur. Le laisser dans le perimetre d'ici rendrait
  // le compteur du cliquet dependant de la presence de `server/dist` : trois
  // erreurs de plus si le serveur a ete construit, trois de moins sinon. Un
  // plafond ne peut pas s'appuyer sur un chiffre qui bouge selon ce qui traine
  // sur le disque.
  { ignores: ['dist', 'server'] },
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      'react-refresh/only-export-components': [
        'warn',
        { allowConstantExport: true },
      ],
    },
  }
);
