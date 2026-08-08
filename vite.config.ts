import { readFileSync } from 'node:fs';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

/**
 * La version, lue à la construction depuis `version.json`.
 *
 * Figée dans le bundle plutôt que demandée au serveur : c'est la version du
 * CODE QUE LE NAVIGATEUR EXÉCUTE, ce qu'aucune requête ne pourrait dire. Un
 * appel à l'instance rendrait `APP_VERSION`, c'est-à-dire ce que le conteneur
 * croit être — pas ce que le navigateur a chargé, qui peut venir d'un cache.
 *
 * `version.json` est l'autorité, et `tests/version.test.ts` interdit à ses
 * copies de diverger.
 */
const VERSION = JSON.parse(readFileSync('./version.json', 'utf8')).version as string;

/**
 * En développement, le front tourne sur le serveur de Vite et le back sur le
 * serveur Node de l'instance. On mandate donc les chemins de l'API vers ce
 * dernier, ce qui reproduit la situation de production : même origine côté
 * navigateur, donc le cookie de session accompagne les requêtes sans CORS.
 *
 * En production il n'y a plus de mandataire ici : Caddy sert le bundle statique
 * et relaie /api et /rest/v1 vers le même serveur Node.
 */
const API_LOCALE = process.env.API_LOCALE ?? 'http://localhost:3000';

export default defineConfig({
  define: {
    __VERSION_APP__: JSON.stringify(VERSION),
  },
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: null,
      includeAssets: ['favicon.svg', 'apple-touch-icon.svg'],
      workbox: {
        navigateFallback: '/index.html',
        /**
         * Ces préfixes sont servis par le serveur Node : le service worker ne
         * doit jamais les intercepter ni leur substituer index.html.
         *
         * ⚠️ CETTE LISTE EST LA RAISON POUR LAQUELLE LES POINTS OAUTH VIVENT SOUS
         * `/oauth/`. Ils ont d'abord été écrits à la racine — `/authorize`,
         * `/token`, `/register` — et le serveur répondait correctement : mesuré au
         * curl. Mais dans un navigateur, `navigateFallback` rabat TOUTE navigation
         * non exclue sur index.html, sans même joindre le réseau. L'utilisateur
         * arrivait donc sur le 404 de l'application, alors que la route existait.
         *
         * Constaté le 2026-08-06 en branchant claude.ai. Deux enseignements :
         * un `curl` ne prouve rien sur ce qu'un navigateur reçoit tant qu'un
         * service worker est en place, et le préfixe `/oauth/` était déjà là —
         * vestige de l'implémentation d'avant la refonte, qui avait fait le même
         * choix pour la même raison.
         *
         * Avantage inattendu : les navigateurs porteurs de l'ANCIEN service worker
         * excluent déjà `/oauth/`. Le correctif prend effet sans attendre leur
         * mise à jour.
         */
        navigateFallbackDenylist: [
          /^\/api\//,
          /^\/rest\//,
          /^\/mcp$/,
          /^\/oauth\//,
          /^\/\.well-known\//,
          // La désinscription d'une campagne : page rendue par le serveur, ouverte
          // depuis un logiciel de messagerie, donc sans session. Si le service
          // worker la rabattait sur index.html, le client cliquant depuis son
          // courriel verrait « Page introuvable » — et conclurait que le cabinet
          // ne respecte pas sa demande.
          /^\/desinscription/,
        ],
      },
      manifest: {
        name: 'CRM Cabinet',
        short_name: 'CRM Cabinet',
        description: 'Gestion de cabinet comptable',
        theme_color: '#7c2d5e',
        background_color: '#f7f3f0',
        display: 'standalone',
        lang: 'fr',
        icons: [
          {
            src: 'pwa-192x192.svg',
            sizes: '192x192',
            type: 'image/svg+xml',
          },
          {
            src: 'pwa-512x512.svg',
            sizes: '512x512',
            type: 'image/svg+xml',
          },
          {
            src: 'pwa-512x512.svg',
            sizes: '512x512',
            type: 'image/svg+xml',
            purpose: 'any maskable',
          },
        ],
      },
    }),
  ],
  server: {
    proxy: {
      '/api': { target: API_LOCALE, changeOrigin: true },
      '/rest/v1': { target: API_LOCALE, changeOrigin: true },
      '/oauth': { target: API_LOCALE, changeOrigin: true },
      '/.well-known': { target: API_LOCALE, changeOrigin: true },
      '/mcp': { target: API_LOCALE, changeOrigin: true },
    },
  },
  build: {
    rollupOptions: {
      output: {
        /**
         * Ces regroupements decident de la STABILITE dans le cache, pas du
         * moment ou un morceau est charge — cela, c'est le graphe d'imports qui
         * le dit. Une bibliotheque tierce qui ne bouge jamais ne doit pas etre
         * reinvalidee a chaque modification du code applicatif.
         *
         * jsPDF n'y figure PAS, et c'est le resultat d'une mesure. L'y avoir mis
         * ajoutait un `<link rel="modulepreload">` vers ses 448 ko dans
         * index.html : la page d'accueil les telechargeait donc a chaque
         * premiere visite, exactement ce que l'import dynamique de l'export PDF
         * cherchait a eviter. La cause tient a une dependance partagee — jsPDF
         * s'appuie sur `dompurify`, que le front importe par ailleurs
         * statiquement — qui suffit a rattacher le morceau force au graphe
         * d'entree. Laisse a Rollup, jsPDF atterrit dans le morceau de
         * `clientPdfExportService`, charge au clic sur « Exporter » et pas avant.
         *
         * `vendor-xlsx` ne pose pas ce probleme : le tableur n'a aucune
         * dependance en commun avec le front, et n'est atteint que par des
         * `import()` dynamiques.
         *
         * Verifie le 2026-08-02 sur l'instance locale : le premier chargement
         * pese 113 ko gzip (entree 25, react 56, postgrest 5, styles 26).
         */
        manualChunks: {
          'vendor-react': ['react', 'react-dom', 'react-router-dom'],
          'vendor-postgrest': ['@supabase/postgrest-js'],
          'vendor-dnd': ['@dnd-kit/core', '@dnd-kit/sortable', '@dnd-kit/utilities'],
          'vendor-xlsx': ['xlsx'],
        },
      },
    },
  },
});
