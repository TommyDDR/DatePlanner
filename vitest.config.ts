import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

const alias = { '@': fileURLToPath(new URL('./src', import.meta.url)) };

/**
 * Deux projets :
 *  - `unit` : les modules purs et les contrôles du dépôt, sans base ;
 *  - `integration` : le vrai code serveur contre un vrai PostgreSQL 17.
 *
 * Les fichiers sont joués en série : les tests d'intégration vident les tables
 * et partagent les compteurs anti-flood, deux fichiers en parallèle se
 * marcheraient dessus.
 */
export default defineConfig({
  resolve: { alias },
  test: {
    fileParallelism: false,
    projects: [
      {
        resolve: { alias },
        test: {
          name: 'unit',
          environment: 'node',
          include: ['tests/unit/**/*.test.ts'],
          setupFiles: ['tests/setup.ts'],
        },
      },
      {
        resolve: { alias },
        test: {
          name: 'integration',
          environment: 'node',
          include: ['tests/integration/**/*.test.ts'],
          setupFiles: ['tests/setup.ts'],
          testTimeout: 30_000,
          hookTimeout: 30_000,
        },
      },
    ],
  },
});
