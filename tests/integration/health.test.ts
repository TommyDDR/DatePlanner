import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';
import { GET } from '@/app/api/sante/route';
import { BACKUP } from '@/config/limits';
import { prisma } from '@/server/db/client';
import { resetDatabase } from '../helpers/db';

beforeEach(resetDatabase);

/** La requête que `scripts/backup.sh` joue après chaque sauvegarde réussie. */
const backupRecorded = readFileSync(join(process.cwd(), 'scripts', 'lib', 'backup-recorded.sql'), 'utf8');

describe('/api/sante', () => {
  it('répond 200 quand la base répond, sans rien dire d’autre', async () => {
    await prisma.maintenanceRun.create({ data: { id: 1, lastRunAt: new Date() } });
    await prisma.backupRun.create({ data: { id: 1, lastRunAt: new Date() } });
    const response = await GET();
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: 'ok' });
    expect(response.headers.get('cache-control')).toBe('no-store');
  });

  it('signale une maintenance jamais passée ou en retard, sans changer le code', async () => {
    await prisma.backupRun.create({ data: { id: 1, lastRunAt: new Date() } });
    let response = await GET();
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: 'ok', maintenance: 'late' });

    await prisma.maintenanceRun.create({ data: { id: 1, lastRunAt: new Date(Date.now() - 31 * 60_000) } });
    response = await GET();
    expect(await response.json()).toEqual({ status: 'ok', maintenance: 'late' });
  });

  it('signale une sauvegarde jamais réussie ou en retard, sans changer le code', async () => {
    await prisma.maintenanceRun.create({ data: { id: 1, lastRunAt: new Date() } });
    let response = await GET();
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: 'ok', backup: 'late' });

    const stale = new Date(Date.now() - (BACKUP.lateAfterHours + 1) * 3_600_000);
    await prisma.backupRun.create({ data: { id: 1, lastRunAt: stale } });
    response = await GET();
    expect(await response.json()).toEqual({ status: 'ok', backup: 'late' });
  });

  it('se tait dès que le script de sauvegarde a consigné sa réussite', async () => {
    await prisma.maintenanceRun.create({ data: { id: 1, lastRunAt: new Date() } });
    const stale = new Date(Date.now() - (BACKUP.lateAfterHours + 1) * 3_600_000);
    await prisma.backupRun.create({ data: { id: 1, lastRunAt: stale } });

    // Dans un autre fuseau que UTC, comme une base réglée sur la machine :
    // `now()` sans `AT TIME ZONE 'UTC'` daterait la réussite de deux heures
    // trop tard, et le test le verrait.
    await prisma.$transaction([
      prisma.$executeRawUnsafe(`SET LOCAL TIME ZONE 'Europe/Paris'`),
      prisma.$executeRawUnsafe(backupRecorded),
    ]);

    const run = await prisma.backupRun.findUniqueOrThrow({ where: { id: 1 } });
    expect(Math.abs(run.lastRunAt.getTime() - Date.now())).toBeLessThan(60_000);
    const response = await GET();
    expect(await response.json()).toEqual({ status: 'ok' });
  });

  it('crée la ligne de la sauvegarde si elle manque', async () => {
    await prisma.$executeRawUnsafe(backupRecorded);
    const run = await prisma.backupRun.findUniqueOrThrow({ where: { id: 1 } });
    expect(Math.abs(run.lastRunAt.getTime() - Date.now())).toBeLessThan(60_000);
  });
});
