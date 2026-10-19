import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';
import { prisma } from '@/server/db/client';
import { resetDatabase } from '../helpers/db';

/**
 * La file d'envoi, vue par la supervision.
 *
 * L'exporteur PostgreSQL d'Alloy rejoue sur le serveur une requête écrite
 * dans `deploy/` ; une colonne renommée par une migration la casserait sans
 * que rien ne le dise avant l'alerte « Relevé PostgreSQL en erreur ». Elle
 * est donc rejouée ici, sur la base de test.
 */

beforeEach(resetDatabase);

const read = (...parts: string[]) => readFileSync(join(process.cwd(), ...parts), 'utf8');

/** Le bloc `query: |` de la requête de la file d'envoi, désindenté. */
function outboxQuery(): string {
  const file = read('deploy', 'supervision', 'dateplanner-queries.yaml');
  const block = file.match(/^ {2}query: \|\n((?: {4}.*\n|\n)+)/m)?.[1];
  if (!block) throw new Error('requête introuvable dans dateplanner-queries.yaml');
  return block.replace(/^ {4}/gm, '').trim();
}

describe('La file d’envoi, vue par la supervision', () => {
  it('ne compte comme en retard qu’une entrée due, dans le fuseau du serveur', async () => {
    const now = Date.now();
    await prisma.emailOutbox.createMany({
      data: [
        // Due depuis deux heures : c'est elle qui fait l'ancienneté.
        { to: 'a@example.test', template: 'PASSWORD_RESET', createdAt: new Date(now - 2 * 3_600_000), sendAfter: new Date(now - 2 * 3_600_000) },
        // Plus ancienne encore, mais retenue jusqu'à demain (un résumé).
        { to: 'b@example.test', template: 'OWNER_DIGEST', createdAt: new Date(now - 5 * 3_600_000), sendAfter: new Date(now + 86_400_000) },
        { to: 'c@example.test', template: 'PASSWORD_RESET', status: 'FAILED' },
        { to: 'd@example.test', template: 'PASSWORD_RESET', status: 'SENT', sentAt: new Date() },
      ],
    });

    // Dans le fuseau du serveur : une comparaison à `now()` sans le ramener
    // en UTC y décale l'ancienneté de deux heures.
    const [, rows] = await prisma.$transaction([
      prisma.$executeRawUnsafe(`SET LOCAL TIME ZONE 'Europe/Paris'`),
      prisma.$queryRawUnsafe<Array<{ pending: bigint; failed: bigint; oldest_due_seconds: unknown }>>(
        outboxQuery(),
      ),
    ]);
    const row = rows[0];
    expect(Number(row!.pending)).toBe(2);
    expect(Number(row!.failed)).toBe(1);
    expect(Number(row!.oldest_due_seconds)).toBeGreaterThan(2 * 3600 - 60);
    expect(Number(row!.oldest_due_seconds)).toBeLessThan(2 * 3600 + 60);
  });

  it('rend zéro, et non rien, sur une file vide', async () => {
    const [row] = await prisma.$queryRawUnsafe<Array<{ pending: bigint; oldest_due_seconds: unknown }>>(
      outboxQuery(),
    );
    expect(Number(row!.pending)).toBe(0);
    expect(Number(row!.oldest_due_seconds)).toBe(0);
  });

  it('ne lit que trois colonnes, celles que le guide accorde au rôle `alloy`', () => {
    const identifiers = new Set([...outboxQuery().matchAll(/"([^"]+)"/g)].map((match) => match[1]));
    expect([...identifiers].sort()).toEqual(['created_at', 'email_outbox', 'send_after', 'status']);
    expect(read('deploy', 'supervision', 'README.md')).toContain(
      `GRANT SELECT ("status", "send_after", "created_at") ON "email_outbox" TO alloy`,
    );
  });
});
