import { beforeEach, describe, expect, it } from 'vitest';
import { SESSION } from '@/config/limits';
import { prisma } from '@/server/db/client';
import {
  createSession,
  destroyAllSessions,
  destroyOtherSessions,
  destroySession,
  getSessionUser,
  hashToken,
  purgeExpiredSessions,
} from '@/server/auth/session';
import { testCookies } from '../setup';
import { resetDatabase } from '../helpers/db';
import { createUser } from '../helpers/factories';

beforeEach(async () => {
  await resetDatabase();
  testCookies.clear();
});

describe('sessions', () => {
  it('pose le cookie et ne stocke que l’empreinte du jeton', async () => {
    const user = await createUser({ passwordHash: 'x' });
    await createSession(user.id);

    const token = testCookies.get(SESSION.cookieName)!;
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    const stored = await prisma.session.findFirstOrThrow();
    expect(stored.tokenHash).toBe(hashToken(token));
    expect(stored.tokenHash).not.toContain(token);
    expect(testCookies.options(SESSION.cookieName)).toMatchObject({ httpOnly: true, sameSite: 'lax', path: '/' });
  });

  it('relit l’utilisateur de la session', async () => {
    const user = await createUser({ displayName: 'Léa', passwordHash: 'x' });
    await createSession(user.id);
    expect(await getSessionUser()).toMatchObject({ id: user.id, displayName: 'Léa', hasPassword: true });
  });

  it('dit qu’un compte né de Google n’a pas de mot de passe', async () => {
    const user = await createUser({ passwordHash: null });
    await createSession(user.id);
    expect((await getSessionUser())?.hasPassword).toBe(false);
  });

  it('refuse une session expirée et la supprime', async () => {
    const user = await createUser();
    await createSession(user.id);
    await prisma.session.updateMany({ data: { expiresAt: new Date(Date.now() - 1000) } });
    expect(await getSessionUser()).toBeNull();
    expect(await prisma.session.count()).toBe(0);
  });

  it('refuse une session au-delà du plafond absolu, même prolongée', async () => {
    const user = await createUser();
    await createSession(user.id);
    await prisma.session.updateMany({
      data: {
        createdAt: new Date(Date.now() - 91 * 24 * 3600 * 1000),
        expiresAt: new Date(Date.now() + 24 * 3600 * 1000),
      },
    });
    expect(await getSessionUser()).toBeNull();
  });

  it('renouvelle l’activité du compte et annule un avertissement d’inactivité', async () => {
    const user = await createUser({ lastActiveAt: new Date(Date.now() - 3 * 24 * 3600 * 1000) });
    await prisma.user.update({ where: { id: user.id }, data: { inactivityWarnedAt: new Date() } });
    await createSession(user.id);
    await getSessionUser();
    const after = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(Date.now() - after.lastActiveAt.getTime()).toBeLessThan(60_000);
    expect(after.inactivityWarnedAt).toBeNull();
  });

  it('se ferme, et ferme les autres appareils sur demande', async () => {
    const user = await createUser();
    await createSession(user.id);
    testCookies.newBrowser();
    await createSession(user.id);
    expect(await prisma.session.count()).toBe(2);

    await destroyOtherSessions(user.id);
    expect(await prisma.session.count()).toBe(1);
    expect(await getSessionUser()).not.toBeNull();

    await destroySession();
    expect(await getSessionUser()).toBeNull();
    expect(testCookies.get(SESSION.cookieName)).toBeUndefined();
  });

  it('ferme toutes les sessions d’un compte', async () => {
    const user = await createUser();
    await createSession(user.id);
    testCookies.newBrowser();
    await createSession(user.id);
    await destroyAllSessions(user.id);
    expect(await prisma.session.count()).toBe(0);
  });

  it('purge les sessions expirées', async () => {
    const user = await createUser();
    await createSession(user.id);
    await prisma.session.updateMany({ data: { expiresAt: new Date(Date.now() - 1000) } });
    expect(await purgeExpiredSessions()).toBe(1);
  });
});
