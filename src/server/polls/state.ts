import { fail, ok, type ActionResult } from '@/lib/action-result';
import { dayFromDate, type Day } from '@/lib/paris-day';
import { applyTransition, type Transition } from '@/lib/poll-state';
import { prisma } from '@/server/db/client';
import { deliverSoon } from '@/server/notifications/outbox';
import { enqueueRetainedDayAnnouncements } from '@/server/notifications/retained-day';
import { lockOwnedPoll } from './owner-lock';

/**
 * Clore, désigner la date retenue, rouvrir (FR-026, FR-042).
 *
 * La transition est décidée par `lib/poll-state` sur l'état relu SOUS VERROU :
 * deux clôtures simultanées n'en appliquent qu'une, et l'annonce de la date
 * retenue n'est mise en file qu'une fois, dans la même transaction.
 */
export async function transitionPoll(
  ownerId: string,
  publicId: string,
  transition: Transition,
): Promise<ActionResult<{ pollId: string }>> {
  const result = await prisma.$transaction(async (tx) => {
    const poll = await lockOwnedPoll(tx, ownerId, publicId);
    if (!poll) return { outcome: fail({ code: 'NOT_FOUND' }), emails: [] };

    const days = await tx.pollDay.findMany({ where: { pollId: poll.id }, select: { id: true, day: true } });
    const idByDay = new Map(days.map((d) => [dayFromDate(d.day), d.id]));
    const current = days.find((d) => d.id === poll.retainedDayId);

    const decided = applyTransition(
      { status: poll.status, retainedDay: current ? dayFromDate(current.day) : null },
      transition,
      new Set(idByDay.keys()),
    );
    if (!decided.ok) {
      const outcome =
        decided.error === 'NOT_A_POLL_DAY'
          ? fail({ code: 'VALIDATION', fields: { retainedDay: 'Choisissez un des jours proposés.' } })
          : fail({ code: 'NOT_FOUND' });
      return { outcome, emails: [] };
    }

    const { next } = decided;
    await tx.poll.update({
      where: { id: poll.id },
      data: {
        status: next.status,
        retainedDayId: next.retainedDay ? idByDay.get(next.retainedDay)! : null,
        closedAt: next.status === 'CLOSED' ? (poll.status === 'CLOSED' ? undefined : new Date()) : null,
      },
    });
    const emails = decided.announce ? await enqueueRetainedDayAnnouncements(tx, poll, decided.announce) : [];
    return { outcome: ok({ pollId: poll.id }), emails };
  });

  // Après la validation : les annonces n'existent que si la transition a eu lieu.
  for (const email of result.emails) deliverSoon(email.id, email.sendAfter);
  return result.outcome;
}

export const closePoll = (ownerId: string, publicId: string, retainedDay: Day | null) =>
  transitionPoll(ownerId, publicId, { kind: 'close', retainedDay });

export const setRetainedDay = (ownerId: string, publicId: string, retainedDay: Day | null) =>
  transitionPoll(ownerId, publicId, { kind: 'setRetainedDay', retainedDay });

export const reopenPoll = (ownerId: string, publicId: string) => transitionPoll(ownerId, publicId, { kind: 'reopen' });
