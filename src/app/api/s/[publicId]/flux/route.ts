import { NextResponse } from 'next/server';
import { LIVE_UPDATES } from '@/config/limits';
import { isPublicId } from '@/lib/public-id';
import { prisma } from '@/server/db/client';
import { publicPayload, subscribe, type LiveEvent } from '@/server/events/bus';
import { clientIp } from '@/server/ratelimit';

export const dynamic = 'force-dynamic';

/**
 * Flux en direct d'un sondage (Server-Sent Events, contracts/http-api.md).
 *
 * Public, comme la page : quiconque a le lien la voit. Le flux ne transporte
 * AUCUNE donnée du sondage - seulement « il a changé » - et la page se relit
 * par son rendu serveur habituel. Une fuite par le flux est donc
 * structurellement impossible (constitution II).
 *
 * Trois précautions : un battement régulier, sinon un proxy ferme une
 * connexion silencieuse ; une durée de vie maximale, après quoi le navigateur
 * rouvre seul ; et au plus quelques flux par adresse, pour qu'un onglet ouvert
 * en boucle n'épuise pas le serveur.
 */

/** Flux ouverts par adresse, sur `globalThis` pour survivre aux rechargements de développement. */
const globalForStreams = globalThis as unknown as { liveStreamsByIp?: Map<string, number> };
const streamsByIp = (globalForStreams.liveStreamsByIp ??= new Map<string, number>());

function acquire(ip: string): boolean {
  const current = streamsByIp.get(ip) ?? 0;
  if (current >= LIVE_UPDATES.maxStreamsPerIp) return false;
  streamsByIp.set(ip, current + 1);
  return true;
}

function release(ip: string): void {
  const current = streamsByIp.get(ip) ?? 0;
  if (current <= 1) streamsByIp.delete(ip);
  else streamsByIp.set(ip, current - 1);
}

export async function GET(request: Request, { params }: { params: Promise<{ publicId: string }> }): Promise<Response> {
  const { publicId } = await params;
  // Un `EventSource` ne relance pas une connexion refusée : c'est le bon
  // comportement pour un sondage qui n'existe pas (ou plus).
  const poll = isPublicId(publicId)
    ? await prisma.poll.findUnique({ where: { publicId }, select: { id: true } })
    : null;
  if (!poll) return new NextResponse(null, { status: 404 });

  const ip = clientIp(request.headers);
  if (!acquire(ip)) return new NextResponse(null, { status: 429 });

  const encoder = new TextEncoder();
  let unsubscribe: (() => void) | null = null;
  let heartbeat: NodeJS.Timeout | null = null;
  let deadline: NodeJS.Timeout | null = null;
  let closed = false;

  const cleanup = (controller?: ReadableStreamDefaultController<Uint8Array>) => {
    if (closed) return;
    closed = true;
    if (heartbeat) clearInterval(heartbeat);
    if (deadline) clearTimeout(deadline);
    unsubscribe?.();
    unsubscribe = null;
    release(ip);
    try {
      controller?.close();
    } catch {
      // Déjà fermé par le client : sans conséquence.
    }
  };

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const send = (chunk: string) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(chunk));
        } catch {
          cleanup(controller);
        }
      };

      // Délai de reconnexion suggéré, puis un premier événement : il confirme
      // l'ouverture, et permet à la page de reconnaître une RECONNEXION - après
      // laquelle elle se relit, pour rattraper ce qu'elle a manqué.
      send(`retry: ${LIVE_UPDATES.reconnectDelayMs}\n\n`);
      send('event: ready\ndata: {}\n\n');

      unsubscribe = subscribe(poll.id, (event: LiveEvent) => {
        send(`event: change\ndata: ${JSON.stringify(publicPayload(event))}\n\n`);
      });

      heartbeat = setInterval(() => send(': ping\n\n'), LIVE_UPDATES.heartbeatSeconds * 1000);
      deadline = setTimeout(() => cleanup(controller), LIVE_UPDATES.maxStreamMinutes * 60_000);
      request.signal.addEventListener('abort', () => cleanup(controller));
    },
    cancel() {
      cleanup();
    },
  });

  return new Response(stream, {
    status: 200,
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'private, no-store, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
}
