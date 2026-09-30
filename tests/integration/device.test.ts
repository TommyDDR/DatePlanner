import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DEVICE } from '@/config/limits';
import { ensureDeviceToken, hashDeviceToken, readDeviceTokenHash } from '@/server/auth/device';
import { testCookies } from '../setup';

/** Le cookie d'appareil d'un répondant sans compte (research.md R6). */

beforeEach(() => {
  testCookies.clear();
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('cookie dp_appareil', () => {
  it('est posé une fois, puis relu', async () => {
    const first = await ensureDeviceToken();
    const second = await ensureDeviceToken();
    expect(second).toBe(first);
    expect(await readDeviceTokenHash()).toBe(first);
    expect(first).toMatch(/^[0-9a-f]{64}$/);
  });

  it('ne donne à la base que l’empreinte du jeton', async () => {
    const hash = await ensureDeviceToken();
    const token = testCookies.get(DEVICE.cookieName)!;
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(hash).toBe(hashDeviceToken(token));
    expect(hash).not.toContain(token);
  });

  it('porte les attributs attendus', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    await ensureDeviceToken();
    expect(testCookies.options(DEVICE.cookieName)).toMatchObject({
      httpOnly: true,
      sameSite: 'lax',
      secure: true,
      path: '/',
      maxAge: DEVICE.maxAgeSeconds,
    });
  });

  it('distingue deux navigateurs', async () => {
    const first = await ensureDeviceToken();
    testCookies.newBrowser();
    expect(await readDeviceTokenHash()).toBeNull();
    expect(await ensureDeviceToken()).not.toBe(first);
  });
});
