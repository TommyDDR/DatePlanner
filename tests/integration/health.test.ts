import { beforeEach, describe, expect, it } from 'vitest';
import { GET } from '@/app/api/sante/route';
import { prisma } from '@/server/db/client';
import { resetDatabase } from '../helpers/db';

beforeEach(resetDatabase);

describe('/api/sante', () => {
  it('répond 200 quand la base répond, sans rien dire d’autre', async () => {
    await prisma.maintenanceRun.create({ data: { id: 1, lastRunAt: new Date() } });
    const response = await GET();
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: 'ok' });
    expect(response.headers.get('cache-control')).toBe('no-store');
  });

  it('signale une maintenance jamais passée ou en retard, sans changer le code', async () => {
    let response = await GET();
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: 'ok', maintenance: 'late' });

    await prisma.maintenanceRun.create({ data: { id: 1, lastRunAt: new Date(Date.now() - 31 * 60_000) } });
    response = await GET();
    expect(await response.json()).toEqual({ status: 'ok', maintenance: 'late' });
  });
});
