import { NextResponse } from 'next/server';
import { BACKUP, MAINTENANCE } from '@/config/limits';
import { prisma } from '@/server/db/client';

export const dynamic = 'force-dynamic';

/**
 * Point de santé (contracts/http-api.md), interrogé depuis l'EXTÉRIEUR.
 *
 * Répond 200 tant que le processus tourne ET que la base répond : un serveur
 * qui rend des pages alors que PostgreSQL est tombé est en panne pour le
 * visiteur. Il signale aussi une maintenance en retard, sans changer le code :
 * le site sert encore, mais les emails et les purges ne partent plus. Et une
 * sauvegarde en retard : `scripts/backup.sh` consigne chaque réussite
 * (`backup_run`), et une date qui vieillit est une sauvegarde qui n'aboutit
 * plus - six nuits de suite, en octobre 2026, sans que rien ne le dise.
 *
 * La réponse ne dit RIEN de plus : ce point est ouvert - un superviseur n'a
 * pas de session - et tout ce qu'il rend est public.
 */
export async function GET(): Promise<Response> {
  const headers = { 'Cache-Control': 'no-store' };
  try {
    await prisma.$queryRaw`SELECT 1`;
  } catch {
    return NextResponse.json({ status: 'degraded' }, { status: 503, headers });
  }

  const body: { status: 'ok'; maintenance?: 'late'; backup?: 'late' } = { status: 'ok' };
  try {
    const run = await prisma.maintenanceRun.findUnique({ where: { id: 1 } });
    const lateBefore = Date.now() - MAINTENANCE.lateAfterMinutes * 60_000;
    if (!run || run.lastRunAt.getTime() < lateBefore) body.maintenance = 'late';
  } catch {
    body.maintenance = 'late';
  }
  try {
    const backup = await prisma.backupRun.findUnique({ where: { id: 1 } });
    const lateBefore = Date.now() - BACKUP.lateAfterHours * 3_600_000;
    if (!backup || backup.lastRunAt.getTime() < lateBefore) body.backup = 'late';
  } catch {
    body.backup = 'late';
  }
  return NextResponse.json(body, { headers });
}
