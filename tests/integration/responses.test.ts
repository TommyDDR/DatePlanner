import { beforeEach, describe, expect, it } from 'vitest';
import { DEVICE, RATE_LIMITS, SESSION } from '@/config/limits';
import { prisma } from '@/server/db/client';
import { submitResponseAction, withdrawResponseAction } from '@/app/s/[publicId]/actions';
import { setTestHeaders, testCookies } from '../setup';
import { resetDatabase } from '../helpers/db';
import { createPoll, createSessionFor, createUser, dayFromToday } from '../helpers/factories';

/** Répondre à un sondage (FR-013 à FR-019, FR-040, SC-004). */

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

const submit = (values: Record<string, string | string[]>) => submitResponseAction(null, form(values));
const withdraw = (publicId: string) => withdrawResponseAction(null, form({ publicId }));

async function signIn(displayName = 'Camille') {
  const user = await createUser({ displayName });
  testCookies.set(SESSION.cookieName, await createSessionFor(user.id));
  return user;
}

async function votesOf(responseId: string): Promise<string[]> {
  const votes = await prisma.vote.findMany({ where: { responseId }, include: { pollDay: true } });
  return votes.map((v) => v.pollDay.day.toISOString().slice(0, 10)).sort();
}

describe('réponse sans compte', () => {
  it('enregistre le pseudo et l’empreinte de l’appareil', async () => {
    const poll = await createPoll();
    const result = await submit({ publicId: poll.publicId, pseudonym: '  Léa ', days: [dayFromToday(3), dayFromToday(4)] });
    expect(result).toMatchObject({ done: true });
    const response = await prisma.response.findFirstOrThrow();
    expect(response).toMatchObject({ pseudonym: 'Léa', userId: null });
    expect(response.deviceTokenHash).toMatch(/^[0-9a-f]{64}$/);
    expect(await votesOf(response.id)).toEqual([dayFromToday(3), dayFromToday(4)]);
  });

  it('met à jour la réponse du même appareil au lieu d’en créer une seconde', async () => {
    const poll = await createPoll();
    await submit({ publicId: poll.publicId, pseudonym: 'Léa', days: [dayFromToday(3)] });
    await submit({ publicId: poll.publicId, pseudonym: 'Léa B.', days: [dayFromToday(5)] });
    const responses = await prisma.response.findMany();
    expect(responses).toHaveLength(1);
    expect(responses[0]!.pseudonym).toBe('Léa B.');
    expect(await votesOf(responses[0]!.id)).toEqual([dayFromToday(5)]);
  });

  it('exige un pseudo qui ne soit pas fait d’espaces', async () => {
    const poll = await createPoll();
    const result = await submit({ publicId: poll.publicId, pseudonym: '   ', days: [dayFromToday(3)] });
    expect(result?.error).toMatchObject({ code: 'VALIDATION', fields: { pseudonym: 'Indiquez votre nom ou un pseudo.' } });
    expect(await prisma.response.count()).toBe(0);
  });

  it('refuse sans compte un sondage qui l’exige', async () => {
    const poll = await createPoll({ requireAccount: true });
    const result = await submit({ publicId: poll.publicId, pseudonym: 'Léa', days: [dayFromToday(3)] });
    expect(result?.error).toEqual({ code: 'ACCOUNT_REQUIRED' });
    expect(await prisma.response.count()).toBe(0);
  });

  it('laisse retirer une réponse sans compte même quand le compte est devenu exigé', async () => {
    const poll = await createPoll();
    await submit({ publicId: poll.publicId, pseudonym: 'Léa', days: [dayFromToday(3)] });
    await prisma.poll.update({ where: { id: poll.id }, data: { requireAccount: true } });
    expect(await withdraw(poll.publicId)).toMatchObject({ done: true });
    expect(await prisma.response.count()).toBe(0);
  });
});

