import { NextResponse } from 'next/server';
import { getSessionUser } from '@/server/auth/session';
import { liveStream } from '@/server/events/stream';
import { listMyPollIds } from '@/server/polls/read';

export const dynamic = 'force-dynamic';

/**
 * Flux en direct de « Mes sondages » (FR-044, contracts/http-api.md) : un
 * changement sur l'un des sondages créés par le compte, ou auxquels il a
 * répondu, et la page se relit - la bordure « du nouveau » apparaît sans
 * recharger.
 *
 * Sans session, 404 : le navigateur ne relance pas. La liste des sondages est
 * lue à l'ouverture ; la page rouvre le flux quand sa liste change.
 */
export async function GET(request: Request): Promise<Response> {
  const user = await getSessionUser();
  if (!user) return new NextResponse(null, { status: 404 });
  return liveStream(request, await listMyPollIds(user.id));
}
