import { NextResponse } from 'next/server';
import { isPublicId } from '@/lib/public-id';
import { prisma } from '@/server/db/client';
import { liveStream } from '@/server/events/stream';

export const dynamic = 'force-dynamic';

/**
 * Flux en direct d'un sondage (contracts/http-api.md, `src/server/events/stream.ts`).
 *
 * Public, comme la page : quiconque a le lien la voit.
 */
export async function GET(request: Request, { params }: { params: Promise<{ publicId: string }> }): Promise<Response> {
  const { publicId } = await params;
  // Un `EventSource` ne relance pas une connexion refusée : c'est le bon
  // comportement pour un sondage qui n'existe pas (ou plus).
  const poll = isPublicId(publicId)
    ? await prisma.poll.findUnique({ where: { publicId }, select: { id: true } })
    : null;
  if (!poll) return new NextResponse(null, { status: 404 });
  return liveStream(request, [poll.id]);
}
