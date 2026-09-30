import coreWebVitals from 'eslint-config-next/core-web-vitals';
import typescriptConfig from 'eslint-config-next/typescript';

/**
 * Configuration ESLint (format plat).
 *
 * `eslint-config-next` expose directement des configurations plates : elles
 * sont importées telles quelles, sans passer par FlatCompat.
 */
const config = [
  {
    ignores: [
      '.next/**',
      'node_modules/**',
      'next-env.d.ts',
      'prisma/migrations/**',
      'public/**',
      'playwright-report/**',
      'test-results/**',
    ],
  },
  ...coreWebVitals,
  ...typescriptConfig,
  {
    rules: {
      // Les paramètres préfixés d'un souligné sont volontairement inutilisés :
      // les Server Actions imposent une signature `(previousState, formData)`
      // dont le premier argument ne sert pas toujours.
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
    },
  },
];

export default config;
