import { defineConfig, devices } from '@playwright/test';
import { config as loadEnv } from 'dotenv';

/**
 * Tests de bout en bout.
 *
 * Le serveur est celui de DÉVELOPPEMENT (`next dev`), sur son propre port pour
 * ne pas bousculer un `npm run dev` en cours, et sur la base de TEST : les
 * parcours créent des comptes et des sondages, et vident les tables entre deux
 * fichiers. Un serveur de production refuserait une adresse publique en
 * `http://` et garderait l'anti-flood actif (`RATE_LIMIT_DISABLED` y est sans
 * effet, exprès) : c'est la même raison que sur laserit.fr.
 *
 * `.env.test` est chargé ICI, dans le processus principal, pour que les
 * fabriques des tests et le serveur lancé dessous partagent la même base.
 *
 * L'anti-flood est neutralisé POUR LE SERVEUR SEULEMENT : les tests Vitest
 * vérifient que les compteurs limitent pour de bon, et cette variable ne doit
 * pas les atteindre.
 *
 * Les fichiers sont joués en série : une seule base, remise à zéro entre deux
 * fichiers.
 */

loadEnv({ path: '.env.test', override: true, quiet: true });

const PORT = 3100;
const BASE_URL = `http://localhost:${PORT}`;

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : 'list',
  timeout: 90_000,
  expect: { timeout: 15_000 },
  use: {
    baseURL: BASE_URL,
    locale: 'fr-FR',
    timezoneId: 'Europe/Paris',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: `npx next dev --port ${PORT}`,
    url: BASE_URL,
    reuseExistingServer: !process.env.CI,
    // Le premier rendu compile chaque page à la demande.
    timeout: 180_000,
    env: {
      // Dossier de sortie à part : `next dev` refuse de démarrer si un autre
      // tient déjà le verrou de `.next/dev`.
      NEXT_DIST_DIR: '.next/e2e',
      RATE_LIMIT_DISABLED: '1',
      NEXT_PUBLIC_SITE_URL: BASE_URL,
      EMAIL_DRIVER: 'console',
      // Connexion Google : de quoi rendre le bouton et composer l'adresse de
      // consentement. Les parcours s'arrêtent AVANT de partir chez Google.
      GOOGLE_CLIENT_ID: 'e2e.apps.googleusercontent.com',
      GOOGLE_CLIENT_SECRET: 'e2e-secret',
    },
  },
});
