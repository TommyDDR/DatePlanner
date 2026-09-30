import { randomBytes } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { fail, ok, type ActionResult } from '@/lib/action-result';
import { dateFromDay, type Day } from '@/lib/paris-day';
import { validateProposedDays } from '@/lib/poll-rules';
import { RULE_MESSAGES } from '@/lib/validation';
import { prisma } from '@/server/db/client';

/**
 * Création d'un sondage (FR-007 à FR-012).
 *
 * Les jours sont revalidés ICI avec le jour de Paris, même s'ils l'ont été
 * dans le navigateur : le serveur décide (constitution II).
 */

export type CreatePollInput = {
  title: string;
  description: string | null;
  days: readonly string[];
  requireAccount: boolean;
  notifyOwner: boolean;
};

/** 128 bits aléatoires en base64url : 22 caractères, impossibles à deviner (FR-012). */
export function newPublicId(): string {
  return randomBytes(16).toString('base64url');
}

export async function createPoll(
  ownerId: string,
  input: CreatePollInput,
  today: Day,
): Promise<ActionResult<{ publicId: string }>> {
  const days = validateProposedDays(input.days, today);
  if (!days.ok) return fail({ code: 'VALIDATION', fields: { days: RULE_MESSAGES[days.error] } });

  // Une collision sur 128 bits n'arrive pas ; la contrainte d'unicité reste
  // pourtant la seule garantie, et un nouvel essai coûte une ligne.
  for (let attempt = 0; attempt < 3; attempt++) {
    const publicId = newPublicId();
    try {
      await prisma.poll.create({
        data: {
          publicId,
          ownerId,
          title: input.title,
          description: input.description,
          requireAccount: input.requireAccount,
          notifyOwner: input.notifyOwner,
          ownerDigestCursor: new Date(),
          days: { create: days.value.map((day) => ({ day: dateFromDay(day) })) },
        },
      });
      return ok({ publicId });
    } catch (error) {
      const collision =
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002' &&
        JSON.stringify(error.meta ?? {}).includes('public_id');
      if (!collision) throw error;
    }
  }
  throw new Error('Impossible de tirer un identifiant public libre.');
}
