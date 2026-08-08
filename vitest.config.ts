import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

// Config dediee aux tests, volontairement separee de vite.config.ts.
// Deux raisons :
//  - les tests n'ont aucun besoin du plugin PWA ni du decoupage manuel des chunks ;
//  - vite.config.ts charge vite-plugin-pwa, que le resolveur d'esbuild n'arrive pas a
//    resoudre sur le lecteur X: (voir MIGRATION.md §8). S'en passer ici rend les tests
//    executables en local sur X:, alors que `vite build` doit tourner depuis C: ou en CI.
export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    // `tests/` accueille ce qui a besoin d'infrastructure — aujourd'hui la
    // verification du schema contre un vrai PostgreSQL. Ces suites s'ignorent
    // d'elles-memes quand la base n'est pas fournie, pour que `npm test` reste
    // executable sans rien installer.
    // `server/src` est inclus depuis que la regle d'acces du proxy PostgREST y
    // vit dans un module sans dependance (rest-droits.ts). Ce code n'etait
    // couvert par rien, alors qu'il porte seul les droits d'ecriture : la base
    // n'a plus aucune policy RLS derriere lui.
    include: [
      'src/**/*.{test,spec}.{ts,tsx}',
      'server/src/**/*.{test,spec}.ts',
      'tests/**/*.{test,spec}.ts',
    ],
    css: false,
  },
});
