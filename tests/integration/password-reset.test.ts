import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RATE_LIMITS, SESSION } from '@/config/limits';
import { prisma } from '@/server/db/client';
import { hashPassword, verifyPassword } from '@/server/auth/password';
import { requestPasswordReset, resetPassword } from '@/server/auth/service';
import { hashToken } from '@/server/auth/session';
import { composeEmail } from '@/server/notifications/compose';
import { testCookies } from '../setup';
import { resetDatabase } from '../helpers/db';
import { createSessionFor, createUser } from '../helpers/factories';

/** Mot de passe oublié (FR-004). */

const IP = '203.0.113.7';

beforeEach(async () => {
  await resetDatabase();
  testCookies.clear();
  vi.spyOn(console, 'info').mockImplementation(() => undefined);
});

afterEach(() => {
  vi.restoreAllMocks();
});

/** Le jeton en clair de la dernière demande, lu dans la file d'envoi. */
async function lastToken(): Promise<string> {
  const entry = await prisma.emailOutbox.findFirstOrThrow({
    where: { template: 'PASSWORD_RESET' },
    orderBy: { createdAt: 'desc' },
  });
  return (entry.payload as { token: string }).token;
}

describe('requestPasswordReset', () => {
  it('met un email en file pour un compte existant, et rien pour une adresse inconnue', async () => {
    await createUser({ email: 'lea@exemple.fr' });
    await requestPasswordReset('inconnu@exemple.fr', IP);
    expect(await prisma.emailOutbox.count()).toBe(0);
    await requestPasswordReset('LEA@exemple.fr', IP);
    expect(await prisma.emailOutbox.count({ where: { template: 'PASSWORD_RESET', to: 'lea@exemple.fr' } })).toBe(1);
  });

  it('borne les demandes par compte, en silence', async () => {
    await createUser({ email: 'lea@exemple.fr' });
    for (let i = 0; i < RATE_LIMITS.resetPerAccount.limit + 2; i++) {
      await requestPasswordReset('lea@exemple.fr', `10.0.0.${i}`);
    }
    expect(await prisma.emailOutbox.count()).toBe(RATE_LIMITS.resetPerAccount.limit);
  });

  it('compose un email qui porte le lien de réinitialisation', async () => {
    await createUser({ email: 'lea@exemple.fr' });
    await requestPasswordReset('lea@exemple.fr', IP);
    const entry = await prisma.emailOutbox.findFirstOrThrow();
    const email = await composeEmail(entry);
    expect(email?.text).toContain(`/reinitialisation?jeton=${await lastToken()}`);
  });
});

describe('resetPassword', () => {
  it('change le mot de passe, prouve l’adresse, ferme toutes les sessions puis en ouvre une', async () => {
    const user = await createUser({ email: 'lea@exemple.fr', passwordHash: await hashPassword('Ancien-mot-9') });
    await createSessionFor(user.id);
    await createSessionFor(user.id);
    await requestPasswordReset('lea@exemple.fr', IP);

    const result = await resetPassword(await lastToken(), 'Nouveau-mot-9');
    expect(result).toEqual({ ok: true, data: { userId: user.id } });

    const after = await prisma.user.findUniqueOrThrow({
      where: { id: user.id },
      select: { passwordHash: true, emailProvedAt: true },
    });
    expect(await verifyPassword(after.passwordHash!, 'Nouveau-mot-9')).toBe(true);
    expect(after.emailProvedAt).not.toBeNull();
    expect(await prisma.session.count()).toBe(1);
    expect(testCookies.get(SESSION.cookieName)).toBeDefined();
  });

  it('ne sert qu’une fois', async () => {
    await createUser({ email: 'lea@exemple.fr' });
    await requestPasswordReset('lea@exemple.fr', IP);
    const token = await lastToken();
    expect((await resetPassword(token, 'Nouveau-mot-9')).ok).toBe(true);
    expect(await resetPassword(token, 'Encore-autre-9')).toEqual({ ok: false, error: { code: 'NOT_FOUND' } });
  });

  it('refuse un jeton expiré ou inconnu', async () => {
    await createUser({ email: 'lea@exemple.fr' });
    await requestPasswordReset('lea@exemple.fr', IP);
    const token = await lastToken();
    await prisma.passwordResetToken.updateMany({ data: { expiresAt: new Date(Date.now() - 1000) } });
    expect(await resetPassword(token, 'Nouveau-mot-9')).toEqual({ ok: false, error: { code: 'NOT_FOUND' } });
    expect(await resetPassword('inconnu'.repeat(6), 'Nouveau-mot-9')).toEqual({ ok: false, error: { code: 'NOT_FOUND' } });
  });

  it('ne garde que le dernier lien valable', async () => {
    await createUser({ email: 'lea@exemple.fr' });
    await requestPasswordReset('lea@exemple.fr', IP);
    const first = await lastToken();
    await requestPasswordReset('lea@exemple.fr', IP);
    expect(await resetPassword(first, 'Nouveau-mot-9')).toEqual({ ok: false, error: { code: 'NOT_FOUND' } });
    expect(await prisma.passwordResetToken.findUnique({ where: { tokenHash: hashToken(first) } })).not.toBeNull();
  });
});
