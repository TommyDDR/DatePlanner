import { Prisma } from '@prisma/client';
import { fail, ok, type ActionResult } from '@/lib/action-result';
import { dateFromDay, dayFromDate, type Day } from '@/lib/paris-day';
import { validateProposedDays } from '@/lib/poll-rules';
import { RULE_MESSAGES } from '@/lib/validation';
import { prisma } from '@/server/db/client';
import { cancelPendingForPoll } from '@/server/notifications/outbox';
import { lockOwnedPoll } from './owner-lock';

/**
 * Ce que le créateur change à son sondage (FR-025, FR-027, FR-039, FR-040).
 *
 * Chaque écriture porte le propriétaire dans sa condition : pour qui n'est pas
 * le créateur, le sondage est introuvable. Chaque fonction rend l'identifiant
 * INTERNE du sondage, pour que l'appelant prévienne les pages ouvertes.
 */

type Owned = ActionResult<{ pollId: string }>;
const NOT_FOUND = { code: 'NOT_FOUND' } as const;

export async function updatePollDetails(
  ownerId: string,
  publicId: string,
  input: { title: string; description: string | null },
): Promise<Owned> {
  const poll = await prisma.poll.findFirst({ where: { publicId, ownerId }, select: { id: true } });
  if (!poll) return fail(NOT_FOUND);
  const { count } = await prisma.poll.updateMany({
    where: { id: poll.id, ownerId },
    data: { title: input.title, description: input.description },
  });
  return count === 0 ? fail(NOT_FOUND) : ok({ pollId: poll.id });
}

/** Ajoute des jours : doublons ignorés, aucun jour passé, au plus 366 en tout (FR-027). */
export async function addPollDays(ownerId: string, publicId: string, days: readonly string[], today: Day): Promise<Owned> {
  return prisma.$transaction(async (tx) => {
    const poll = await lockOwnedPoll(tx, ownerId, publicId);
    if (!poll) return fail(NOT_FOUND);
    const existing = await tx.pollDay.findMany({ where: { pollId: poll.id }, select: { day: true } });
    const fresh = validateProposedDays(days, today, new Set(existing.map((d) => dayFromDate(d.day))));
    if (!fresh.ok) return fail({ code: 'VALIDATION', fields: { days: RULE_MESSAGES[fresh.error] } });
    if (fresh.value.length > 0) {
      await tx.pollDay.createMany({ data: fresh.value.map((day) => ({ pollId: poll.id, day: dateFromDay(day) })) });
    }
    return ok({ pollId: poll.id });
  });
}

/**
 * Retire un jour SANS vote (FR-027). Le retrait est conditionnel dans l'ordre
 * même (`NOT EXISTS` un vote), et la clé étrangère différée des votes le
 * rattrape à la validation si un vote s'est glissé entre-temps : jamais un
 * vote n'est effacé par un retrait de jour.
 */
export async function removePollDay(ownerId: string, publicId: string, day: Day): Promise<Owned> {
  try {
    return await prisma.$transaction(async (tx) => {
      const poll = await lockOwnedPoll(tx, ownerId, publicId);
      if (!poll) return fail(NOT_FOUND);
      const target = await tx.pollDay.findFirst({ where: { pollId: poll.id, day: dateFromDay(day) }, select: { id: true } });
      if (!target) return fail(NOT_FOUND);
      if (target.id === poll.retainedDayId) {
        return fail({ code: 'VALIDATION', fields: { _form: 'La date retenue ne peut pas être retirée.' } });
      }
      if ((await tx.pollDay.count({ where: { pollId: poll.id } })) <= 1) return fail({ code: 'LAST_DAY' });

      const removed = await tx.$executeRaw`
        DELETE FROM "poll_day" WHERE "id" = ${target.id}::uuid
        AND NOT EXISTS (SELECT 1 FROM "vote" WHERE "poll_day_id" = ${target.id}::uuid)`;
      if (removed === 0) return fail({ code: 'DAY_HAS_VOTES', day });
      return ok({ pollId: poll.id });
    });
  } catch (error) {
    // La contrainte différée a refusé à la validation : un vote est arrivé.
    if (isForeignKeyViolation(error)) return fail({ code: 'DAY_HAS_VOTES', day });
    throw error;
  }
}

function isForeignKeyViolation(error: unknown): boolean {
  if (error instanceof Prisma.PrismaClientKnownRequestError) return error.code === 'P2003';
  return error instanceof Error && /foreign key|23503/i.test(error.message);
}

/** Options du sondage (FR-040, FR-041). Désactiver le résumé annule celui en attente. */
export async function setPollOptions(
  ownerId: string,
  publicId: string,
  options: { requireAccount: boolean; notifyOwner: boolean },
): Promise<Owned> {
  return prisma.$transaction(async (tx) => {
    const poll = await lockOwnedPoll(tx, ownerId, publicId);
    if (!poll) return fail(NOT_FOUND);
    await tx.poll.update({ where: { id: poll.id }, data: options });
    if (!options.notifyOwner) {
      await tx.emailOutbox.updateMany({
        where: { pollId: poll.id, template: 'OWNER_DIGEST', status: 'PENDING' },
        data: { status: 'CANCELLED' },
      });
    }
    return ok({ pollId: poll.id });
  });
}

/** Supprime la réponse d'un participant (FR-039). */
export async function deleteResponse(ownerId: string, publicId: string, responseId: string): Promise<Owned> {
  const poll = await prisma.poll.findFirst({ where: { publicId, ownerId }, select: { id: true } });
  if (!poll) return fail(NOT_FOUND);
  const { count } = await prisma.response.deleteMany({ where: { id: responseId, poll: { id: poll.id, ownerId } } });
  return count === 0 ? fail(NOT_FOUND) : ok({ pollId: poll.id });
}

/** Supprime le sondage, ses jours, réponses et votes ; annule ses emails en attente (FR-025). */
export async function deletePoll(ownerId: string, publicId: string): Promise<Owned> {
  return prisma.$transaction(async (tx) => {
    const poll = await lockOwnedPoll(tx, ownerId, publicId);
    if (!poll) return fail(NOT_FOUND);
    await cancelPendingForPoll(poll.id, tx);
    await tx.poll.delete({ where: { id: poll.id } });
    return ok({ pollId: poll.id });
  });
}
