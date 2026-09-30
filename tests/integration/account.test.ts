import { beforeEach, describe, expect, it } from 'vitest';
import { SESSION } from '@/config/limits';
import { prisma } from '@/server/db/client';
import { deleteAccountAction, updateDisplayNameAction } from '@/app/compte/actions';
import { hashPassword } from '@/server/auth/password';
import { testCookies, TestRedirect } from '../setup';
import { resetDatabase } from '../helpers/db';
import { createPoll, createResponse, createSessionFor, createUser, dayFromToday } from '../helpers/factories';

/** Le compte : nom d'affichage et suppression (FR-006). */

const PASSWORD = 'Mot-de-passe-9';

beforeEach(async () => {
  await resetDatabase();
  testCookies.clear();
});

function form(values: Record<string, string>): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(values)) data.append(key, value);
  return data;
}

async function signIn(user: { id: string }) {
  testCookies.set(SESSION.cookieName, await createSessionFor(user.id));
}

describe('nom d’affichage', () => {
  it('se modifie, dans ses bornes', async () => {
    const user = await createUser({ displayName: 'Ancien' });
    await signIn(user);
    expect(await updateDisplayNameAction(null, form({ displayName: '  Camille  ' }))).toMatchObject({ done: true });
    expect((await prisma.user.findUniqueOrThrow({ where: { id: user.id } })).displayName).toBe('Camille');
    expect((await updateDisplayNameAction(null, form({ displayName: ' ' })))?.error).toMatchObject({ code: 'VALIDATION' });
  });
});

describe('suppression du compte', () => {
  it('emporte ses sondages et ses réponses, et laisse les autres réponses des sondages d’autrui', async () => {
    const user = await createUser({ passwordHash: await hashPassword(PASSWORD) });
    const own = await createPoll({ owner: user });
    await createResponse({ poll: own, days: [dayFromToday(3)] });
    const others = await createPoll();
    await createResponse({ poll: others, user, days: [dayFromToday(3)] });
    await createResponse({ poll: others, pseudonym: 'Léa', days: [dayFromToday(4)] });
    await signIn(user);

    await expect(deleteAccountAction(null, form({ password: PASSWORD }))).rejects.toThrow(TestRedirect);

    expect(await prisma.user.findUnique({ where: { id: user.id } })).toBeNull();
    expect(await prisma.poll.findUnique({ where: { id: own.id } })).toBeNull();
    expect(await prisma.session.count({ where: { userId: user.id } })).toBe(0);
    const remaining = await prisma.response.findMany({ where: { pollId: others.id } });
    expect(remaining.map((r) => r.pseudonym)).toEqual(['Léa']);
    expect(testCookies.get(SESSION.cookieName)).toBeUndefined();
  });

  it('exige le mot de passe d’un compte qui en a un', async () => {
    const user = await createUser({ passwordHash: await hashPassword(PASSWORD) });
    await signIn(user);
    expect((await deleteAccountAction(null, form({ password: 'Faux-mot-9' })))?.error).toEqual({ code: 'AUTH_FAILED' });
    expect(await prisma.user.findUnique({ where: { id: user.id } })).not.toBeNull();
  });

  it('exige une connexion récente d’un compte sans mot de passe', async () => {
    const user = await createUser({ passwordHash: null, googleId: 'g-1' });
    await signIn(user);
    await prisma.session.updateMany({ data: { createdAt: new Date(Date.now() - 11 * 60_000) } });
    expect((await deleteAccountAction(null, form({})))?.error).toEqual({ code: 'REAUTH_REQUIRED' });

    await prisma.session.updateMany({ data: { createdAt: new Date() } });
    await expect(deleteAccountAction(null, form({}))).rejects.toThrow(TestRedirect);
    expect(await prisma.user.findUnique({ where: { id: user.id } })).toBeNull();
  });

  it('ne supprime rien sans session', async () => {
    const user = await createUser();
    expect((await deleteAccountAction(null, form({ password: PASSWORD })))?.error).toEqual({ code: 'NOT_FOUND' });
    expect(await prisma.user.findUnique({ where: { id: user.id } })).not.toBeNull();
  });
});
