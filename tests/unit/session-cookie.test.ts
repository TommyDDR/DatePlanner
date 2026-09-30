import { afterEach, describe, expect, it, vi } from 'vitest';
import { SESSION } from '@/config/limits';
import {
  sessionAbsoluteExpiry,
  sessionCookieOptions,
  sessionExpiryFrom,
  sessionNeedsRenewal,
} from '@/lib/session-cookie';

/**
 * Attributs du cookie de session (constitution I) et horloges de la session
 * glissante.
 */

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('cookie dp_session', () => {
  it('porte le nom attendu', () => {
    expect(SESSION.cookieName).toBe('dp_session');
  });

  it('est HttpOnly, SameSite=Lax, sur tout le site', () => {
    const options = sessionCookieOptions(new Date());
    expect(options.httpOnly).toBe(true);
    expect(options.sameSite).toBe('lax');
    expect(options.path).toBe('/');
  });

  it('est Secure en production, et seulement là', () => {
    vi.stubEnv('NODE_ENV', 'production');
    expect(sessionCookieOptions(new Date()).secure).toBe(true);
    vi.stubEnv('NODE_ENV', 'development');
    expect(sessionCookieOptions(new Date()).secure).toBe(false);
  });
});

describe('échéances', () => {
  const now = new Date('2026-09-30T12:00:00Z');

  it('glisse de trente jours', () => {
    expect(sessionExpiryFrom(now).getTime() - now.getTime()).toBe(30 * 24 * 3600 * 1000);
  });

  it('ne dépasse jamais le plafond de quatre-vingt-dix jours depuis la connexion', () => {
    const openedAt = new Date(now.getTime() - 80 * 24 * 3600 * 1000);
    expect(sessionExpiryFrom(now, openedAt).getTime()).toBe(sessionAbsoluteExpiry(openedAt).getTime());
    expect(sessionAbsoluteExpiry(openedAt).getTime() - openedAt.getTime()).toBe(90 * 24 * 3600 * 1000);
  });

  it('ne prolonge la ligne en base qu’une fois par heure au plus', () => {
    const justRenewed = sessionExpiryFrom(now);
    expect(sessionNeedsRenewal(justRenewed, new Date(now.getTime() + 30 * 60 * 1000))).toBe(false);
    expect(sessionNeedsRenewal(justRenewed, new Date(now.getTime() + 61 * 60 * 1000))).toBe(true);
  });
});
