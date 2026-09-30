import { afterEach, describe, expect, it } from 'vitest';
import { disconnect, publicPayload, publish, ready, subscribe, type LiveEvent } from '@/server/events/bus';

afterEach(async () => {
  await disconnect();
});

function waitFor(predicate: () => boolean, timeoutMs = 3000): Promise<void> {
  return new Promise((resolve, reject) => {
    const started = Date.now();
    const tick = () => {
      if (predicate()) return resolve();
      if (Date.now() - started > timeoutMs) return reject(new Error('délai dépassé'));
      setTimeout(tick, 20);
    };
    tick();
  });
}

describe('bus d’événements', () => {
  it('ne réveille que les abonnés du sondage concerné', async () => {
    const received: LiveEvent[] = [];
    const other: LiveEvent[] = [];
    const stopA = subscribe('sondage-a', (event) => received.push(event));
    const stopB = subscribe('sondage-b', (event) => other.push(event));
    await ready();

    await publish('sondage-a', 'responses');
    await waitFor(() => received.length === 1);
    // Laisse le temps à une éventuelle livraison erronée d'arriver.
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(other).toEqual([]);
    expect(received[0]).toMatchObject({ pollId: 'sondage-a', kind: 'responses' });

    stopA();
    stopB();
  });

  it('n’envoie au navigateur que le genre et l’heure', () => {
    const event: LiveEvent = { pollId: 'interne', kind: 'poll', at: '2026-09-30T12:00:00.000Z' };
    expect(publicPayload(event)).toEqual({ kind: 'poll', at: '2026-09-30T12:00:00.000Z' });
  });

  it('ne lève pas quand un auditeur échoue', async () => {
    const received: LiveEvent[] = [];
    const stop1 = subscribe('sondage-c', () => {
      throw new Error('boum');
    });
    const stop2 = subscribe('sondage-c', (event) => received.push(event));
    await ready();
    await publish('sondage-c', 'deleted');
    await waitFor(() => received.length === 1);
    stop1();
    stop2();
  });
});
