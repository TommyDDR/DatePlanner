import { Prisma } from '@prisma/client';
import { fail, ok, type ActionResult } from '@/lib/action-result';
import { dayFromDate, type Day } from '@/lib/paris-day';
import { validateResponseDays } from '@/lib/poll-rules';
import { RULE_MESSAGES } from '@/lib/validation';
import { prisma, type Tx } from '@/server/db/client';

/**
 * Réponses à un sondage (FR-013 à FR-019).
 *
 * Tout ce que l'interface empêche - jour non proposé ou passé, sondage clos,
 * compte exigé - est revérifié ICI, dans la transaction qui écrit les votes
 * (constitution II). Le moindre jour invalide refuse toute la réponse.
 */

/**
 * Qui répond : un compte, ou un appareil sans session. Connecté, on n'agit
 * que sur la réponse du COMPTE ; la réponse anonyme que l'appareil aurait
 * donnée auparavant est ignorée - on la retrouve une fois déconnecté.
 */
export type Respondent = { kind: 'user'; userId: string } | { kind: 'device'; deviceTokenHash: string };

function respondentFilter(respondent: Respondent) {
  return respondent.kind === 'user'
    ? { userId: respondent.userId }
    : { deviceTokenHash: respondent.deviceTokenHash, userId: null };
}

type LockedPoll = { id: string; status: 'OPEN' | 'CLOSED'; require_account: boolean };

/**
 * Relit le sondage en posant un verrou PARTAGÉ sur sa ligne : une clôture
 * concurrente (qui écrit la ligne) attend la fin de cette transaction. Une
 * réponse ne peut donc pas se glisser dans un sondage qui se ferme.
 */
async function lockPoll(tx: Tx, publicId: string): Promise<LockedPoll | null> {
  const rows = await tx.$queryRaw<LockedPoll[]>`
    SELECT "id", "status"::text AS "status", "require_account"
    FROM "poll" WHERE "public_id" = ${publicId} FOR SHARE`;
  return rows[0] ?? null;
}

export async function submitResponse(
  publicId: string,
  respondent: Respondent,
  days: readonly string[],
  pseudonym: string | null,
  today: Day,
): Promise<ActionResult<{ pollId: string; created: boolean }>> {
  // Deux soumissions simultanées du même répondant : la seconde bute sur
  // l'unicité, puis se rejoue en mise à jour.
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      return await prisma.$transaction((tx) => writeResponse(tx, publicId, respondent, days, pseudonym, today));
    } catch (error) {
      const conflict = error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
      if (!conflict || attempt === 1) throw error;
    }
  }
  throw new Error('inaccessible');
}

async function writeResponse(
  tx: Tx,
  publicId: string,
  respondent: Respondent,
  days: readonly string[],
  pseudonym: string | null,
  today: Day,
): Promise<ActionResult<{ pollId: string; created: boolean }>> {
  const poll = await lockPoll(tx, publicId);
  if (!poll) return fail({ code: 'NOT_FOUND' });
  if (poll.status !== 'OPEN') return fail({ code: 'POLL_CLOSED' });
  if (poll.require_account && respondent.kind !== 'user') return fail({ code: 'ACCOUNT_REQUIRED' });

  const pollDays = await tx.pollDay.findMany({ where: { pollId: poll.id }, select: { id: true, day: true } });
  const idByDay = new Map(pollDays.map((d) => [dayFromDate(d.day), d.id]));
  const chosen = validateResponseDays(days, new Set(idByDay.keys()), today);
  if (!chosen.ok) return fail({ code: 'VALIDATION', fields: { days: RULE_MESSAGES[chosen.error] } });

  const existing = await tx.response.findFirst({
    where: { pollId: poll.id, ...respondentFilter(respondent) },
    select: { id: true },
  });

  let responseId: string;
  if (existing) {
    responseId = existing.id;
    await tx.response.update({
      where: { id: existing.id },
      data: { pseudonym: respondent.kind === 'device' ? pseudonym : null, updatedAt: new Date() },
    });
    await tx.vote.deleteMany({ where: { responseId } });
  } else {
    const created = await tx.response.create({
      data: {
        pollId: poll.id,
        userId: respondent.kind === 'user' ? respondent.userId : null,
        pseudonym: respondent.kind === 'device' ? pseudonym : null,
        deviceTokenHash: respondent.kind === 'device' ? respondent.deviceTokenHash : null,
      },
      select: { id: true },
    });
    responseId = created.id;
  }

  await tx.vote.createMany({
    data: chosen.value.map((day) => ({ responseId, pollDayId: idByDay.get(day)! })),
  });
  return ok({ pollId: poll.id, created: !existing });
}

/** Retire la réponse de ce répondant, et elle seule (FR-019). */
export async function withdrawResponse(
  publicId: string,
  respondent: Respondent,
): Promise<ActionResult<{ pollId: string }>> {
  return prisma.$transaction(async (tx) => {
    const poll = await lockPoll(tx, publicId);
    if (!poll) return fail({ code: 'NOT_FOUND' });
    if (poll.status !== 'OPEN') return fail({ code: 'POLL_CLOSED' });
    const { count } = await tx.response.deleteMany({ where: { pollId: poll.id, ...respondentFilter(respondent) } });
    if (count === 0) return fail({ code: 'NOT_FOUND' });
    return ok({ pollId: poll.id });
  });
}
