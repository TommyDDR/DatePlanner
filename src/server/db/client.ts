import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

/**
 * Instance unique du client Prisma.
 *
 * En développement, Next recharge les modules à chaque modification : sans ce
 * cache sur `globalThis`, chaque rechargement ouvrirait un nouveau pool de
 * connexions et finirait par saturer PostgreSQL.
 */

/**
 * Ce qui ne se lit JAMAIS par défaut.
 *
 * Une lecture de compte sans `select` - la session, un `include: { user: true }`
 * - remonterait sinon tous les champs, et l'empreinte du mot de passe finirait
 * un jour dans une page ou un journal. Omise ici, elle ne sort que d'une
 * lecture qui la NOMME (`select: { passwordHash: true }`), et le type des
 * résultats le dit : sans ce `select`, le champ n'existe pas.
 */
const OMITTED = { user: { passwordHash: true } } as const;

function createClient() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error(
      "DATABASE_URL n'est pas définie. Copiez .env.example vers .env et renseignez la connexion PostgreSQL.",
    );
  }

  const adapter = new PrismaPg({ connectionString });

  return new PrismaClient({
    adapter,
    log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
    omit: OMITTED,
  });
}

type Client = ReturnType<typeof createClient>;

const globalForPrisma = globalThis as unknown as { prisma?: Client };

export const prisma: Client = globalForPrisma.prisma ?? createClient();

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}

/** Le client d'une transaction interactive, tel que `$transaction` le passe. */
export type Tx = Parameters<Parameters<Client['$transaction']>[0]>[0];
