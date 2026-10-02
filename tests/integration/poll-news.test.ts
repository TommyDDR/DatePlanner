import { beforeEach, describe, expect, it } from 'vitest';
import { SESSION } from '@/config/limits';
import { prisma } from '@/server/db/client';
import { createPollAction } from '@/app/nouveau/actions';
import {
  changePollDaysAction,
  closePollAction,
  deleteResponseAction,
  markPollSeenAction,
  reopenPollAction,
  setPollOptionsAction,
  submitResponseAction,
  updatePollDetailsAction,
  withdrawResponseAction,
} from '@/app/s/[publicId]/actions';
import { getPollByPublicId, listOwnerPolls, listRespondedPolls } from '@/server/polls/read';
import { setTestHeaders, testCookies, TestRedirect } from '../setup';
import { resetDatabase } from '../helpers/db';
import { createPoll, createResponse, createSessionFor, createUser, dayFromToday, retainDays } from '../helpers/factories';

/** « Mes sondages » : ceux auxquels on a répondu, et ce qui a changé depuis la dernière visite (FR-024, FR-044). */

beforeEach(async () => {
  await resetDatabase();
  testCookies.clear();
  setTestHeaders({ 'x-real-ip': '203.0.113.7' });
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

/** Le sondage de Proprio, déjà vu par lui. */
async function seenPoll() {
  const owner = await createUser({ displayName: 'Proprio' });
  const poll = await createPoll({ owner });
  await prisma.poll.update({ where: { id: poll.id }, data: { ownerSeenAt: poll.activityAt } });
  return { owner, poll };
}

/** `user` répond à `publicId` avec son compte. */
async function respond(user: { id: string }, publicId: string, days = [dayFromToday(3)]) {
  await signIn(user);
  expect(await submitResponseAction(null, form({ publicId, days }))).toMatchObject({ done: true });
}

/** `user` ouvre la page du sondage : elle affiche sa version courante. */
async function view(user: { id: string }, publicId: string) {
  await signIn(user);
  const poll = await getPollByPublicId(publicId);
  await markPollSeenAction(publicId, poll!.activityAt.toISOString());
}

/** « Du nouveau » sur ce sondage, dans le « Mes sondages » de `user`. */
async function news(user: { id: string }, publicId: string): Promise<boolean> {
  const rows = [...(await listOwnerPolls(user.id)), ...(await listRespondedPolls(user.id))];
  const row = rows.find((r) => r.publicId === publicId);
  if (!row) throw new Error('Sondage absent de « Mes sondages ».');
  return row.news;
}

describe('auxquels j’ai répondu', () => {
  it('liste les sondages d’autres comptes où le compte a répondu, sa réponse la plus récente d’abord', async () => {
    const me = await createUser();
    const alice = await createUser({ displayName: 'Alice' });
    const first = await createPoll({ owner: alice, title: 'Premier', status: 'CLOSED' });
    await retainDays(first, [dayFromToday(3)]);
    const second = await createPoll({ owner: alice, title: 'Second' });
    const mine = await createPoll({ owner: me, title: 'Le mien' });
    const other = await createPoll({ owner: alice, title: 'Sans moi' });

    const older = await createResponse({ poll: first, days: [dayFromToday(3)], user: me });
    await prisma.response.update({ where: { id: older.id }, data: { createdAt: new Date(Date.now() - 86_400_000) } });
    await createResponse({ poll: first, days: [dayFromToday(4)] });
    await createResponse({ poll: second, days: [dayFromToday(3)], user: me });
    await createResponse({ poll: mine, days: [dayFromToday(3)], user: me });
    await createResponse({ poll: other, days: [dayFromToday(3)] });

    const list = await listRespondedPolls(me.id);
    expect(list.map((p) => p.title)).toEqual(['Second', 'Premier']);
    expect(list[1]).toMatchObject({ ownerName: 'Alice', respondents: 2, status: 'CLOSED', retainedDays: [dayFromToday(3)] });
    expect(list[0]).toMatchObject({ ownerName: 'Alice', respondents: 1, status: 'OPEN', retainedDays: [] });
  });

  it('ignore une réponse donnée sans compte', async () => {
    const me = await createUser();
    const { poll } = await seenPoll();
    await submitResponseAction(null, form({ publicId: poll.publicId, pseudonym: 'Moi', days: [dayFromToday(3)] }));
    expect(await listRespondedPolls(me.id)).toEqual([]);
    expect((await prisma.response.findFirstOrThrow()).seenAt).toBeNull();
  });
});

describe('du nouveau', () => {
  it('rien de nouveau sur un sondage qu’on vient de créer', async () => {
    const owner = await createUser();
    await signIn(owner);
    await expect(
      createPollAction(null, form({ title: 'Pique-nique', days: [dayFromToday(3)] })),
    ).rejects.toBeInstanceOf(TestRedirect);
    const [poll] = await listOwnerPolls(owner.id);
    expect(poll!.news).toBe(false);
  });

  it('une réponse est du nouveau pour le créateur et les autres répondants, pas pour son auteur', async () => {
    const { owner, poll } = await seenPoll();
    const bob = await createUser({ displayName: 'Bob' });
    const carla = await createUser({ displayName: 'Carla' });

    await respond(bob, poll.publicId);
    expect(await news(owner, poll.publicId)).toBe(true);
    expect(await news(bob, poll.publicId)).toBe(false);

    await view(owner, poll.publicId);
    await respond(carla, poll.publicId);
    expect(await news(owner, poll.publicId)).toBe(true);
    expect(await news(bob, poll.publicId)).toBe(true);
    expect(await news(carla, poll.publicId)).toBe(false);

    // Modifier sa réponse aussi.
    await view(bob, poll.publicId);
    await respond(carla, poll.publicId, [dayFromToday(4)]);
    expect(await news(bob, poll.publicId)).toBe(true);
  });

  it('la page affichée efface le nouveau ; une version plus ancienne, non', async () => {
    const { owner, poll } = await seenPoll();
    const before = (await getPollByPublicId(poll.publicId))!.activityAt.toISOString();
    await respond(await createUser(), poll.publicId);

    await signIn(owner);
    await markPollSeenAction(poll.publicId, before);
    expect(await news(owner, poll.publicId)).toBe(true);

    await view(owner, poll.publicId);
    expect(await news(owner, poll.publicId)).toBe(false);
  });

  it('une version à venir ne masque pas le changement suivant', async () => {
    const { owner, poll } = await seenPoll();
    await signIn(owner);
    await markPollSeenAction(poll.publicId, '2100-01-01T00:00:00.000Z');
    await respond(await createUser(), poll.publicId);
    expect(await news(owner, poll.publicId)).toBe(true);
  });

  it('les changements du créateur sont du nouveau pour les répondants, ses options non', async () => {
    const { owner, poll } = await seenPoll();
    const bob = await createUser();
    const carla = await createUser();
    await respond(carla, poll.publicId);
    await respond(bob, poll.publicId);
    await view(owner, poll.publicId);
    const id = poll.publicId;
    const response = await prisma.response.findFirstOrThrow({ where: { userId: carla.id } });

    const changes = [
      () => updatePollDetailsAction(null, form({ publicId: id, title: 'Nouveau titre' })),
      () => changePollDaysAction(null, form({ publicId: id, add: [dayFromToday(9)] })),
      () => closePollAction(null, form({ publicId: id, retainedDays: [dayFromToday(3)] })),
      () => reopenPollAction(null, form({ publicId: id })),
      () => deleteResponseAction(null, form({ publicId: id, responseId: response.id })),
    ];
    for (const change of changes) {
      await view(bob, id);
      await signIn(owner);
      expect(await change()).toMatchObject({ done: true });
      expect(await news(bob, id)).toBe(true);
      expect(await news(owner, id)).toBe(false);
    }

    await view(bob, id);
    await signIn(owner);
    expect(await setPollOptionsAction(null, form({ publicId: id, requireAccount: 'on' }))).toMatchObject({ done: true });
    expect(await news(bob, id)).toBe(false);
  });

  it('retirer sa réponse est du nouveau pour les autres', async () => {
    const { owner, poll } = await seenPoll();
    const bob = await createUser();
    const carla = await createUser();
    await respond(bob, poll.publicId);
    await respond(carla, poll.publicId);
    await view(owner, poll.publicId);
    await view(bob, poll.publicId);

    await signIn(carla);
    expect(await withdrawResponseAction(null, form({ publicId: poll.publicId }))).toMatchObject({ done: true });
    expect(await news(bob, poll.publicId)).toBe(true);
    expect(await news(owner, poll.publicId)).toBe(true);
    expect(await listRespondedPolls(carla.id)).toEqual([]);
  });

  it('seuls le créateur et les répondants connectés gardent une version vue', async () => {
    const { poll } = await seenPoll();
    await respond(await createUser(), poll.publicId);
    const snapshot = async () => ({
      poll: await prisma.poll.findUniqueOrThrow({ where: { id: poll.id }, select: { ownerSeenAt: true } }),
      responses: await prisma.response.findMany({ select: { id: true, seenAt: true }, orderBy: { id: 'asc' } }),
    });
    const before = await snapshot();
    const version = (await getPollByPublicId(poll.publicId))!.activityAt.toISOString();

    await signIn(await createUser());
    await markPollSeenAction(poll.publicId, version);
    testCookies.clear();
    await markPollSeenAction(poll.publicId, version);
    expect(await snapshot()).toEqual(before);
  });

  it('ignore une version ou un sondage mal formés', async () => {
    const { owner, poll } = await seenPoll();
    await respond(await createUser(), poll.publicId);
    await signIn(owner);
    await markPollSeenAction(poll.publicId, 'hier');
    await markPollSeenAction('pas-un-sondage', new Date().toISOString());
    expect(await news(owner, poll.publicId)).toBe(true);
  });
});
