import type { Prisma } from '@prisma/client';
import { ADMIN_LISTS } from '@/config/limits';
import { clampPage, pageCount, type PollListQuery } from '@/lib/admin-query';
import { addDays, dateFromDay, dayFromDate, startOfParisDay, type Day } from '@/lib/paris-day';
import { prisma } from '@/server/db/client';
import type { AdminUser } from './access';
import type { Paged } from './users';

/**
 * Tous les sondages, vus par l'administration (FR-048).
 */

export type AdminPollRow = {
  publicId: string;
  title: string;
  status: 'OPEN' | 'CLOSED';
  owner: { displayName: string; email: string };
  createdAt: Date;
  closedAt: Date | null;
  activityAt: Date;
  respondents: number;
  /** Jours proposés : leur nombre, le premier et le dernier. */
  dayCount: number;
  firstDay: Day | null;
  lastDay: Day | null;
  /** Les dates retenues, triées. */
  retainedDays: Day[];
};

const insensitive = (q: string) => ({ contains: q, mode: 'insensitive' as const });

/**
 * Les filtres. Une période de création ou de clôture s'entend en jours de
 * Paris, bornes comprises ; une période de jours proposés retient un sondage
 * dont au moins un jour y tombe.
 */
function pollWhere(query: PollListQuery): Prisma.PollWhereInput {
  const and: Prisma.PollWhereInput[] = [];
  if (query.q !== '') {
    and.push({
      OR: [
        { title: insensitive(query.q) },
        { owner: { email: insensitive(query.q) } },
        { owner: { displayName: insensitive(query.q) } },
      ],
    });
  }
  if (query.etat === 'ouverts') and.push({ status: 'OPEN' });
  if (query.etat === 'clos') and.push({ status: 'CLOSED' });

  if (query.du !== null || query.au !== null) {
    if (query.periode === 'jours') {
      and.push({
        days: {
          some: {
            day: {
              ...(query.du !== null ? { gte: dateFromDay(query.du) } : {}),
              ...(query.au !== null ? { lte: dateFromDay(query.au) } : {}),
            },
          },
        },
      });
    } else {
      const range = {
        ...(query.du !== null ? { gte: startOfParisDay(query.du) } : {}),
        ...(query.au !== null ? { lt: startOfParisDay(addDays(query.au, 1)) } : {}),
      };
      and.push(query.periode === 'cloture' ? { closedAt: range } : { createdAt: range });
    }
  }
  return { AND: and };
}

/** L'ordre demandé, puis un ordre fixe : une page ne reprend jamais une ligne de la précédente. */
function pollOrder(query: PollListQuery): Prisma.PollOrderByWithRelationInput[] {
  const sens = query.sens;
  switch (query.tri) {
    case 'cloture':
      // Un sondage ouvert n'a pas de date de clôture : il vient après les autres.
      return [{ closedAt: { sort: sens, nulls: 'last' } }, { createdAt: 'desc' }, { id: 'asc' }];
    case 'activite':
      return [{ activityAt: sens }, { id: 'asc' }];
    case 'titre':
      return [{ title: sens }, { createdAt: 'desc' }, { id: 'asc' }];
    case 'repondants':
      return [{ responses: { _count: sens } }, { createdAt: 'desc' }, { id: 'asc' }];
    case 'creation':
      return [{ createdAt: sens }, { id: 'asc' }];
  }
}

export async function listPolls(_admin: AdminUser, query: PollListQuery): Promise<Paged<AdminPollRow>> {
  const where = pollWhere(query);
  const total = await prisma.poll.count({ where });
  const page = clampPage(query.page, total);
  const polls = await prisma.poll.findMany({
    where,
    orderBy: pollOrder(query),
    skip: (page - 1) * ADMIN_LISTS.pageSize,
    take: ADMIN_LISTS.pageSize,
    select: {
      id: true,
      publicId: true,
      title: true,
      status: true,
      createdAt: true,
      closedAt: true,
      activityAt: true,
      owner: { select: { displayName: true, email: true } },
      days: { where: { retained: { isNot: null } }, orderBy: { day: 'asc' }, select: { day: true } },
      _count: { select: { responses: true } },
    },
  });

  // Le premier et le dernier jour de chaque sondage de la page, en une requête.
  const spans = await prisma.pollDay.groupBy({
    by: ['pollId'],
    where: { pollId: { in: polls.map((poll) => poll.id) } },
    _count: { _all: true },
    _min: { day: true },
    _max: { day: true },
  });
  const spanOf = new Map(spans.map((span) => [span.pollId, span]));

  return {
    rows: polls.map((poll) => {
      const span = spanOf.get(poll.id);
      return {
        publicId: poll.publicId,
        title: poll.title,
        status: poll.status,
        owner: poll.owner,
        createdAt: poll.createdAt,
        closedAt: poll.closedAt,
        activityAt: poll.activityAt,
        respondents: poll._count.responses,
        dayCount: span?._count._all ?? 0,
        firstDay: span?._min.day ? dayFromDate(span._min.day) : null,
        lastDay: span?._max.day ? dayFromDate(span._max.day) : null,
        retainedDays: poll.days.map((d) => dayFromDate(d.day)),
      };
    }),
    total,
    page,
    pageCount: pageCount(total),
  };
}
