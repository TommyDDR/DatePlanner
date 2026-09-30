import { beforeEach, describe, expect, it } from 'vitest';
import { LOGIN_LOCK, RATE_LIMITS, SESSION } from '@/config/limits';
import { prisma } from '@/server/db/client';
import { login, register } from '@/server/auth/service';
import { hashPassword } from '@/server/auth/password';
import { testCookies } from '../setup';
import { resetDatabase } from '../helpers/db';
import { createUser } from '../helpers/factories';

/** Comptes locaux (FR-001, FR-005). */

const IP = '203.0.113.7';
const PASSWORD = 'Mot-de-passe-9';

beforeEach(async () => {
  await resetDatabase();
  testCookies.clear();
});

describe('register', () => {
  it('crée le compte, adresse en minuscules, et ouvre la session', async () => {
    const result = await register({ email: 'Camille@Exemple.FR', displayName: 'Camille', password: PASSWORD }, IP);
    expect(result.ok).toBe(true);
    const user = await prisma.user.findUniqueOrThrow({
      where: { email: 'camille@exemple.fr' },
      select: { displayName: true, passwordHash: true, emailProvedAt: true },
    });
    expect(user.displayName).toBe('Camille');
    expect(user.passwordHash).toMatch(/^\$argon2id\$/);
    expect(user.emailProvedAt).toBeNull();
    expect(testCookies.get(SESSION.cookieName)).toBeDefined();
  });

  it('connecte, sans rien annoncer, qui s’inscrit sur une adresse existante avec le bon mot de passe', async () => {
    const existing = await createUser({ email: 'lea@exemple.fr', passwordHash: await hashPassword(PASSWORD) });
    const result = await register({ email: 'lea@exemple.fr', displayName: 'Autre', password: PASSWORD }, IP);
    expect(result).toEqual({ ok: true, data: { userId: existing.id } });
    expect(await prisma.user.count()).toBe(1);
  });

  it('rend l’échec générique de la connexion avec un faux mot de passe', async () => {
    await createUser({ email: 'lea@exemple.fr', passwordHash: await hashPassword(PASSWORD) });
    const viaRegister = await register({ email: 'lea@exemple.fr', displayName: 'X', password: 'Autre-mot-9' }, IP);
    const viaLogin = await login('inconnu@exemple.fr', 'Autre-mot-9', IP);
    expect(viaRegister).toEqual({ ok: false, error: { code: 'AUTH_FAILED' } });
    expect(viaLogin).toEqual(viaRegister);
  });

  it('borne les créations de compte par adresse', async () => {
    for (let i = 0; i < RATE_LIMITS.registerPerIp.limit; i++) {
      await register({ email: `u${i}@exemple.fr`, displayName: 'U', password: PASSWORD }, IP);
    }
    const refused = await register({ email: 'dernier@exemple.fr', displayName: 'U', password: PASSWORD }, IP);
    expect(refused).toMatchObject({ ok: false, error: { code: 'RATE_LIMITED' } });
  });
});

describe('login', () => {
  it('connecte avec le bon mot de passe et remet les échecs à zéro', async () => {
    const user = await createUser({ email: 'lea@exemple.fr', passwordHash: await hashPassword(PASSWORD) });
    await prisma.user.update({ where: { id: user.id }, data: { failedLoginCount: 3 } });
    expect(await login('LEA@exemple.fr ', PASSWORD, IP)).toEqual({ ok: true, data: { userId: user.id } });
    expect((await prisma.user.findUniqueOrThrow({ where: { id: user.id } })).failedLoginCount).toBe(0);
  });

  it('refuse un compte sans mot de passe comme un mot de passe faux', async () => {
    await createUser({ email: 'google@exemple.fr', passwordHash: null });
    expect(await login('google@exemple.fr', PASSWORD, IP)).toEqual({ ok: false, error: { code: 'AUTH_FAILED' } });
  });

  it('verrouille progressivement, sans l’annoncer', async () => {
    const user = await createUser({ email: 'lea@exemple.fr', passwordHash: await hashPassword(PASSWORD) });
    for (let i = 0; i < LOGIN_LOCK.freeAttempts; i++) await login('lea@exemple.fr', 'Faux-mot-9', `10.0.0.${i}`);
    const locked = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(locked.lockedUntil?.getTime()).toBeGreaterThan(Date.now());
    // Même le bon mot de passe est refusé pendant le verrou, avec le même message.
    expect(await login('lea@exemple.fr', PASSWORD, '10.0.1.1')).toEqual({ ok: false, error: { code: 'AUTH_FAILED' } });
  });

  it('borne les tentatives par adresse réseau', async () => {
    for (let i = 0; i < RATE_LIMITS.loginPerIp.limit; i++) await login(`x${i}@exemple.fr`, 'Faux-mot-9', IP);
    expect(await login('y@exemple.fr', 'Faux-mot-9', IP)).toMatchObject({ ok: false, error: { code: 'RATE_LIMITED' } });
  });
});
