import { expect, test } from '@playwright/test';
import { randomBytes } from 'node:crypto';
import { dayButton, dayFromToday, db, resetDatabase } from './helpers';

/**
 * US3 - Voir qui est disponible, à jour pour tout le monde (scénarios 1 à 5,
 * SC-003, SC-008, cas limite « plusieurs mois »).
 */

test.beforeEach(resetDatabase);

async function createPoll(days: string[]): Promise<string> {
  const owner = await db.user.create({ data: { email: `proprio-${Date.now()}@exemple.test`, displayName: 'Proprio' } });
  const publicId = randomBytes(16).toString('base64url');
  await db.poll.create({
    data: {
      publicId,
      ownerId: owner.id,
      title: 'Week-end au vert',
      days: { create: days.map((day) => ({ day: new Date(`${day}T00:00:00Z`) })) },
    },
  });
  return publicId;
}

test('une réponse apparaît chez les autres en moins de cinq secondes, sans recharger', async ({ browser }) => {
  const day = dayFromToday(3);
  const publicId = await createPoll([day, dayFromToday(4)]);

  const viewerContext = await browser.newContext();
  const viewer = await viewerContext.newPage();
  await viewer.goto(`/s/${publicId}`);
  await expect(dayButton(viewer, day)).not.toHaveAttribute('data-votes');
  await expect(viewer.getByText('Personne n’a encore répondu.')).toBeVisible();
  // Laisse au flux le temps de s'ouvrir (première compilation de la route).
  await viewer.waitForTimeout(1500);

  const respondentContext = await browser.newContext();
  const respondent = await respondentContext.newPage();
  await respondent.goto(`/s/${publicId}`);
  await respondent.getByLabel('Votre nom ou un pseudo').fill('Léa');
  await dayButton(respondent, day).click();
  await respondent.getByRole('button', { name: 'Valider ma réponse' }).click();
  await expect(respondent.getByText('Votre réponse est enregistrée')).toBeVisible();

  // Scénarios 1 et 5 : la pastille arrive chez l'autre, sans rechargement.
  await expect(dayButton(viewer, day)).toHaveAttribute('data-votes', '1', { timeout: 5000 });
  await expect(dayButton(viewer, dayFromToday(4))).not.toHaveAttribute('data-votes');

  // Scénario 3 : survol et focus clavier montrent les votants.
  await dayButton(viewer, day).hover();
  const tooltip = viewer.getByRole('tooltip');
  await expect(tooltip).toBeVisible();
  await expect(tooltip).toContainText('Léa');
  await expect(tooltip).toContainText('1 vote');
  await viewer.mouse.move(0, 0);
  await dayButton(viewer, day).focus();
  await expect(viewer.getByRole('tooltip')).toBeVisible();

  // La liste « Qui est disponible ? » dit la même chose.
  await expect(viewer.getByTestId('disponibilites')).toContainText('Léa');

  await viewerContext.close();
  await respondentContext.close();
});

test('sur téléphone, la liste des disponibilités reste lisible sans survol', async ({ browser }) => {
  const day = dayFromToday(3);
  const publicId = await createPoll([day]);
  const poll = await db.poll.findUniqueOrThrow({ where: { publicId }, include: { days: true } });
  await db.response.create({
    data: {
      pollId: poll.id,
      pseudonym: 'Noé',
      deviceTokenHash: randomBytes(32).toString('hex'),
      votes: { create: [{ pollDayId: poll.days[0]!.id }] },
    },
  });

  const phone = await browser.newContext({ viewport: { width: 375, height: 740 }, hasTouch: true, isMobile: true });
  const page = await phone.newPage();
  await page.goto(`/s/${publicId}`);
  await expect(page.getByTestId('disponibilites')).toContainText('Noé');
  await expect(dayButton(page, day)).toHaveAttribute('data-votes', '1');
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);
  await phone.close();
});

test('un sondage sur plusieurs mois s’ouvre sur le premier jour à venir et signale ses mois', async ({ page }) => {
  const first = dayFromToday(3);
  const later = dayFromToday(40);
  const publicId = await createPoll([dayFromToday(-5), first, later]);
  await page.goto(`/s/${publicId}`);
  await expect(dayButton(page, first)).toBeVisible();
  const chips = page.locator('[data-marked-month]');
  await expect(chips).toHaveCount(new Set([dayFromToday(-5), first, later].map((d) => d.slice(0, 7))).size);
  await chips.last().click();
  await expect(dayButton(page, later)).toBeVisible();
});
