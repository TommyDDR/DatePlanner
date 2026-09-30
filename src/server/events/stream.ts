import { NextResponse } from 'next/server';
import { LIVE_UPDATES } from '@/config/limits';
import { publicPayload, subscribe, type LiveEvent } from '@/server/events/bus';
import { clientIp } from '@/server/ratelimit';

/**
 * Un flux en direct (Server-Sent Events, contracts/http-api.md) : « l'un de ces
 * sondages a changé », et rien d'autre.
 *
 * Le flux ne transporte AUCUNE donnée des sondages - seulement le genre du
 * changement et son heure, pas même le sondage concerné - et la page se relit
 * par son rendu serveur habituel. Une fuite par le flux est donc
 * structurellement impossible (constitution II).
 *
 * Trois précautions : un battement régulier, sinon un proxy ferme une
 * connexion silencieuse ; une durée de vie maximale, après quoi le navigateur
 * rouvre seul ; et au plus quelques flux par adresse, tous flux confondus,
 * pour qu'un onglet ouvert en boucle n'épuise pas le serveur.
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

/** Ouvre un flux qui annonce chaque changement des sondages `pollIds` (identifiants internes). */
export function liveStream(request: Request, pollIds: readonly string[]): Response {
  const ip = clientIp(request.headers);
  if (!acquire(ip)) return new NextResponse(null, { status: 429 });

  const encoder = new TextEncoder();
  const unsubscribes: Array<() => void> = [];
  let heartbeat: NodeJS.Timeout | null = null;
  let deadline: NodeJS.Timeout | null = null;
  let closed = false;

  const cleanup = (controller?: ReadableStreamDefaultController<Uint8Array>) => {
    if (closed) return;
    closed = true;
    if (heartbeat) clearInterval(heartbeat);
    if (deadline) clearTimeout(deadline);
    for (const unsubscribe of unsubscribes.splice(0)) unsubscribe();
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

      const onEvent = (event: LiveEvent) => {
        send(`event: change\ndata: ${JSON.stringify(publicPayload(event))}\n\n`);
      };
      for (const pollId of new Set(pollIds)) unsubscribes.push(subscribe(pollId, onEvent));

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
