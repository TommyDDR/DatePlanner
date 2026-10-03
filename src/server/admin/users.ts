import type { Prisma } from '@prisma/client';
import { isAdminAccount } from '@/config/admin';
import { ADMIN_LISTS } from '@/config/limits';
import { fail, ok, type ActionResult } from '@/lib/action-result';
import { clampPage, pageCount, type UserListQuery } from '@/lib/admin-query';
import { prisma } from '@/server/db/client';
import { cancelPendingForPoll } from '@/server/notifications/outbox';
import type { AdminUser } from './access';

/**
 * Les comptes, vus par l'administration (FR-046, FR-047).
 */

/** Une page d'une liste de l'administration. */
export type Paged<T> = { rows: T[]; total: number; page: number; pageCount: number };

export type AdminUserRow = {
  id: string;
  displayName: string;
  email: string;
  hasPassword: boolean;
  hasGoogle: boolean;
  emailProved: boolean;
  createdAt: Date;
  lastActiveAt: Date;
  polls: number;
  responses: number;
  /** Administrateur : son compte ne se supprime pas d'ici. */
  isAdmin: boolean;
  isSelf: boolean;
};

function userSearch(q: string): Prisma.UserWhereInput {
  if (q === '') return {};
  return {
    OR: [{ email: { contains: q, mode: 'insensitive' } }, { displayName: { contains: q, mode: 'insensitive' } }],
  };
}

/** Les comptes, les plus récents d'abord. */
export async function listUsers(admin: AdminUser, query: UserListQuery): Promise<Paged<AdminUserRow>> {
  const where = userSearch(query.q);
  const total = await prisma.user.count({ where });
  const page = clampPage(query.page, total);
  const users = await prisma.user.findMany({
    where,
    orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
    skip: (page - 1) * ADMIN_LISTS.pageSize,
    take: ADMIN_LISTS.pageSize,
    select: {
      id: true,
      displayName: true,
      email: true,
      passwordHash: true,
      googleId: true,
      emailProvedAt: true,
      createdAt: true,
      lastActiveAt: true,
      _count: { select: { polls: true, responses: true } },
    },
  });
  return {
    rows: users.map((user) => ({
      id: user.id,
      displayName: user.displayName,
      email: user.email,
      hasPassword: user.passwordHash !== null,
      hasGoogle: user.googleId !== null,
      emailProved: user.emailProvedAt !== null,
      createdAt: user.createdAt,
      lastActiveAt: user.lastActiveAt,
      polls: user._count.polls,
      responses: user._count.responses,
      isAdmin: isAdminAccount(user),
      isSelf: user.id === admin.id,
    })),
    total,
    page,
    pageCount: pageCount(total),
  };
}

/** Ce que la suppression a touché : les pages ouvertes à prévenir. */
export type DeletedUser = {
  /** Ses sondages, supprimés avec lui. */
  deletedPollIds: string[];
  /** Les sondages d'autres comptes où une de ses réponses a disparu. */
  touchedPollIds: string[];
};

/**
 * Supprime un compte, ses sondages - avec leurs jours, réponses et votes - et
 * les réponses qu'il a données ailleurs : la cascade de la base, comme pour
 * la suppression par son titulaire (FR-006). Les emails encore en attente de
 * ses sondages, et ceux qui lui étaient adressés, sont annulés.
 *
 * Ni le compte de l'administrateur lui-même, ni celui d'un autre
 * administrateur : le premier se supprime depuis « Mon compte », le second
 * cesse d'abord d'être déclaré dans `ADMIN_EMAILS`.
 */
export async function deleteUserAsAdmin(admin: AdminUser, userId: string): Promise<ActionResult<DeletedUser>> {
  if (userId === admin.id) {
    return fail({ code: 'VALIDATION', fields: { _form: 'Votre propre compte se supprime depuis « Mon compte ».' } });
  }
  return prisma.$transaction(async (tx) => {
    const [target] = await tx.$queryRaw<Array<{ email: string; email_proved_at: Date | null }>>`
      SELECT "email", "email_proved_at" FROM "user" WHERE "id" = ${userId}::uuid FOR UPDATE`;
    if (!target) return fail({ code: 'NOT_FOUND' });
    if (isAdminAccount({ email: target.email, emailProvedAt: target.email_proved_at })) {
      return fail({ code: 'VALIDATION', fields: { _form: 'Le compte d’un administrateur ne se supprime pas d’ici.' } });
    }

    const owned = await tx.poll.findMany({ where: { ownerId: userId }, select: { id: true } });
    const answered = await tx.response.findMany({
      where: { userId, poll: { ownerId: { not: userId } } },
      distinct: ['pollId'],
      select: { pollId: true },
    });
    for (const poll of owned) await cancelPendingForPoll(poll.id, tx);
    await tx.emailOutbox.updateMany({ where: { to: target.email, status: 'PENDING' }, data: { status: 'CANCELLED' } });
    await tx.user.delete({ where: { id: userId } });

    return ok({ deletedPollIds: owned.map((poll) => poll.id), touchedPollIds: answered.map((response) => response.pollId) });
  });
}
