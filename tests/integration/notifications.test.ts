import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SESSION } from '@/config/limits';
import { prisma } from '@/server/db/client';
import { closePollAction, setRetainedDayAction, submitResponseAction, withdrawResponseAction } from '@/app/s/[publicId]/actions';
import { disableOwnerDigestAction } from '@/app/notifications/resume/desactiver/actions';
import { POST as oneClickUnsubscribe } from '@/app/api/notifications/resume/desactiver/route';
import { signLink } from '@/lib/signed-link';
import { composeEmail } from '@/server/notifications/compose';
import { deliver } from '@/server/notifications/outbox';
import { setTestHeaders, testCookies } from '../setup';
import { resetDatabase } from '../helpers/db';
import { createPoll, createResponse, createSessionFor, createUser, dayFromToday } from '../helpers/factories';

/** Résumé au créateur et annonce de la date retenue (FR-041 à FR-043). */

beforeEach(async () => {
  await resetDatabase();
  testCookies.clear();
  setTestHeaders({ 'x-real-ip': '203.0.113.7' });
  vi.spyOn(console, 'info').mockImplementation(() => undefined);
});

afterEach(() => {
  vi.restoreAllMocks();
});

function form(values: Record<string, string | string[]>): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(values)) {
    for (const item of Array.isArray(value) ? value : [value]) data.append(key, item);
  }
  return data;
}

async function answer(publicId: string, pseudonym: string, day = dayFromToday(3)) {
  testCookies.newBrowser();
  return submitResponseAction(null, form({ publicId, pseudonym, days: [day] }));
}

async function pendingDigest(pollId: string) {
  return prisma.emailOutbox.findFirst({ where: { pollId, template: 'OWNER_DIGEST', status: 'PENDING' } });
}

describe('résumé au créateur', () => {
  it('regroupe cinq réponses en un seul résumé, programmé quinze minutes après la première', async () => {
    const owner = await createUser({ email: 'proprio@example.test' });
    const poll = await createPoll({ owner });
    const before = Date.now();
    for (const name of ['Léa', 'Noé', 'Zoé', 'Émile', 'Inès']) await answer(poll.publicId, name);

    const digests = await prisma.emailOutbox.findMany({ where: { template: 'OWNER_DIGEST' } });
    expect(digests).toHaveLength(1);
    expect(digests[0]!.to).toBe('proprio@example.test');
    const delay = digests[0]!.sendAfter.getTime() - before;
    expect(delay).toBeGreaterThanOrEqual(15 * 60_000 - 1000);
    expect(delay).toBeLessThan(16 * 60_000);

    const email = await composeEmail(digests[0]!);
    expect(email?.subject).toBe(`5 nouvelles réponses à « ${poll.title} »`);
    for (const name of ['Léa', 'Noé', 'Zoé', 'Émile', 'Inès']) expect(email?.text).toContain(name);
  });

  it('n’annonce pas une réponse retirée avant l’envoi', async () => {
    const poll = await createPoll();
    await answer(poll.publicId, 'Léa');
    await withdrawResponseAction(null, form({ publicId: poll.publicId }));
    const digest = await pendingDigest(poll.id);
    await prisma.emailOutbox.update({ where: { id: digest!.id }, data: { sendAfter: new Date(Date.now() - 1000) } });
    expect(await deliver(digest!.id)).toBe(false);
    expect((await prisma.emailOutbox.findUniqueOrThrow({ where: { id: digest!.id } })).status).toBe('CANCELLED');
  });

  it('avance le curseur après l’envoi : le résumé suivant ne répète rien', async () => {
    const poll = await createPoll();
    await answer(poll.publicId, 'Léa');
    const first = await pendingDigest(poll.id);
    await prisma.emailOutbox.update({ where: { id: first!.id }, data: { sendAfter: new Date(Date.now() - 1000) } });
    expect(await deliver(first!.id)).toBe(true);

    await answer(poll.publicId, 'Noé');
    const second = await pendingDigest(poll.id);
    // Trente minutes après le premier envoi.
    expect(second!.sendAfter.getTime()).toBeGreaterThan(Date.now() + 25 * 60_000);
    const email = await composeEmail(second!);
    expect(email?.text).toContain('Noé');
    expect(email?.text).not.toContain('Léa');
  });

  it('ne programme rien quand le créateur l’a désactivé', async () => {
    const poll = await createPoll({ notifyOwner: false });
    await answer(poll.publicId, 'Léa');
    expect(await prisma.emailOutbox.count()).toBe(0);
  });

  it('ne programme rien quand le créateur répond lui-même', async () => {
    const owner = await createUser();
    const poll = await createPoll({ owner });
    testCookies.set(SESSION.cookieName, await createSessionFor(owner.id));
    await submitResponseAction(null, form({ publicId: poll.publicId, days: [dayFromToday(3)] }));
    expect(await prisma.response.count({ where: { pollId: poll.id, userId: owner.id } })).toBe(1);
    expect(await prisma.emailOutbox.count()).toBe(0);
  });

  it('ne cite pas la réponse du créateur dans le résumé déclenché par un autre', async () => {
    const owner = await createUser({ displayName: 'Proprio' });
    const poll = await createPoll({ owner });
    await createResponse({ poll, user: owner, days: [dayFromToday(3)] });
    await answer(poll.publicId, 'Léa');
    const email = await composeEmail((await pendingDigest(poll.id))!);
    expect(email?.subject).toBe(`1 nouvelle réponse à « ${poll.title} »`);
    expect(email?.text).toContain('Léa');
    expect(email?.text).not.toContain('Proprio');
  });

  it('ne programme rien pour une simple mise à jour', async () => {
    const poll = await createPoll();
    await answer(poll.publicId, 'Léa');
    await prisma.emailOutbox.deleteMany();
    await submitResponseAction(null, form({ publicId: poll.publicId, pseudonym: 'Léa', days: [dayFromToday(4)] }));
    expect(await prisma.emailOutbox.count()).toBe(0);
  });

  it('porte un lien de désactivation et les en-têtes de désinscription en un clic', async () => {
    const poll = await createPoll();
    await answer(poll.publicId, 'Léa');
    const email = await composeEmail((await pendingDigest(poll.id))!);
    expect(email?.headers?.['List-Unsubscribe']).toMatch(/^<https?:\/\/.+\/api\/notifications\/resume\/desactiver\?t=.+>$/);
    expect(email?.headers?.['List-Unsubscribe-Post']).toBe('List-Unsubscribe=One-Click');
    expect(email?.text).toContain('/notifications/resume/desactiver?t=');
  });

  it('échappe dans la branche HTML ce qui a été saisi', async () => {
    const poll = await createPoll({ title: '<b>Fête</b>' });
    await answer(poll.publicId, '<img src=x onerror=alert(1)>');
    const email = await composeEmail((await pendingDigest(poll.id))!);
    expect(email?.html).not.toContain('<img src=x');
    expect(email?.html).toContain('&lt;img src=x onerror=alert(1)&gt;');
    expect(email?.html).not.toContain('<b>Fête</b>');
  });
});

