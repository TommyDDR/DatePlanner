import { timingSafeEqual } from 'node:crypto';
import { NextResponse } from 'next/server';
import { runMaintenance } from '@/server/maintenance';

export const dynamic = 'force-dynamic';

/**
 * Maintenance (contracts/http-api.md).
 *
 * Appelée en boucle locale par l'unité systemd :
 *
 *   curl -fsS -X POST -H "Authorization: Bearer $CRON_SECRET" http://127.0.0.1:3000/api/maintenance
 *
 * Sans le bon secret : 401, sans rien dire de plus.
 */
export async function POST(request: Request): Promise<Response> {
  if (!authorized(request)) return new NextResponse(null, { status: 401 });
  const report = await runMaintenance();
  return NextResponse.json(report, { headers: { 'Cache-Control': 'no-store' } });
}

/**
 * Comparaison à temps constant : une comparaison ordinaire s'arrête au premier
 * caractère différent, et sa durée dirait combien de caractères sont justes.
 */
function authorized(request: Request): boolean {
  const expected = process.env.CRON_SECRET;
  if (!expected) return false;
  const header = request.headers.get('authorization') ?? '';
  const provided = header.startsWith('Bearer ') ? header.slice(7) : '';
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}
