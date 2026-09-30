import { beforeEach, describe, expect, it } from 'vitest';
import { POLL_LIMITS, RATE_LIMITS, SESSION } from '@/config/limits';
import { prisma } from '@/server/db/client';
import { createPollAction } from '@/app/nouveau/actions';
import { testCookies, TestRedirect } from '../setup';
import { resetDatabase } from '../helpers/db';
import { createSessionFor, createUser, dayFromToday } from '../helpers/factories';

/** Création d'un sondage (FR-007 à FR-012, FR-038, FR-040, FR-041). */

beforeEach(async () => {
  await resetDatabase();
  testCookies.clear();
});

function form(values: Record<string, string | string[]>): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(values)) {
    for (const item of Array.isArray(value) ? value : [value]) data.append(key, item);
  }
  return data;
}

async function signIn() {
  const user = await createUser();
  testCookies.set(SESSION.cookieName, await createSessionFor(user.id));
  return user;
}

/** Lance l'action ; rend la destination de sa redirection, ou son état d'erreur. */
async function submit(values: Record<string, string | string[]>) {
  try {
    return { state: await createPollAction(null, form(values)) };
  } catch (error) {
    if (error instanceof TestRedirect) return { redirect: error.location };
    throw error;
  }
}

describe('createPollAction', () => {
  it('exige une session', async () => {
    const result = await submit({ title: 'Dîner', days: [dayFromToday(2)] });
    expect(result.redirect).toBe('/connexion?suite=%2Fnouveau');
    expect(await prisma.poll.count()).toBe(0);
  });

  it('crée le sondage et renvoie sur son lien', async () => {
    const user = await signIn();
    const result = await submit({
      title: '  Dîner de rentrée ',
      description: 'Chez Léa',
      days: [dayFromToday(3), dayFromToday(1), dayFromToday(3)],
      notifyOwner: 'on',
    });
    const poll = await prisma.poll.findFirstOrThrow({ include: { days: { orderBy: { day: 'asc' } } } });
    expect(result.redirect).toBe(`/s/${poll.publicId}?cree=1`);
    expect(poll.publicId).toMatch(/^[A-Za-z0-9_-]{22}$/);
    expect(poll).toMatchObject({
      ownerId: user.id,
      title: 'Dîner de rentrée',
      description: 'Chez Léa',
      status: 'OPEN',
      requireAccount: false,
      notifyOwner: true,
    });
    expect(poll.days.map((d) => d.day.toISOString().slice(0, 10))).toEqual([dayFromToday(1), dayFromToday(3)]);
    expect(Math.abs(poll.ownerDigestCursor.getTime() - poll.createdAt.getTime())).toBeLessThan(5000);
  });

  it('enregistre l’option « répondants connectés uniquement »', async () => {
    await signIn();
    await submit({ title: 'Réunion', days: [dayFromToday(2)], requireAccount: 'on' });
    expect(await prisma.poll.findFirstOrThrow()).toMatchObject({ requireAccount: true, notifyOwner: false });
  });

  it('refuse un titre vide et garde la saisie', async () => {
    await signIn();
    const result = await submit({ title: '   ', description: 'garde-moi', days: [dayFromToday(2)] });
    expect(result.state).toMatchObject({
      error: { code: 'VALIDATION', fields: { title: 'Donnez un titre au sondage.' } },
      values: { description: 'garde-moi', days: [dayFromToday(2)] },
    });
    expect(await prisma.poll.count()).toBe(0);
  });

  it('refuse un sondage sans jour, un jour passé, et plus de 366 jours', async () => {
    await signIn();
    expect((await submit({ title: 'x', days: [] })).state?.error).toMatchObject({ fields: { days: expect.any(String) } });
    expect((await submit({ title: 'x', days: [dayFromToday(-1)] })).state?.error).toMatchObject({
      fields: { days: 'Un jour déjà passé ne peut pas être choisi.' },
    });
    const tooMany = Array.from({ length: POLL_LIMITS.maxDays + 1 }, (_, i) => dayFromToday(i + 1));
    expect((await submit({ title: 'x', days: tooMany })).state?.error).toMatchObject({
      fields: { days: `Un sondage propose au plus ${POLL_LIMITS.maxDays} jours.` },
    });
    expect(await prisma.poll.count()).toBe(0);
  });

  it('donne à chaque sondage un lien distinct', async () => {
    await signIn();
    await submit({ title: 'a', days: [dayFromToday(1)] });
    await submit({ title: 'b', days: [dayFromToday(1)] });
    const polls = await prisma.poll.findMany();
    expect(new Set(polls.map((p) => p.publicId)).size).toBe(2);
  });

  it('borne les créations par compte', async () => {
    await signIn();
    for (let i = 0; i < RATE_LIMITS.pollCreatePerUser.limit; i++) await submit({ title: `s${i}`, days: [dayFromToday(1)] });
    const refused = await submit({ title: 'de trop', days: [dayFromToday(1)] });
    expect(refused.state?.error).toMatchObject({ code: 'RATE_LIMITED' });
  });
});
