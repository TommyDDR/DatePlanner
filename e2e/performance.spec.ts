import { expect, test } from '@playwright/test';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { dayFromToday, db, resetDatabase } from './helpers';

/**
 * SC-005 : un sondage de 60 jours et 100 répondants s'affiche complet en moins
 * de 2 s sur un réseau 4G.
 *
 * Joué sur un build de production (`npm run e2e:perf`, décision 040), pas
 * avec les autres parcours.
 */

test.beforeAll(resetDatabase);

const DAYS = 60;
const RESPONDENTS = 100;

async function bigPoll(): Promise<string> {
  const owner = await db.user.create({ data: { email: `grand-${Date.now()}@exemple.test`, displayName: 'Proprio' } });
  const publicId = randomBytes(16).toString('base64url');
  const poll = await db.poll.create({
    data: {
      publicId,
      ownerId: owner.id,
      title: 'Grand sondage',
      days: {
        create: Array.from({ length: DAYS }, (_, index) => ({ day: new Date(`${dayFromToday(index + 1)}T00:00:00Z`) })),
      },
    },
    include: { days: { orderBy: { day: 'asc' } } },
  });
  const responses = Array.from({ length: RESPONDENTS }, (_, index) => ({
    id: randomUUID(),
    pollId: poll.id,
    pseudonym: `Répondant ${index + 1}`,
    deviceTokenHash: createHash('sha256').update(`appareil-${index}`).digest('hex'),
  }));
  await db.response.createMany({ data: responses });
  await db.vote.createMany({
    data: responses.flatMap((response, index) =>
      poll.days.filter((_, rank) => (rank + index) % 2 === 0).map((day) => ({ responseId: response.id, pollDayId: day.id })),
    ),
  });
  return publicId;
}

test('un sondage de 60 jours et 100 répondants s’affiche complet en moins de 2 s sur un réseau 4G', async ({
  page,
  context,
}) => {
  const publicId = await bigPoll();
  // Une première visite chauffe le serveur (connexions à la base, code chargé à la demande) : elle ne compte pas.
  await page.goto(`/s/${publicId}`);

  const cdp = await context.newCDPSession(page);
  await cdp.send('Network.enable');
  // Réseau 4G « lent » : 9 Mb/s descendants, 150 ms de latence.
  await cdp.send('Network.emulateNetworkConditions', {
    offline: false,
    latency: 150,
    downloadThroughput: (9 * 1024 * 1024) / 8,
    uploadThroughput: (1.5 * 1024 * 1024) / 8,
  });

  const started = Date.now();
  await page.goto(`/s/${publicId}`, { waitUntil: 'commit' });
  await page.getByRole('heading', { level: 1, name: 'Grand sondage' }).waitFor({ state: 'visible' });
  // Complet : chaque jour de la synthèse, et le calendrier de réponse.
  await expect(page.getByTestId('disponibilites').locator('li')).toHaveCount(DAYS);
  await page.locator(`[data-day="${dayFromToday(1)}"]`).waitFor({ state: 'visible' });
  const elapsed = Date.now() - started;

  expect(elapsed).toBeLessThan(2000);
});
