import { defineConfig } from '@playwright/test';
import base from './playwright.config';

/**
 * Mesure de SC-005 (décision 040).
 *
 * Le critère porte sur le service RÉEL : il se mesure sur un build de
 * production, servi par `next start`. Le serveur de développement des autres
 * parcours rend la même page quatre fois plus lentement, et bien davantage sur
 * un runner d'intégration continue : la mesure y dépendait de la machine, pas
 * du code.
 *
 * Le build est refait à chaque lancement, dans son propre dossier : la mesure
 * porte toujours sur le code courant, jamais sur un build oublié, et ne touche
 * ni `.next` ni le dossier des autres parcours. `.env.test` est chargé par la
 * configuration de base : même base de test, mêmes fabriques.
 *
 * Un build de production refuse une adresse publique en clair et un éditeur
 * absent : il reçoit l'adresse réelle et un éditeur FACTICE, comme le build de
 * l'intégration continue. `localhost` échappe à la redirection vers HTTPS.
 */

const PORT = 3101;
const BASE_URL = `http://localhost:${PORT}`;

export default defineConfig({
  ...base,
  testIgnore: undefined,
  testMatch: 'performance.spec.ts',
  use: { ...base.use, baseURL: BASE_URL },
  webServer: {
    command: `npx next build && npx next start --port ${PORT}`,
    url: `${BASE_URL}/api/sante`,
    reuseExistingServer: false,
    // Le build passe avant le démarrage.
    timeout: 300_000,
    env: {
      NODE_ENV: 'production',
      NEXT_DIST_DIR: '.next/performance',
      NEXT_PUBLIC_SITE_URL: 'https://dateplanner.laserit.fr',
      EDITOR_NAME: 'Éditeur de test',
      EDITOR_ADDRESS: "1 rue de l'Exemple 00000 Exempleville",
      EMAIL_DRIVER: 'console',
    },
  },
});
