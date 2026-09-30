import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { POST } from '@/app/api/maintenance/route';
import { prisma } from '@/server/db/client';
import { resetDatabase } from '../helpers/db';
import { createUser } from '../helpers/factories';

beforeEach(resetDatabase);

afterEach(() => {
  vi.unstubAllEnvs();
});

function call(authorization?: string): Promise<Response> {
  return POST(
    new Request('http://127.0.0.1:3000/api/maintenance', {
      method: 'POST',
      headers: authorization ? { authorization } : {},
    }),
  );
}

describe('/api/maintenance', () => {
  it('refuse sans le bon secret, sans rien dire', async () => {
    vi.stubEnv('CRON_SECRET', 'secret-de-test');
    for (const header of [undefined, 'Bearer faux', 'secret-de-test', 'Bearer secret-de-tes']) {
      const response = await call(header);
      expect(response.status).toBe(401);
      expect(await response.text()).toBe('');
    }
  });

  it('refuse tout quand aucun secret n’est configuré', async () => {
    vi.stubEnv('CRON_SECRET', '');
    expect((await call('Bearer ')).status).toBe(401);
  });

  it('purge ce qui a expiré et horodate son passage', async () => {
    vi.stubEnv('CRON_SECRET', 'secret-de-test');
    const user = await createUser();
    await prisma.session.create({
      data: { userId: user.id, tokenHash: 'h1', expiresAt: new Date(Date.now() - 1000) },
    });
    await prisma.session.create({
      data: { userId: user.id, tokenHash: 'h2', expiresAt: new Date(Date.now() + 86_400_000) },
    });
    await prisma.rateLimitHit.create({ data: { bucket: 'loginPerIp', key: 'a', at: new Date(Date.now() - 25 * 3600_000) } });

    const response = await call('Bearer secret-de-test');
    expect(response.status).toBe(200);
    const report = await response.json();
    expect(report.purged).toMatchObject({ sessions: 1, rateLimitHits: 1 });
    expect(await prisma.session.count()).toBe(1);
    expect(await prisma.maintenanceRun.findUnique({ where: { id: 1 } })).not.toBeNull();

    // Idempotent : un second passage ne trouve plus rien.
    const again = await (await call('Bearer secret-de-test')).json();
    expect(again.purged).toMatchObject({ sessions: 0, rateLimitHits: 0 });
  });
});
