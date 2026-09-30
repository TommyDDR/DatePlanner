import { RETENTION } from '@/config/retention';
import { purgeExpiredSessions, purgeExpiredTokens } from '@/server/auth/session';
import { prisma } from '@/server/db/client';
import { flushOutbox, purgeOldEmails } from '@/server/notifications/outbox';
import { purgeExpiredHits } from '@/server/ratelimit';
import { deleteExpiredPolls, deleteWarnedAccounts, warnInactiveAccounts } from './retention';

/**
 * Passage de maintenance (research.md R15), appelé toutes les dix minutes par
 * `dateplanner-maintenance.timer`.
 *
 * Idempotent : deux passages rapprochés ne doublent rien - chaque étape ne
 * touche que ce qui est dû ou expiré à l'instant du passage.
 */
export type MaintenanceReport = {
  sent: number;
  failed: number;
  retention: { polls: number; warned: number; accounts: number };
  purged: { sessions: number; tokens: number; rateLimitHits: number; emails: number };
};

export async function runMaintenance(now = new Date()): Promise<MaintenanceReport> {
  // La conservation passe AVANT l'envoi : les avertissements qu'elle met en
  // file partent dans ce même passage, et un sondage supprimé a déjà vu ses
  // emails en attente annulés.
  const retention = {
    polls: await deleteExpiredPolls(now),
    accounts: await deleteWarnedAccounts(now),
    warned: await warnInactiveAccounts(now),
  };
  const { sent, failed } = await flushOutbox();
  const purged = {
    sessions: await purgeExpiredSessions(now),
    tokens: await purgeExpiredTokens(now),
    rateLimitHits: await purgeExpiredHits(now),
    emails: await purgeOldEmails(new Date(now.getTime() - RETENTION.sentEmailDays * 86_400_000)),
  };

  // Horodaté en dernier : la santé ne dit « à l'heure » qu'une maintenance
  // qui est allée au bout.
  await prisma.maintenanceRun.upsert({
    where: { id: 1 },
    create: { id: 1, lastRunAt: now },
    update: { lastRunAt: now },
  });

  return { sent, failed, retention, purged };
}
