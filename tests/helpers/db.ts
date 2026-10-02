import { prisma } from '@/server/db/client';

/**
 * Vide toutes les tables de la base de TEST.
 *
 * `TRUNCATE … CASCADE` en un seul ordre : l'ordre des tables n'a pas à suivre
 * les clés étrangères, et les séquences repartent de zéro.
 */
const TABLES = [
  'retained_day',
  'vote',
  'response',
  'poll_day',
  'poll',
  'password_reset_token',
  'session',
  'user',
  'email_outbox',
  'rate_limit_hit',
  'maintenance_run',
];

export async function resetDatabase(): Promise<void> {
  const url = process.env.DATABASE_URL ?? '';
  // Garde-fou : jamais sur une base qui ne se déclare pas de test.
  if (!/_test(\?|$)/.test(url)) {
    throw new Error('resetDatabase refuse une base dont le nom ne finit pas par _test.');
  }
  const list = TABLES.map((table) => `"${table}"`).join(', ');
  await prisma.$executeRawUnsafe(`TRUNCATE ${list} RESTART IDENTITY CASCADE`);
}
