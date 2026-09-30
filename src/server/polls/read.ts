import type { Prisma } from '@prisma/client';
import { buildAvailability, type DayAvailability } from '@/lib/availability';
import { hasNews } from '@/lib/news';
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
  /** La version de ce qu'affiche la page (décision 034). */
  activityAt: Date;
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

/** Une ligne de « Mes sondages » (FR-024, FR-044). */
export type MyPollRow = {
  publicId: string;
  title: string;
  respondents: number;
  createdAt: Date;
  status: 'OPEN' | 'CLOSED';
  retainedDay: string | null;
  /** Un changement que ce compte n'a pas encore vu (décision 034). */
  news: boolean;
};

/** Une ligne de « Auxquels j'ai répondu » : le sondage d'un autre compte. */
export type RespondedPollRow = MyPollRow & { ownerName: string };

const MY_POLL_ROW = {
  publicId: true,
  title: true,
  createdAt: true,
  status: true,
  retainedDayId: true,
  activityAt: true,
  days: { select: { id: true, day: true } },
  _count: { select: { responses: true } },
} satisfies Prisma.PollSelect;

type MyPollRecord = Prisma.PollGetPayload<{ select: typeof MY_POLL_ROW }>;

function toMyPollRow(poll: MyPollRecord, seenAt: Date | null): MyPollRow {
  const retained = poll.retainedDayId ? poll.days.find((d) => d.id === poll.retainedDayId) : undefined;
  return {
    publicId: poll.publicId,
    title: poll.title,
    respondents: poll._count.responses,
    createdAt: poll.createdAt,
    status: poll.status,
    retainedDay: retained ? dayFromDate(retained.day) : null,
    news: hasNews(poll.activityAt, seenAt),
  };
}

/** Les sondages d'un compte, les plus récents d'abord. Le filtre sur le propriétaire est dans la requête. */
export async function listOwnerPolls(ownerId: string): Promise<MyPollRow[]> {
  const polls = await prisma.poll.findMany({
    where: { ownerId },
    orderBy: { createdAt: 'desc' },
    select: { ...MY_POLL_ROW, ownerSeenAt: true },
  });
  return polls.map((poll) => toMyPollRow(poll, poll.ownerSeenAt));
}

/**
 * Les sondages d'AUTRES comptes auxquels ce compte a répondu, sa réponse la
 * plus récente d'abord. Seules les réponses connectées comptent : une réponse
 * sans compte appartient à un appareil, pas au compte. Le filtre sur le
 * répondant est dans la requête.
 */
export async function listRespondedPolls(userId: string): Promise<RespondedPollRow[]> {
  const responses = await prisma.response.findMany({
    where: { userId, poll: { ownerId: { not: userId } } },
    orderBy: { createdAt: 'desc' },
    select: { seenAt: true, poll: { select: { ...MY_POLL_ROW, owner: { select: { displayName: true } } } } },
  });
  return responses.map(({ seenAt, poll }) => ({ ...toMyPollRow(poll, seenAt), ownerName: poll.owner.displayName }));
}

/**
 * Les identifiants INTERNES des sondages de « Mes sondages » : créés par le
 * compte, ou auxquels il a répondu avec lui. Pour le flux en direct, jamais
 * pour une page.
 */
export async function listMyPollIds(userId: string): Promise<string[]> {
  const polls = await prisma.poll.findMany({
    where: { OR: [{ ownerId: userId }, { responses: { some: { userId } } }] },
    select: { id: true },
  });
  return polls.map((poll) => poll.id);
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
    activityAt: poll.activityAt,
    days: poll.days.map((d) => dayFromDate(d.day)),
    retainedDay: retained ? dayFromDate(retained.day) : null,
  };
}
