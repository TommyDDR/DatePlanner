import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { LIVE_UPDATES, SESSION } from '@/config/limits';
import { GET as myPollsStream } from '@/app/api/mes-sondages/flux/route';
import { GET } from '@/app/api/s/[publicId]/flux/route';
import { submitResponseAction, withdrawResponseAction } from '@/app/s/[publicId]/actions';
import { disconnect, publish, ready } from '@/server/events/bus';
import { setTestHeaders, testCookies } from '../setup';
import { resetDatabase } from '../helpers/db';
import { createPoll, createResponse, createSessionFor, createUser, dayFromToday } from '../helpers/factories';

/** Les flux en direct : d'un sondage (FR-023) et de « Mes sondages » (FR-044) ; contracts/http-api.md. */

const open: AbortController[] = [];

beforeEach(async () => {
  await resetDatabase();
  testCookies.clear();
  setTestHeaders({ 'x-real-ip': '203.0.113.7' });
});

afterEach(async () => {
  for (const controller of open.splice(0)) controller.abort();
  await disconnect();
});

function connect(publicId: string, ip = '198.51.100.1') {
  const controller = new AbortController();
  open.push(controller);
  const request = new Request(`http://localhost/api/s/${publicId}/flux`, {
    headers: { 'x-real-ip': ip },
    signal: controller.signal,
  });
  return { response: GET(request, { params: Promise.resolve({ publicId }) }), controller };
}

/** Lit le flux jusqu'à trouver `marker`, ou échoue au bout du délai. */
async function readUntil(response: Response, marker: string, timeoutMs = 3000): Promise<string> {
  const reader = response.body!.getReader();
  const decoder = new TextDecoder();
  let text = '';
  const deadline = Date.now() + timeoutMs;
  try {
    while (!text.includes(marker)) {
      if (Date.now() > deadline) throw new Error(`« ${marker} » jamais reçu ; reçu : ${text}`);
      const chunk = await Promise.race([
        reader.read(),
        new Promise<never>((_, reject) => setTimeout(() => reject(new Error('délai')), deadline - Date.now())),
      ]);
      if (chunk.done) break;
      text += decoder.decode(chunk.value);
    }
  } finally {
    reader.releaseLock();
  }
  return text;
}

function form(values: Record<string, string | string[]>): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(values)) {
    for (const item of Array.isArray(value) ? value : [value]) data.append(key, item);
  }
  return data;
}

