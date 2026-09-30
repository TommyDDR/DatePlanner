import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RATE_LIMITS } from '@/config/limits';
import { prisma } from '@/server/db/client';
import { clientIp, consume, purgeExpiredHits, reset, UNKNOWN_IP } from '@/server/ratelimit';
import { setTestHeaders } from '../setup';
import { resetDatabase } from '../helpers/db';

beforeEach(async () => {
  await resetDatabase();
  setTestHeaders({});
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('consume', () => {
  it('autorise jusqu’à la limite, puis refuse avec un délai', async () => {
    const { limit } = RATE_LIMITS.registerPerIp;
    for (let i = 0; i < limit; i++) expect((await consume('registerPerIp', '203.0.113.7')).allowed).toBe(true);
    const refused = await consume('registerPerIp', '203.0.113.7');
    expect(refused.allowed).toBe(false);
    expect(refused.retryAfterSeconds).toBeGreaterThan(0);
    expect(refused.retryAfterSeconds).toBeLessThanOrEqual(RATE_LIMITS.registerPerIp.windowSeconds);
  });

  it('sépare les seaux et les clés', async () => {
    for (let i = 0; i < RATE_LIMITS.registerPerIp.limit; i++) await consume('registerPerIp', 'a');
    expect((await consume('registerPerIp', 'b')).allowed).toBe(true);
    expect((await consume('loginPerIp', 'a')).allowed).toBe(true);
  });

  it('oublie ce qui sort de la fenêtre', async () => {
    for (let i = 0; i < RATE_LIMITS.registerPerIp.limit; i++) await consume('registerPerIp', 'a');
    await prisma.rateLimitHit.updateMany({ data: { at: new Date(Date.now() - 2 * 3600 * 1000) } });
    expect((await consume('registerPerIp', 'a')).allowed).toBe(true);
  });

  it('se remet à zéro sur demande', async () => {
    for (let i = 0; i < RATE_LIMITS.registerPerIp.limit + 1; i++) await consume('registerPerIp', 'a');
    await reset('registerPerIp', 'a');
    expect((await consume('registerPerIp', 'a')).allowed).toBe(true);
  });

  it('est neutralisable hors production seulement', async () => {
    vi.stubEnv('RATE_LIMIT_DISABLED', '1');
    vi.stubEnv('NODE_ENV', 'development');
    for (let i = 0; i < 20; i++) expect((await consume('registerPerIp', 'a')).allowed).toBe(true);
    expect(await prisma.rateLimitHit.count()).toBe(0);

    vi.stubEnv('NODE_ENV', 'production');
    for (let i = 0; i < RATE_LIMITS.registerPerIp.limit; i++) await consume('registerPerIp', 'a');
    expect((await consume('registerPerIp', 'a')).allowed).toBe(false);
  });

  it('exempte une adresse nommée exactement, jamais un préfixe', async () => {
    vi.stubEnv('RATE_LIMIT_ALLOWLIST', '192.168.1.1');
    setTestHeaders({ 'x-real-ip': '192.168.1.1' });
    for (let i = 0; i < 20; i++) expect((await consume('registerPerIp', 'x')).allowed).toBe(true);

    setTestHeaders({ 'x-real-ip': '192.168.1.10' });
    for (let i = 0; i < RATE_LIMITS.registerPerIp.limit; i++) await consume('registerPerIp', 'y');
    expect((await consume('registerPerIp', 'y')).allowed).toBe(false);
  });

  it('purge les traces anciennes', async () => {
    await consume('loginPerIp', 'a');
    await prisma.rateLimitHit.updateMany({ data: { at: new Date(Date.now() - 25 * 3600 * 1000) } });
    expect(await purgeExpiredHits()).toBe(1);
  });
});

describe('clientIp', () => {
  it('préfère X-Real-IP, posé par le proxy', () => {
    expect(clientIp(new Headers({ 'x-real-ip': '203.0.113.7', 'x-forwarded-for': '1.2.3.4' }))).toBe('203.0.113.7');
  });

  it('prend la DERNIÈRE valeur de X-Forwarded-For, jamais celle du client', () => {
    expect(clientIp(new Headers({ 'x-forwarded-for': '1.2.3.4, 203.0.113.7' }))).toBe('203.0.113.7');
  });

  it('ramène une adresse IPv4 écrite en IPv6 à sa forme habituelle', () => {
    expect(clientIp(new Headers({ 'x-real-ip': '::ffff:203.0.113.7' }))).toBe('203.0.113.7');
  });

  it('regroupe les requêtes sans adresse sous un marqueur', () => {
    expect(clientIp(new Headers())).toBe(UNKNOWN_IP);
  });
});
