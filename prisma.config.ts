import 'dotenv/config';
import { defineConfig } from 'prisma/config';

/**
 * Configuration de la CLI Prisma.
 *
 * Depuis Prisma 7, l'URL de connexion n'est plus déclarée dans le schéma : la
 * CLI la lit ici, et le client applicatif l'injecte par un adaptateur (voir
 * src/server/db/client.ts). La chaîne de connexion ne vit donc qu'à un seul
 * endroit, la variable d'environnement, jamais dans un fichier versionné.
 */
export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
  },
  datasource: {
    url: process.env.DATABASE_URL ?? '',
  },
});
