import { beforeEach, describe, expect, it } from 'vitest';
import { SESSION } from '@/config/limits';
import { prisma } from '@/server/db/client';
import {
  changePollDaysAction,
  closePollAction,
  deletePollAction,
  deleteResponseAction,
  reopenPollAction,
  setPollOptionsAction,
  setRetainedDaysAction,
  updatePollDetailsAction,
} from '@/app/s/[publicId]/actions';
import { listOwnerPolls } from '@/server/polls/read';
import { testCookies, TestRedirect } from '../setup';
import { resetDatabase } from '../helpers/db';
import {
  createPoll,
  createResponse,
  createSessionFor,
  createUser,
  dayDate,
  dayFromToday,
  retainDays,
  retainedDaysOf,
} from '../helpers/factories';

/** Ce que le créateur fait de son sondage (FR-024 à FR-028, FR-039, FR-040). */

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

async function signIn(user: { id: string }) {
  testCookies.clear();
  testCookies.set(SESSION.cookieName, await createSessionFor(user.id));
}

async function ownPoll(options: Parameters<typeof createPoll>[0] = {}) {
  const owner = await createUser({ displayName: 'Proprio' });
  const poll = await createPoll({ owner, ...options });
  await signIn(owner);
  return { owner, poll };
}

const days = async (pollId: string) =>
  (await prisma.pollDay.findMany({ where: { pollId }, orderBy: { day: 'asc' } })).map((d) => d.day.toISOString().slice(0, 10));

describe('droits', () => {
  it('répond « introuvable » à chaque action d’un non-créateur', async () => {
    const { poll } = await ownPoll();
    const response = await createResponse({ poll, days: [dayFromToday(3)] });
    await signIn(await createUser());
    const id = poll.publicId;
    const attempts = await Promise.all([
      updatePollDetailsAction(null, form({ publicId: id, title: 'Piraté' })),
      changePollDaysAction(null, form({ publicId: id, add: [dayFromToday(9)], remove: [dayFromToday(5)] })),
      setPollOptionsAction(null, form({ publicId: id, requireAccount: 'on' })),
      closePollAction(null, form({ publicId: id })),
      deleteResponseAction(null, form({ publicId: id, responseId: response.id })),
      deletePollAction(null, form({ publicId: id })),
    ]);
    for (const state of attempts) expect(state?.error).toEqual({ code: 'NOT_FOUND' });
    expect(await prisma.poll.findUniqueOrThrow({ where: { id: poll.id } })).toMatchObject({ title: poll.title, status: 'OPEN' });
    expect(await prisma.response.count()).toBe(1);
  });

  it('refuse tout sans session', async () => {
    const { poll } = await ownPoll();
    testCookies.clear();
    expect((await closePollAction(null, form({ publicId: poll.publicId })))?.error).toEqual({ code: 'NOT_FOUND' });
  });
});

