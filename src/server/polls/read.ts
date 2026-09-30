import { dayFromDate } from '@/lib/paris-day';
import { isPublicId } from '@/lib/public-id';
import { prisma } from '@/server/db/client';

/**
 * Lectures d'un sondage.
 *
 * Un sondage se lit par son identifiant PUBLIC : quiconque a le lien le voit
 * (FR-013, FR-022). Un identifiant mal formé ne coûte même pas une requête.
 */

export type PollView = {
  id: string;
  publicId: string;
  ownerId: string;
  title: string;
  description: string | null;
  status: 'OPEN' | 'CLOSED';
  requireAccount: boolean;
  notifyOwner: boolean;
  createdAt: Date;
  /** Jours proposés, `AAAA-MM-JJ`, dans l'ordre du calendrier. */
  days: string[];
  /** La date retenue, `AAAA-MM-JJ`, seulement sur un sondage clos. */
  retainedDay: string | null;
};

export async function getPollByPublicId(publicId: string): Promise<PollView | null> {
  if (!isPublicId(publicId)) return null;
  const poll = await prisma.poll.findUnique({
    where: { publicId },
    include: { days: { orderBy: { day: 'asc' }, select: { id: true, day: true } } },
  });
  if (!poll) return null;
  const retained = poll.retainedDayId ? poll.days.find((d) => d.id === poll.retainedDayId) : undefined;
  return {
    id: poll.id,
    publicId: poll.publicId,
    ownerId: poll.ownerId,
    title: poll.title,
    description: poll.description,
    status: poll.status,
    requireAccount: poll.requireAccount,
    notifyOwner: poll.notifyOwner,
    createdAt: poll.createdAt,
    days: poll.days.map((d) => dayFromDate(d.day)),
    retainedDay: retained ? dayFromDate(retained.day) : null,
  };
}
