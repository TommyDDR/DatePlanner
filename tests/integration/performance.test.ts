import { randomUUID } from 'node:crypto';
import { beforeAll, describe, expect, it } from 'vitest';
import { prisma } from '@/server/db/client';
import { getPollSynthesis } from '@/server/polls/read';
import { resetDatabase } from '../helpers/db';
import { createPoll, dayFromToday, sha256 } from '../helpers/factories';

/**
 * SC-005 : un sondage de 60 jours et 100 répondants s'affiche vite. La
 * synthèse est la seule lecture qui grossit avec lui : elle doit rester sous
 * 200 ms, en laissant le reste du budget au réseau et au rendu.
 */

const DAYS = 60;
const RESPONDENTS = 100;

let pollId = '';

beforeAll(async () => {
  await resetDatabase();
  const days = Array.from({ length: DAYS }, (_, index) => dayFromToday(index + 1));
  const poll = await createPoll({ days });
  pollId = poll.id;

  // Chacun coche un jour sur deux, décalé selon son rang : environ 3 000 votes.
  const responses = Array.from({ length: RESPONDENTS }, (_, index) => ({
    id: randomUUID(),
    pollId,
    pseudonym: `Répondant ${index + 1}`,
    deviceTokenHash: sha256(`appareil-${index}`),
  }));
  await prisma.response.createMany({ data: responses });
  await prisma.vote.createMany({
    data: responses.flatMap((response, index) =>
      poll.days.filter((_, rank) => (rank + index) % 2 === 0).map((day) => ({ responseId: response.id, pollDayId: day.id })),
    ),
  });
});

describe('synthèse d’un grand sondage', () => {
  it(`${DAYS} jours et ${RESPONDENTS} répondants : sous 200 ms`, async () => {
    // Un premier appel chauffe la connexion et le moteur de requêtes.
    const warm = await getPollSynthesis(pollId);
    expect(warm).toHaveLength(DAYS);
    expect(warm.reduce((sum, day) => sum + day.count, 0)).toBe((DAYS * RESPONDENTS) / 2);

    const timings: number[] = [];
    for (let run = 0; run < 7; run += 1) {
      const started = performance.now();
      await getPollSynthesis(pollId);
      timings.push(performance.now() - started);
    }
    const median = timings.sort((a, b) => a - b)[Math.floor(timings.length / 2)]!;
    expect(median).toBeLessThan(200);
  });
});
