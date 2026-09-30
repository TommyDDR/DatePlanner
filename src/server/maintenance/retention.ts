import { RETENTION } from '@/config/retention';
import { addMonths, dateFromDay, todayInParis } from '@/lib/paris-day';
import { prisma } from '@/server/db/client';
import { inactivityThreshold } from '@/server/notifications/inactivity';
import { cancelPendingForPoll } from '@/server/notifications/outbox';

/**
 * Durées de conservation appliquées (research.md R15, constitution IV).
 *
 * Chaque durée vient de `RETENTION`, celle-là même que la politique de
 * confidentialité annonce. Chaque étape ne traite qu'un lot par passage : la
 * maintenance repasse dix minutes plus tard.
 */

const BATCH = 200;
const DAY_MS = 86_400_000;

/**
 * Supprime les sondages dont le dernier jour proposé a plus de
 * `pollMonthsAfterLastDay` mois, avec leurs jours, réponses et votes.
 *
 * Le sondage est verrouillé puis RELU avant d'être supprimé : un créateur qui
 * lui ajoute un jour à venir au même instant le sauve.
 */
export async function deleteExpiredPolls(now: Date): Promise<number> {
  const cutoff = dateFromDay(addMonths(todayInParis(now), -RETENTION.pollMonthsAfterLastDay));
  const expired = await prisma.poll.findMany({
    where: { days: { some: {}, every: { day: { lt: cutoff } } } },
    select: { id: true },
    take: BATCH,
  });

  let deleted = 0;
  for (const { id } of expired) {
    deleted += await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM poll WHERE id = ${id}::uuid FOR UPDATE`;
      const recent = await tx.pollDay.count({ where: { pollId: id, day: { gte: cutoff } } });
      if (recent > 0) return 0;
      await cancelPendingForPoll(id, tx);
      const { count } = await tx.poll.deleteMany({ where: { id } });
      return count;
    });
  }
  return deleted;
}

/**
 * Met en file l'avertissement des comptes sans activité depuis
 * `inactiveAccountYears` ans.
 *
 * Un compte n'en reçoit qu'un à la fois : rien n'est remis en file tant qu'un
 * avertissement attend son départ, ni dans les vingt-quatre heures d'un
 * précédent - un envoi en échec est ainsi retenté chaque jour, sans pluie
 * d'emails.
 */
export async function warnInactiveAccounts(now: Date): Promise<number> {
  const candidates = await prisma.user.findMany({
    where: { lastActiveAt: { lt: inactivityThreshold(now) }, inactivityWarnedAt: null },
    select: { id: true, email: true },
    take: BATCH,
  });

  let warned = 0;
  for (const user of candidates) {
    const earlier = await prisma.emailOutbox.findFirst({
      where: {
        template: 'INACTIVITY_WARNING',
        payload: { path: ['userId'], equals: user.id },
        OR: [{ status: 'PENDING' }, { createdAt: { gt: new Date(now.getTime() - DAY_MS) } }],
      },
      select: { id: true },
    });
    if (earlier) continue;
    // En file seulement : `flushOutbox`, qui suit dans le passage, l'envoie.
    await prisma.emailOutbox.create({
      data: { to: user.email, template: 'INACTIVITY_WARNING', payload: { userId: user.id }, sendAfter: now },
    });
    warned += 1;
  }
  return warned;
}

/**
 * Supprime les comptes avertis depuis `deletionDaysAfterWarning` jours sans
 * être revenus - une visite remet `inactivityWarnedAt` à zéro. La condition
 * est dans le `DELETE` : une connexion concurrente l'emporte.
 */
export async function deleteWarnedAccounts(now: Date): Promise<number> {
  const deadline = new Date(now.getTime() - RETENTION.deletionDaysAfterWarning * DAY_MS);
  const due = await prisma.user.findMany({
    where: { inactivityWarnedAt: { lt: deadline } },
    select: { id: true },
    take: BATCH,
  });

  let deleted = 0;
  for (const { id } of due) {
    const { count } = await prisma.user.deleteMany({ where: { id, inactivityWarnedAt: { lt: deadline } } });
    deleted += count;
  }
  return deleted;
}