describe('réponse connectée', () => {
  it('répond sous le nom du compte, sans pseudo', async () => {
    const user = await signIn('Camille');
    const poll = await createPoll();
    await submit({ publicId: poll.publicId, pseudonym: 'Autre nom', days: [dayFromToday(4)] });
    const response = await prisma.response.findFirstOrThrow();
    expect(response).toMatchObject({ userId: user.id, pseudonym: null, deviceTokenHash: null });
    expect(testCookies.get(DEVICE.cookieName)).toBeUndefined();
  });

  it('ignore la réponse anonyme de l’appareil, et la retrouve après déconnexion', async () => {
    const poll = await createPoll();
    await submit({ publicId: poll.publicId, pseudonym: 'Léa', days: [dayFromToday(3)] });
    const device = testCookies.get(DEVICE.cookieName)!;

    const user = await signIn();
    testCookies.set(DEVICE.cookieName, device);
    // Retirer sous son compte : il n'a pas de réponse, l'anonyme reste intacte.
    expect((await withdraw(poll.publicId))?.error).toEqual({ code: 'NOT_FOUND' });
    // Répondre sous son compte crée une SECONDE réponse.
    await submit({ publicId: poll.publicId, days: [dayFromToday(5)] });
    expect(await prisma.response.count()).toBe(2);
    expect(await prisma.response.count({ where: { userId: user.id } })).toBe(1);

    // Déconnecté, l'appareil retrouve sa réponse anonyme et peut la modifier.
    testCookies.clear();
    testCookies.set(DEVICE.cookieName, device);
    await submit({ publicId: poll.publicId, pseudonym: 'Léa', days: [dayFromToday(4)] });
    const anonymous = await prisma.response.findFirstOrThrow({ where: { userId: null } });
    expect(await votesOf(anonymous.id)).toEqual([dayFromToday(4)]);
  });
});

describe('ce que le serveur refuse (FR-016, SC-004)', () => {
  it('refuse en entier une réponse forgée avec un jour non proposé', async () => {
    const poll = await createPoll({ days: [dayFromToday(3), dayFromToday(4)] });
    const result = await submit({ publicId: poll.publicId, pseudonym: 'Léa', days: [dayFromToday(3), dayFromToday(9)] });
    expect(result?.error).toMatchObject({ code: 'VALIDATION', fields: { days: expect.any(String) } });
    expect(await prisma.response.count()).toBe(0);
    expect(await prisma.vote.count()).toBe(0);
  });

  it('refuse un jour proposé mais passé', async () => {
    const poll = await createPoll({ days: [dayFromToday(-2), dayFromToday(3)] });
    const result = await submit({ publicId: poll.publicId, pseudonym: 'Léa', days: [dayFromToday(-2)] });
    expect(result?.error).toMatchObject({ code: 'VALIDATION' });
  });

  it('exige au moins un jour', async () => {
    const poll = await createPoll();
    const result = await submit({ publicId: poll.publicId, pseudonym: 'Léa', days: [] });
    expect(result?.error).toMatchObject({ code: 'VALIDATION', fields: { days: 'Choisissez au moins un jour.' } });
  });

  it('refuse sur un sondage clos, réponse comme retrait', async () => {
    const poll = await createPoll();
    await submit({ publicId: poll.publicId, pseudonym: 'Léa', days: [dayFromToday(3)] });
    await prisma.poll.update({ where: { id: poll.id }, data: { status: 'CLOSED' } });
    expect((await submit({ publicId: poll.publicId, pseudonym: 'Léa', days: [dayFromToday(4)] }))?.error).toEqual({
      code: 'POLL_CLOSED',
    });
    expect((await withdraw(poll.publicId))?.error).toEqual({ code: 'POLL_CLOSED' });
  });

  it('répond « introuvable » à un sondage inconnu', async () => {
    expect((await submit({ publicId: 'a'.repeat(22), pseudonym: 'Léa', days: [dayFromToday(3)] }))?.error).toEqual({
      code: 'NOT_FOUND',
    });
  });

  it('ne retire que la réponse de son auteur', async () => {
    const poll = await createPoll();
    await submit({ publicId: poll.publicId, pseudonym: 'Léa', days: [dayFromToday(3)] });
    testCookies.newBrowser();
    expect((await withdraw(poll.publicId))?.error).toEqual({ code: 'NOT_FOUND' });
    expect(await prisma.response.count()).toBe(1);
  });

  it('ne crée qu’une réponse pour deux soumissions simultanées du même appareil', async () => {
    const poll = await createPoll();
    await submit({ publicId: poll.publicId, pseudonym: 'Léa', days: [dayFromToday(3)] });
    await prisma.response.deleteMany();
    await Promise.all([
      submit({ publicId: poll.publicId, pseudonym: 'Léa', days: [dayFromToday(3)] }),
      submit({ publicId: poll.publicId, pseudonym: 'Léa', days: [dayFromToday(4)] }),
    ]);
    expect(await prisma.response.count()).toBe(1);
  });

  it('borne les réponses par adresse sur un même sondage', async () => {
    const poll = await createPoll();
    for (let i = 0; i < RATE_LIMITS.responsePerPollIp.limit; i++) {
      testCookies.newBrowser();
      await submit({ publicId: poll.publicId, pseudonym: `P${i}`, days: [dayFromToday(3)] });
    }
    testCookies.newBrowser();
    const refused = await submit({ publicId: poll.publicId, pseudonym: 'de trop', days: [dayFromToday(3)] });
    expect(refused?.error).toMatchObject({ code: 'RATE_LIMITED' });
  });
});
