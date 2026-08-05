/// <reference types="vite/client" />

/**
 * Version de l'application, figée dans le bundle à la construction depuis
 * `version.json` (voir `define` dans vite.config.ts). C'est la version du code
 * que le navigateur exécute réellement — ce qu'aucune requête au serveur ne
 * pourrait dire, celui-ci ne connaissant que la sienne.
 */
declare const __VERSION_APP__: string;