describe('titre, description, jours, options', () => {
  it('modifie le titre et la description', async () => {
    const { poll } = await ownPoll();
    await updatePollDetailsAction(null, form({ publicId: poll.publicId, title: ' Nouveau ', description: '' }));
    expect(await prisma.poll.findUniqueOrThrow({ where: { id: poll.id } })).toMatchObject({ title: 'Nouveau', description: null });
  });

  it('ajoute des jours, ignore les doublons, refuse un jour passé et le dépassement', async () => {
    const { poll } = await ownPoll({ days: [dayFromToday(3)] });
    const change = (values: { add?: string[]; remove?: string[] }) =>
      changePollDaysAction(null, form({ publicId: poll.publicId, ...values }));
    expect(await change({ add: [dayFromToday(3), dayFromToday(6)] })).toMatchObject({ done: true });
    expect(await days(poll.id)).toEqual([dayFromToday(3), dayFromToday(6)]);
    expect((await change({ add: [dayFromToday(-1)] }))?.error).toMatchObject({ code: 'VALIDATION' });
    const many = Array.from({ length: 366 }, (_, i) => dayFromToday(10 + i));
    expect((await change({ add: many }))?.error).toMatchObject({ code: 'VALIDATION' });
  });

  it('retire un jour sans vote, jamais un jour voté ni le dernier', async () => {
    const { poll } = await ownPoll({ days: [dayFromToday(3), dayFromToday(4), dayFromToday(5)] });
    const remove = (day: string) => changePollDaysAction(null, form({ publicId: poll.publicId, remove: [day] }));
    await createResponse({ poll, days: [dayFromToday(3)] });
    expect(await remove(dayFromToday(4))).toMatchObject({ done: true });
    expect((await remove(dayFromToday(3)))?.error).toEqual({ code: 'DAY_HAS_VOTES', day: dayFromToday(3) });
    await prisma.vote.deleteMany();
    await remove(dayFromToday(5));
    expect((await remove(dayFromToday(3)))?.error).toEqual({ code: 'LAST_DAY' });
    expect(await days(poll.id)).toEqual([dayFromToday(3)]);
  });

  it('ajoute et retire d’un seul envoi, et remplace ainsi le dernier jour', async () => {
    const { poll } = await ownPoll({ days: [dayFromToday(3)] });
    const state = await changePollDaysAction(
      null,
      form({ publicId: poll.publicId, add: [dayFromToday(7), dayFromToday(8)], remove: [dayFromToday(3)] }),
    );
    expect(state).toMatchObject({ done: true });
    expect(await days(poll.id)).toEqual([dayFromToday(7), dayFromToday(8)]);
  });

  it('n’écrit rien quand un des retraits est refusé', async () => {
    const { poll } = await ownPoll({ days: [dayFromToday(3), dayFromToday(4), dayFromToday(5)] });
    await createResponse({ poll, days: [dayFromToday(5)] });
    const state = await changePollDaysAction(
      null,
      form({ publicId: poll.publicId, add: [dayFromToday(9)], remove: [dayFromToday(4), dayFromToday(5)] }),
    );
    expect(state?.error).toEqual({ code: 'DAY_HAS_VOTES', day: dayFromToday(5) });
    expect(await days(poll.id)).toEqual([dayFromToday(3), dayFromToday(4), dayFromToday(5)]);
  });

  it('refuse de retirer une date retenue ou un jour étranger au sondage', async () => {
    const { poll } = await ownPoll({ days: [dayFromToday(3), dayFromToday(4)] });
    await closePollAction(null, form({ publicId: poll.publicId, retainedDays: [dayFromToday(4)] }));
    const retained = await changePollDaysAction(null, form({ publicId: poll.publicId, remove: [dayFromToday(4)] }));
    expect(retained?.error).toMatchObject({ code: 'VALIDATION' });
    const foreign = await changePollDaysAction(null, form({ publicId: poll.publicId, remove: [dayFromToday(9)] }));
    expect(foreign?.error).toEqual({ code: 'NOT_FOUND' });
    expect(await days(poll.id)).toEqual([dayFromToday(3), dayFromToday(4)]);
  });

  it('garde un vote arrivé juste avant un retrait', async () => {
    const { poll } = await ownPoll({ days: [dayFromToday(3), dayFromToday(4)] });
    const pollDay = await prisma.pollDay.findFirstOrThrow({ where: { pollId: poll.id, day: dayDate(dayFromToday(4)) } });
    await createResponse({ poll, days: [dayFromToday(4)] });
    const state = await changePollDaysAction(null, form({ publicId: poll.publicId, remove: [dayFromToday(4)] }));
    expect(state?.error).toMatchObject({ code: 'DAY_HAS_VOTES' });
    expect(await prisma.vote.count({ where: { pollDayId: pollDay.id } })).toBe(1);
  });

  it('enregistre les options', async () => {
    const { poll } = await ownPoll();
    await setPollOptionsAction(null, form({ publicId: poll.publicId, requireAccount: 'on', multipleRetainedDays: 'on' }));
    expect(await prisma.poll.findUniqueOrThrow({ where: { id: poll.id } })).toMatchObject({
      requireAccount: true,
      notifyOwner: false,
      multipleRetainedDays: true,
    });
  });

  it('ne revient à une seule date retenue que s’il n’en reste qu’une', async () => {
    const { poll } = await ownPoll({ status: 'CLOSED', multipleRetainedDays: true });
    await retainDays(poll, [dayFromToday(3), dayFromToday(4)]);
    const single = () => setPollOptionsAction(null, form({ publicId: poll.publicId, notifyOwner: 'on' }));
    expect((await single())?.error).toMatchObject({ code: 'VALIDATION' });
    expect((await prisma.poll.findUniqueOrThrow({ where: { id: poll.id } })).multipleRetainedDays).toBe(true);

    await setRetainedDaysAction(null, form({ publicId: poll.publicId, retainedDays: [dayFromToday(4)] }));
    expect(await single()).toMatchObject({ done: true });
    expect((await prisma.poll.findUniqueOrThrow({ where: { id: poll.id } })).multipleRetainedDays).toBe(false);
  });
});

