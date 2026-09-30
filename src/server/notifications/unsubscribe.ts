import { verifyLink } from '@/lib/signed-link';
import { prisma } from '@/server/db/client';
import { OWNER_DIGEST_PURPOSE } from './digest';

/**
 * Désactive le résumé d'un sondage par un lien signé (FR-041).
 *
 * Rend `true` si la signature tient et que le sondage existe. Le résumé en
 * attente est annulé dans la même transaction.
 */
export async function disableOwnerDigest(token: string): Promise<boolean> {
  const pollId = verifyLink(OWNER_DIGEST_PURPOSE, token);
  if (!pollId || !/^[0-9a-f-]{36}$/i.test(pollId)) return false;
  return prisma.$transaction(async (tx) => {
    const { count } = await tx.poll.updateMany({ where: { id: pollId }, data: { notifyOwner: false } });
    if (count === 0) return false;
    await tx.emailOutbox.updateMany({
      where: { pollId, template: 'OWNER_DIGEST', status: 'PENDING' },
      data: { status: 'CANCELLED' },
    });
    return true;
  });
}