describe('/api/s/{publicId}/flux', () => {
  it('répond 404 à un sondage inconnu ou mal formé', async () => {
    expect((await connect('a'.repeat(22)).response).status).toBe(404);
    expect((await connect('mal-forme').response).status).toBe(404);
  });

  it('ouvre un flux SSE qui annonce qu’il est prêt', async () => {
    const poll = await createPoll();
    const response = await connect(poll.publicId).response;
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toContain('text/event-stream');
    expect(response.headers.get('cache-control')).toContain('no-store');
    expect(await readUntil(response, 'event: ready')).toContain(`retry: ${LIVE_UPDATES.reconnectDelayMs}`);
  });

  it('ne transmet que les événements de SON sondage, réduits au genre et à l’heure', async () => {
    const poll = await createPoll();
    const other = await createPoll();
    const response = await connect(poll.publicId).response;
    await readUntil(response, 'event: ready');
    await ready();

    await publish(other.id, 'poll');
    await publish(poll.id, 'responses');
    const text = await readUntil(response, 'event: change');
    const data = JSON.parse(/data: (\{.*\})/.exec(text.slice(text.indexOf('event: change')))![1]!);
    expect(Object.keys(data).sort()).toEqual(['at', 'kind']);
    expect(data.kind).toBe('responses');
    expect(text).not.toContain(other.id);
    expect(text).not.toContain(poll.id);
  });

  it(`refuse un ${LIVE_UPDATES.maxStreamsPerIp + 1}e flux simultané de la même adresse`, async () => {
    const poll = await createPoll();
    for (let i = 0; i < LIVE_UPDATES.maxStreamsPerIp; i++) {
      expect((await connect(poll.publicId, '192.0.2.9').response).status).toBe(200);
    }
    expect((await connect(poll.publicId, '192.0.2.9').response).status).toBe(429);
    expect((await connect(poll.publicId, '192.0.2.10').response).status).toBe(200);
  });

  it('libère la place d’un flux fermé', async () => {
    const poll = await createPoll();
    const streams = [];
    for (let i = 0; i < LIVE_UPDATES.maxStreamsPerIp; i++) streams.push(connect(poll.publicId, '192.0.2.20'));
    await Promise.all(streams.map((s) => s.response));
    streams[0]!.controller.abort();
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect((await connect(poll.publicId, '192.0.2.20').response).status).toBe(200);
  });

  it('annonce une réponse enregistrée puis retirée', async () => {
    const poll = await createPoll();
    const response = await connect(poll.publicId).response;
    await readUntil(response, 'event: ready');
    await ready();

    await submitResponseAction(null, form({ publicId: poll.publicId, pseudonym: 'Léa', days: [dayFromToday(3)] }));
    expect(await readUntil(response, '"kind":"responses"')).toContain('event: change');

    await withdrawResponseAction(null, form({ publicId: poll.publicId }));
    expect(await readUntil(response, '"kind":"responses"')).toContain('event: change');
  });
});

function connectMine(ip = '198.51.100.2') {
  const controller = new AbortController();
  open.push(controller);
  const request = new Request('http://localhost/api/mes-sondages/flux', {
    headers: { 'x-real-ip': ip },
    signal: controller.signal,
  });
  return myPollsStream(request);
}

describe('/api/mes-sondages/flux', () => {
  it('répond 404 sans session', async () => {
    expect((await connectMine()).status).toBe(404);
  });

  it('annonce les changements des sondages créés ou répondus par le compte, et d’eux seuls', async () => {
    const me = await createUser();
    const created = await createPoll({ owner: me });
    const answered = await createPoll();
    await createResponse({ poll: answered, days: [dayFromToday(3)], user: me });
    const foreign = await createPoll();
    // Une réponse sans compte, même de son appareil, n'est pas au compte.
    const anonymous = await createPoll();
    await createResponse({ poll: anonymous, days: [dayFromToday(3)] });
    testCookies.set(SESSION.cookieName, await createSessionFor(me.id));

    const response = await connectMine();
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toContain('text/event-stream');
    await readUntil(response, 'event: ready');
    await ready();

    await publish(foreign.id, 'poll');
    await publish(anonymous.id, 'responses');
    await publish(created.id, 'responses');
    let text = await readUntil(response, 'event: change');
    const data = JSON.parse(/data: (\{.*\})/.exec(text.slice(text.indexOf('event: change')))![1]!);
    expect(Object.keys(data).sort()).toEqual(['at', 'kind']);
    expect(data.kind).toBe('responses');
    expect(text.match(/event: change/g)).toHaveLength(1);

    await publish(answered.id, 'poll');
    text = await readUntil(response, '"kind":"poll"');
    for (const poll of [created, answered, foreign, anonymous]) {
      expect(text).not.toContain(poll.id);
      expect(text).not.toContain(poll.publicId);
    }
  });

  it('compte dans la même limite par adresse que les flux des sondages', async () => {
    const me = await createUser();
    const poll = await createPoll({ owner: me });
    testCookies.set(SESSION.cookieName, await createSessionFor(me.id));
    for (let i = 0; i < LIVE_UPDATES.maxStreamsPerIp; i++) {
      expect((await connect(poll.publicId, '192.0.2.30').response).status).toBe(200);
    }
    expect((await connectMine('192.0.2.30')).status).toBe(429);
  });
});
