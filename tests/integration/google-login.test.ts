import { beforeEach, describe, expect, it } from 'vitest';
import { LOGIN_LOCK, RATE_LIMITS, SESSION } from '@/config/limits';
import { prisma } from '@/server/db/client';
import type { GoogleIdentity } from '@/server/auth/google';
import { hashPassword } from '@/server/auth/password';
import { login, loginWithGoogle } from '@/server/auth/service';
import { getSessionUser } from '@/server/auth/session';
import { testCookies } from '../setup';
import { resetDatabase } from '../helpers/db';
import { createSessionFor, createUser } from '../helpers/factories';

/** Ouvrir une session par une identité Google (FR-003, research.md R5). */

const IP = '203.0.113.42';
const PASSWORD = 'Mot-de-passe-9';

function identity(overrides: Partial<GoogleIdentity> = {}): GoogleIdentity {
  return { googleId: 'google-sub-1', email: 'claire@example.test', displayName: 'Claire Martin', ...overrides };
}

beforeEach(async () => {
  await resetDatabase();
  testCookies.clear();
});

describe('loginWithGoogle', () => {
  it('crée un compte sans mot de passe, adresse prouvée, et ouvre la session', async () => {
    const result = await loginWithGoogle(identity(), IP);
    expect(result.ok).toBe(true);
    const user = await prisma.user.findUniqueOrThrow({
      where: { email: 'claire@example.test' },
      select: { passwordHash: true, googleId: true, displayName: true, emailProvedAt: true },
    });
    expect(user).toMatchObject({ passwordHash: null, googleId: 'google-sub-1', displayName: 'Claire Martin' });
    expect(user.emailProvedAt).not.toBeNull();
    expect((await getSessionUser())?.email).toBe('claire@example.test');
  });

  it('reconnaît à l’IDENTIFIANT, même si l’adresse a changé chez Google', async () => {
    const user = await createUser({ email: 'ancienne@example.test', googleId: 'google-sub-1' });
    const result = await loginWithGoogle(identity({ email: 'nouvelle@example.test' }), IP);
    expect(result).toEqual({ ok: true, data: { userId: user.id } });
    expect(await prisma.user.count()).toBe(1);
  });

  it('rattache un compte local à l’adresse PROUVÉE, mot de passe gardé', async () => {
    const user = await createUser({
      email: 'claire@example.test',
      passwordHash: await hashPassword(PASSWORD),
      emailProvedAt: new Date('2026-01-01'),
    });
    await createSessionFor(user.id);
    expect(await loginWithGoogle(identity(), IP)).toEqual({ ok: true, data: { userId: user.id } });
    const after = await prisma.user.findUniqueOrThrow({
      where: { id: user.id },
      select: { googleId: true, passwordHash: true, emailProvedAt: true },
    });
    expect(after.googleId).toBe('google-sub-1');
    expect(after.passwordHash).not.toBeNull();
    // La date de la première preuve n'est pas réécrite.
    expect(after.emailProvedAt?.toISOString()).toBe('2026-01-01T00:00:00.000Z');
    // L'autre session reste ouverte, plus la nouvelle.
    expect(await prisma.session.count({ where: { userId: user.id } })).toBe(2);
    testCookies.clear();
    expect((await login('claire@example.test', PASSWORD, IP)).ok).toBe(true);
  });

  it('rattache un compte local à l’adresse JAMAIS prouvée en effaçant son mot de passe et ses sessions', async () => {
    // Un tiers a pu inscrire l'adresse d'autrui avec SON mot de passe : il ne
    // doit plus rien ouvrir une fois le vrai titulaire passé par Google.
    const user = await createUser({ email: 'claire@example.test', passwordHash: await hashPassword(PASSWORD) });
    await createSessionFor(user.id);
    await createSessionFor(user.id);

    expect(await loginWithGoogle(identity(), IP)).toEqual({ ok: true, data: { userId: user.id } });

    const after = await prisma.user.findUniqueOrThrow({
      where: { id: user.id },
      select: { googleId: true, passwordHash: true, emailProvedAt: true },
    });
    expect(after).toMatchObject({ googleId: 'google-sub-1', passwordHash: null });
    expect(after.emailProvedAt).not.toBeNull();
    // Seule la session qui vient d'être ouverte subsiste.
    expect(await prisma.session.count({ where: { userId: user.id } })).toBe(1);
    expect(testCookies.get(SESSION.cookieName)).toBeDefined();
    testCookies.clear();
    expect(await login('claire@example.test', PASSWORD, IP)).toEqual({ ok: false, error: { code: 'AUTH_FAILED' } });
  });

  it('ne reprend jamais un compte qui porte déjà une AUTRE identité Google', async () => {
    const user = await createUser({ email: 'claire@example.test', googleId: 'un-autre-sub' });
    const result = await loginWithGoogle(identity(), IP);
    expect(result.ok).toBe(false);
    expect((await prisma.user.findUniqueOrThrow({ where: { id: user.id } })).googleId).toBe('un-autre-sub');
    expect(await prisma.session.count()).toBe(0);
  });

  it('n’oppose pas le verrou progressif, et remet les compteurs à zéro', async () => {
    const user = await createUser({ googleId: 'google-sub-1' });
    await prisma.user.update({
      where: { id: user.id },
      data: { failedLoginCount: LOGIN_LOCK.freeAttempts + 2, lockedUntil: new Date(Date.now() + 3600_000) },
    });
    expect((await loginWithGoogle(identity(), IP)).ok).toBe(true);
    expect(await prisma.user.findUniqueOrThrow({ where: { id: user.id } })).toMatchObject({
      failedLoginCount: 0,
      lockedUntil: null,
    });
  });

  it('compte dans son propre seau, distinct de la connexion par mot de passe', async () => {
    for (let i = 0; i < RATE_LIMITS.loginPerIp.limit + 1; i++) await login(`x${i}@example.test`, 'Faux-9-mot', IP);
    expect((await loginWithGoogle(identity(), IP)).ok).toBe(true);
    // Des comptes déjà rattachés : seul le seau Google compte, pas celui des inscriptions.
    const known = RATE_LIMITS.googleSigninPerIp.limit + 1;
    for (let i = 0; i < known; i++) await createUser({ email: `g${i}@example.test`, googleId: `s${i}` });
    for (let i = 0; i < known - 1; i++) {
      expect((await loginWithGoogle(identity({ googleId: `s${i}`, email: `g${i}@example.test` }), '198.51.100.9')).ok).toBe(true);
    }
    const refused = await loginWithGoogle(identity({ googleId: `s${known - 1}`, email: 'z@example.test' }), '198.51.100.9');
    expect(refused.ok).toBe(false);
  });
});
