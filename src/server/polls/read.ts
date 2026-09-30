import { buildAvailability, type DayAvailability } from '@/lib/availability';
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

/**
 * Qui a voté pour quel jour (FR-020 à FR-022), en une seule requête.
 *
 * Le nom d'une réponse connectée est le nom d'affichage ACTUEL du compte, lu
 * au rendu ; celui d'une réponse sans compte, son pseudo. Rien d'autre du
 * compte - ni adresse, ni identifiant - ne sort d'ici.
 */
export async function getPollSynthesis(pollId: string): Promise<DayAvailability[]> {
  const votes = await prisma.vote.findMany({
    where: { response: { pollId } },
    select: {
      pollDay: { select: { day: true } },
      response: { select: { pseudonym: true, user: { select: { displayName: true } } } },
    },
  });
  return buildAvailability(
    votes.map((vote) => ({
      day: dayFromDate(vote.pollDay.day),
      name: vote.response.user?.displayName ?? vote.response.pseudonym ?? '',
      account: vote.response.user !== null,
    })),
  );
}

/** Une ligne de « Mes sondages » (FR-024). */
export type OwnerPollRow = {
  publicId: string;
  title: string;
  respondents: number;
  createdAt: Date;
  status: 'OPEN' | 'CLOSED';
  retainedDay: string | null;
};

/** Les sondages d'un compte, les plus récents d'abord. Le filtre sur le propriétaire est dans la requête. */
export async function listOwnerPolls(ownerId: string): Promise<OwnerPollRow[]> {
  const polls = await prisma.poll.findMany({
    where: { ownerId },
    orderBy: { createdAt: 'desc' },
    select: {
      publicId: true,
      title: true,
      createdAt: true,
      status: true,
      retainedDayId: true,
      days: { select: { id: true, day: true } },
      _count: { select: { responses: true } },
    },
  });
  return polls.map((poll) => {
    const retained = poll.retainedDayId ? poll.days.find((d) => d.id === poll.retainedDayId) : undefined;
    return {
      publicId: poll.publicId,
      title: poll.title,
      respondents: poll._count.responses,
      createdAt: poll.createdAt,
      status: poll.status,
      retainedDay: retained ? dayFromDate(retained.day) : null,
    };
  });
}

/** Une réponse telle que le créateur la modère (FR-039). */
export type ModeratedResponse = { id: string; name: string; account: boolean; createdAt: Date };

/** Les réponses d'un sondage, pour son SEUL créateur : le filtre sur le propriétaire est dans la requête. */
export async function listResponsesForOwner(ownerId: string, pollId: string): Promise<ModeratedResponse[]> {
  const responses = await prisma.response.findMany({
    where: { pollId, poll: { ownerId } },
    orderBy: { createdAt: 'asc' },
    select: { id: true, pseudonym: true, createdAt: true, user: { select: { displayName: true } } },
  });
  return responses.map((r) => ({
    id: r.id,
    name: r.user?.displayName ?? r.pseudonym ?? '',
    account: r.user !== null,
    createdAt: r.createdAt,
  }));
}

/** La réponse de ce répondant à ce sondage : son pseudo et ses jours. */
export type OwnResponse = { pseudonym: string | null; days: string[] };

/**
 * La réponse de l'acteur courant (FR-019) : connecté, celle de son COMPTE ;
 * sans session, celle de son appareil. La réponse anonyme d'un appareil n'est
 * jamais relue pour un utilisateur connecté.
 */
export async function getOwnResponse(
  pollId: string,
  actor: { userId: string } | { deviceTokenHash: string } | null,
): Promise<OwnResponse | null> {
  if (!actor) return null;
  const response = await prisma.response.findFirst({
    where: {
      pollId,
      ...('userId' in actor ? { userId: actor.userId } : { deviceTokenHash: actor.deviceTokenHash, userId: null }),
    },
    select: { pseudonym: true, votes: { select: { pollDay: { select: { day: true } } } } },
  });
  if (!response) return null;
  return {
    pseudonym: response.pseudonym,
    days: response.votes.map((vote) => dayFromDate(vote.pollDay.day)).sort(),
  };
}

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