describe('désactivation du résumé', () => {
  it('désactive par un lien signé valable, et annule le résumé en attente', async () => {
    const poll = await createPoll();
    await answer(poll.publicId, 'Léa');
    expect(await disableOwnerDigestAction(null, form({ token: signLink('owner-digest', poll.id) }))).toMatchObject({ done: true });
    expect(await prisma.poll.findUniqueOrThrow({ where: { id: poll.id } })).toMatchObject({ notifyOwner: false });
    expect(await pendingDigest(poll.id)).toBeNull();
  });

  it('refuse un lien altéré', async () => {
    const poll = await createPoll();
    const state = await disableOwnerDigestAction(null, form({ token: `${poll.id}.faux` }));
    expect(state?.error).toEqual({ code: 'NOT_FOUND' });
    expect((await prisma.poll.findUniqueOrThrow({ where: { id: poll.id } })).notifyOwner).toBe(true);
  });

  it('accepte la désinscription en un clic, et répond 200 même à un lien faux', async () => {
    const poll = await createPoll();
    const token = encodeURIComponent(signLink('owner-digest', poll.id));
    const ok = await oneClickUnsubscribe(new Request(`http://localhost/api/notifications/resume/desactiver?t=${token}`, { method: 'POST' }));
    expect(ok.status).toBe(200);
    expect((await prisma.poll.findUniqueOrThrow({ where: { id: poll.id } })).notifyOwner).toBe(false);
    const bad = await oneClickUnsubscribe(new Request('http://localhost/api/notifications/resume/desactiver?t=nimp', { method: 'POST' }));
    expect(bad.status).toBe(200);
  });
});

describe('annonce de la date retenue', () => {
  it('prévient les seuls répondants connectés, une fois chacun, créateur exclu', async () => {
    const owner = await createUser({ email: 'proprio@example.test' });
    const poll = await createPoll({ owner });
    const lea = await createUser({ email: 'lea@example.test' });
    const noe = await createUser({ email: 'noe@example.test' });
    await createResponse({ poll, user: lea, days: [dayFromToday(3)] });
    await createResponse({ poll, user: noe, days: [dayFromToday(3)] });
    await createResponse({ poll, user: owner, days: [dayFromToday(3)] });
    await createResponse({ poll, pseudonym: 'Anonyme', days: [dayFromToday(3)] });

    testCookies.clear();
    testCookies.set(SESSION.cookieName, await createSessionFor(owner.id));
    await closePollAction(null, form({ publicId: poll.publicId, retainedDay: dayFromToday(3) }));

    const announcements = await prisma.emailOutbox.findMany({ where: { template: 'RETAINED_DAY' }, orderBy: { to: 'asc' } });
    expect(announcements.map((e) => e.to)).toEqual(['lea@example.test', 'noe@example.test']);
    const email = await composeEmail(announcements[0]!);
    expect(email?.subject).toContain(`Date retenue pour « ${poll.title} »`);

    // Changer la date annonce la nouvelle ; la remettre à l'identique, non.
    await setRetainedDayAction(null, form({ publicId: poll.publicId, retainedDay: dayFromToday(4) }));
    expect(await prisma.emailOutbox.count({ where: { template: 'RETAINED_DAY' } })).toBe(4);
    await setRetainedDayAction(null, form({ publicId: poll.publicId, retainedDay: dayFromToday(4) }));
    expect(await prisma.emailOutbox.count({ where: { template: 'RETAINED_DAY' } })).toBe(4);
  });

  it('n’envoie pas une annonce devenue fausse : sondage rouvert entre-temps', async () => {
    const owner = await createUser();
    const poll = await createPoll({ owner });
    await createResponse({ poll, user: await createUser({ email: 'lea@example.test' }), days: [dayFromToday(3)] });
    testCookies.set(SESSION.cookieName, await createSessionFor(owner.id));
    await closePollAction(null, form({ publicId: poll.publicId, retainedDay: dayFromToday(3) }));
    await prisma.poll.update({ where: { id: poll.id }, data: { status: 'OPEN', retainedDayId: null } });
    const announcement = await prisma.emailOutbox.findFirstOrThrow({ where: { template: 'RETAINED_DAY' } });
    expect(await composeEmail(announcement)).toBeNull();
  });
});