describe('clôture', () => {
  it('clôt sans date, puis avec une date qu’on change, puis rouvre', async () => {
    const { poll } = await ownPoll();
    await closePollAction(null, form({ publicId: poll.publicId }));
    expect(await prisma.poll.findUniqueOrThrow({ where: { id: poll.id } })).toMatchObject({ status: 'CLOSED' });
    expect(await retainedDaysOf(poll.id)).toEqual([]);

    await setRetainedDaysAction(null, form({ publicId: poll.publicId, retainedDays: [dayFromToday(4)] }));
    expect(await retainedDaysOf(poll.id)).toEqual([dayFromToday(4)]);
    await setRetainedDaysAction(null, form({ publicId: poll.publicId, retainedDays: [dayFromToday(5)] }));
    expect(await retainedDaysOf(poll.id)).toEqual([dayFromToday(5)]);

    await reopenPollAction(null, form({ publicId: poll.publicId }));
    expect(await prisma.poll.findUniqueOrThrow({ where: { id: poll.id } })).toMatchObject({ status: 'OPEN', closedAt: null });
    expect(await retainedDaysOf(poll.id)).toEqual([]);
  });

  it('refuse une date retenue étrangère au sondage, ou sur un sondage ouvert', async () => {
    const { poll } = await ownPoll();
    expect((await setRetainedDaysAction(null, form({ publicId: poll.publicId, retainedDays: [dayFromToday(4)] })))?.error).toEqual({
      code: 'NOT_FOUND',
    });
    expect((await closePollAction(null, form({ publicId: poll.publicId, retainedDays: [dayFromToday(30)] })))?.error).toMatchObject({
      code: 'VALIDATION',
    });
  });

  it('refuse plusieurs dates retenues sans l’option', async () => {
    const { poll } = await ownPoll();
    const state = await closePollAction(
      null,
      form({ publicId: poll.publicId, retainedDays: [dayFromToday(3), dayFromToday(4)] }),
    );
    expect(state?.error).toMatchObject({ code: 'VALIDATION', fields: { retainedDays: expect.any(String) } });
    expect((await prisma.poll.findUniqueOrThrow({ where: { id: poll.id } })).status).toBe('OPEN');
  });

  it('clôt sur plusieurs dates, en change, puis rouvre, avec l’option', async () => {
    const { poll } = await ownPoll({ multipleRetainedDays: true });
    await closePollAction(
      null,
      form({ publicId: poll.publicId, retainedDays: [dayFromToday(5), dayFromToday(3), dayFromToday(5)] }),
    );
    expect(await retainedDaysOf(poll.id)).toEqual([dayFromToday(3), dayFromToday(5)]);

    await setRetainedDaysAction(null, form({ publicId: poll.publicId, retainedDays: [dayFromToday(3), dayFromToday(4)] }));
    expect(await retainedDaysOf(poll.id)).toEqual([dayFromToday(3), dayFromToday(4)]);
    const remove = await changePollDaysAction(null, form({ publicId: poll.publicId, remove: [dayFromToday(3)] }));
    expect(remove?.error).toMatchObject({ code: 'VALIDATION' });

    await reopenPollAction(null, form({ publicId: poll.publicId }));
    expect((await prisma.poll.findUniqueOrThrow({ where: { id: poll.id } })).status).toBe('OPEN');
    expect(await retainedDaysOf(poll.id)).toEqual([]);
  });

  it('n’applique qu’une de deux clôtures simultanées, et n’annonce qu’une fois', async () => {
    const { poll } = await ownPoll();
    const voter = await createUser({ email: 'voter@example.test' });
    await createResponse({ poll, user: voter, days: [dayFromToday(3)] });
    const [a, b] = await Promise.all([
      closePollAction(null, form({ publicId: poll.publicId, retainedDays: [dayFromToday(3)] })),
      closePollAction(null, form({ publicId: poll.publicId, retainedDays: [dayFromToday(3)] })),
    ]);
    expect([a?.done, b?.done].filter(Boolean)).toHaveLength(1);
    expect(await prisma.emailOutbox.count({ where: { template: 'RETAINED_DAY' } })).toBe(1);
  });

  it('garde un état cohérent quand clôture et réouverture se croisent', async () => {
    const { poll } = await ownPoll({ status: 'CLOSED' });
    await Promise.all([
      reopenPollAction(null, form({ publicId: poll.publicId })),
      setRetainedDaysAction(null, form({ publicId: poll.publicId, retainedDays: [dayFromToday(3)] })),
    ]);
    const after = await prisma.poll.findUniqueOrThrow({ where: { id: poll.id } });
    if (after.status === 'OPEN') expect(await retainedDaysOf(poll.id)).toEqual([]);
  });
});

