import { fail, ok, type ActionResult } from '@/lib/action-result';
import { dayFromDate, type Day } from '@/lib/paris-day';
import { applyTransition, type Transition } from '@/lib/poll-state';
import { prisma } from '@/server/db/client';
import { deliverSoon } from '@/server/notifications/outbox';
import { enqueueRetainedDayAnnouncements } from '@/server/notifications/retained-day';
import { lockOwnedPoll } from './owner-lock';

/**
 * Clore, désigner les dates retenues, rouvrir (FR-026, FR-042).
 *
 * La transition est décidée par `lib/poll-state` sur l'état relu SOUS VERROU :
 * deux clôtures simultanées n'en appliquent qu'une, et l'annonce des dates
 * retenues n'est mise en file qu'une fois, dans la même transaction.
 */
export async function transitionPoll(
  ownerId: string,
  publicId: string,
  transition: Transition,
): Promise<ActionResult<{ pollId: string }>> {
  const result = await prisma.$transaction(async (tx) => {
    const poll = await lockOwnedPoll(tx, ownerId, publicId);
    if (!poll) return { outcome: fail({ code: 'NOT_FOUND' }), emails: [] };

    const days = await tx.pollDay.findMany({
      where: { pollId: poll.id },
      select: { id: true, day: true, retained: { select: { pollDayId: true } } },
    });
    const idByDay = new Map(days.map((d) => [dayFromDate(d.day), d.id]));

    const decided = applyTransition(
      { status: poll.status, retainedDays: days.filter((d) => d.retained).map((d) => dayFromDate(d.day)) },
      transition,
      { days: new Set(idByDay.keys()), multiple: poll.multipleRetainedDays },
    );
    if (!decided.ok) {
      const outcome =
        decided.error === 'NOT_A_POLL_DAY'
          ? fail({ code: 'VALIDATION', fields: { retainedDays: 'Choisissez parmi les jours proposés.' } })
          : decided.error === 'SINGLE_RETAINED_DAY'
            ? fail({ code: 'VALIDATION', fields: { retainedDays: 'Ce sondage ne retient qu’une date.' } })
            : fail({ code: 'NOT_FOUND' });
      return { outcome, emails: [] };
    }

    const { next } = decided;
    // Les jours retenus partent AVANT la réouverture : leur clé tient à l'état
    // clos du sondage. Ils reviennent après la clôture, pour la même raison.
    await tx.retainedDay.deleteMany({ where: { pollId: poll.id } });
    await tx.poll.update({
      where: { id: poll.id },
      data: {
        status: next.status,
        closedAt: next.status === 'CLOSED' ? (poll.status === 'CLOSED' ? undefined : new Date()) : null,
      },
    });
    if (next.retainedDays.length > 0) {
      await tx.retainedDay.createMany({
        data: next.retainedDays.map((day) => ({ pollId: poll.id, pollDayId: idByDay.get(day)! })),
      });
    }
    const emails = decided.announce ? await enqueueRetainedDayAnnouncements(tx, poll, decided.announce) : [];
    return { outcome: ok({ pollId: poll.id }), emails };
  });

  // Après la validation : les annonces n'existent que si la transition a eu lieu.
  for (const email of result.emails) deliverSoon(email.id, email.sendAfter);
  return result.outcome;
}

export const closePoll = (ownerId: string, publicId: string, retainedDays: readonly Day[]) =>
  transitionPoll(ownerId, publicId, { kind: 'close', retainedDays });

export const setRetainedDays = (ownerId: string, publicId: string, retainedDays: readonly Day[]) =>
  transitionPoll(ownerId, publicId, { kind: 'setRetainedDays', retainedDays });

export const reopenPoll = (ownerId: string, publicId: string) => transitionPoll(ownerId, publicId, { kind: 'reopen' });
