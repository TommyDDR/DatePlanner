import { createHash, randomBytes } from 'node:crypto';
import type { PollStatus } from '@prisma/client';
import { todayInParis } from '@/lib/paris-day';
import { prisma } from '@/server/db/client';

/**
 * Fabriques des tests d'intégration.
 *
 * Elles écrivent directement en base, sans passer par les actions : un test
 * prépare la situation qu'il examine, il ne rejoue pas tout le parcours.
 */

let counter = 0;
function unique(): string {
  counter += 1;
  return `${Date.now().toString(36)}${counter}`;
}

/** Un jour `AAAA-MM-JJ` en date de minuit UTC, la forme d'une colonne DATE. */
export function dayDate(day: string): Date {
  return new Date(`${day}T00:00:00.000Z`);
}

/**
 * Le jour à `offset` jours d'aujourd'hui, au format `AAAA-MM-JJ` - aujourd'hui
 * s'entendant à Paris, comme pour le serveur : sinon un test lancé entre minuit
 * et deux heures verrait « demain » déjà arrivé.
 */
export function dayFromToday(offset: number): string {
  const date = new Date(`${todayInParis(new Date())}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + offset);
  return date.toISOString().slice(0, 10);
}

export function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

export async function createUser(
  overrides: Partial<{
    email: string;
    displayName: string;
    passwordHash: string | null;
    googleId: string | null;
    emailProvedAt: Date | null;
    lastActiveAt: Date;
  }> = {},
) {
  return prisma.user.create({
    data: {
      email: overrides.email ?? `u${unique()}@exemple.test`,
      displayName: overrides.displayName ?? 'Camille',
      passwordHash: overrides.passwordHash === undefined ? null : overrides.passwordHash,
      googleId: overrides.googleId ?? null,
      emailProvedAt: overrides.emailProvedAt ?? null,
      ...(overrides.lastActiveAt ? { lastActiveAt: overrides.lastActiveAt } : {}),
    },
  });
}

/** Une session en base et son jeton en clair, à poser dans le bocal à cookies. */
export async function createSessionFor(userId: string): Promise<string> {
  const token = randomBytes(32).toString('base64url');
  await prisma.session.create({
    data: {
      userId,
      tokenHash: sha256(token),
      expiresAt: new Date(Date.now() + 30 * 86_400_000),
    },
  });
  return token;
}

export async function createPoll(
  options: {
    owner?: { id: string };
    days?: string[];
    status?: PollStatus;
    requireAccount?: boolean;
    notifyOwner?: boolean;
    title?: string;
    description?: string | null;
  } = {},
) {
  const owner = options.owner ?? (await createUser());
  const days = options.days ?? [dayFromToday(3), dayFromToday(4), dayFromToday(5)];
  return prisma.poll.create({
    data: {
      publicId: randomBytes(16).toString('base64url'),
      ownerId: owner.id,
      title: options.title ?? 'Dîner de rentrée',
      description: options.description ?? null,
      status: options.status ?? 'OPEN',
      requireAccount: options.requireAccount ?? false,
      notifyOwner: options.notifyOwner ?? true,
      days: { create: days.map((day) => ({ day: dayDate(day) })) },
    },
    include: { days: { orderBy: { day: 'asc' } } },
  });
}

export async function createResponse(options: {
  poll: { id: string };
  days: string[];
  user?: { id: string };
  pseudonym?: string;
  deviceTokenHash?: string;
}) {
  const pollDays = await prisma.pollDay.findMany({
    where: { pollId: options.poll.id, day: { in: options.days.map(dayDate) } },
  });
  return prisma.response.create({
    data: {
      pollId: options.poll.id,
      userId: options.user?.id ?? null,
      pseudonym: options.user ? null : (options.pseudonym ?? 'Léa'),
      deviceTokenHash: options.user ? null : (options.deviceTokenHash ?? sha256(unique())),
      votes: { create: pollDays.map((pollDay) => ({ pollDayId: pollDay.id })) },
    },
  });
}