describe('réponses et suppression', () => {
  it('supprime la réponse d’un participant', async () => {
    const { poll } = await ownPoll();
    const response = await createResponse({ poll, days: [dayFromToday(3)] });
    expect(await deleteResponseAction(null, form({ publicId: poll.publicId, responseId: response.id }))).toMatchObject({
      done: true,
    });
    expect(await prisma.response.count()).toBe(0);
  });

  it('supprime un sondage clos portant des votes et une date retenue, et annule ses emails en attente', async () => {
    const { poll } = await ownPoll({ status: 'CLOSED' });
    await createResponse({ poll, days: [dayFromToday(3), dayFromToday(4)] });
    await retainDays(poll, [dayFromToday(3)]);
    await prisma.emailOutbox.create({ data: { to: 'x@example.test', template: 'OWNER_DIGEST', pollId: poll.id } });

    await expect(deletePollAction(null, form({ publicId: poll.publicId }))).rejects.toThrow(TestRedirect);

    expect(await prisma.poll.count()).toBe(0);
    expect(await prisma.vote.count()).toBe(0);
    expect((await prisma.emailOutbox.findFirstOrThrow()).status).toBe('CANCELLED');
  });
});

describe('mes sondages', () => {
  it('liste les sondages du compte, plus récents d’abord, avec répondants et état', async () => {
    const owner = await createUser();
    const older = await createPoll({ owner, title: 'Ancien' });
    await prisma.poll.update({ where: { id: older.id }, data: { createdAt: new Date(Date.now() - 86_400_000) } });
    const recent = await createPoll({ owner, title: 'Récent', status: 'CLOSED' });
    await retainDays(recent, [dayFromToday(4)]);
    await createResponse({ poll: recent, days: [dayFromToday(3)] });
    await createResponse({ poll: recent, days: [dayFromToday(4)] });
    await createPoll({ title: 'Pas à moi' });

    const list = await listOwnerPolls(owner.id);
    expect(list.map((p) => p.title)).toEqual(['Récent', 'Ancien']);
    expect(list[0]).toMatchObject({ respondents: 2, status: 'CLOSED', retainedDays: [dayFromToday(4)] });
    expect(list[1]).toMatchObject({ respondents: 0, status: 'OPEN', retainedDays: [] });
  });
});
