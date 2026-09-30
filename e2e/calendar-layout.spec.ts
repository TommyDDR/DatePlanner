import { expect, test, type Locator, type Page } from '@playwright/test';
import { randomBytes } from 'node:crypto';
import { dayButton, dayFromToday, db, resetDatabase, signInAs } from './helpers';

/**
 * Disposition du calendrier : deux mois pour proposer des jours, un ou deux
 * pour répondre selon les jours proposés ; des cases carrées, des grilles à
 * leur taille et centrées, quelle que soit la largeur disponible.
 */

test.beforeAll(resetDatabase);

/** 1,75rem de numéros de semaine et sept cases de 2,75rem au plus. */
const MAX_GRID_WIDTH = 21 * 16;

const MONTH_TITLE = new Intl.DateTimeFormat('fr-FR', { month: 'long', year: 'numeric', timeZone: 'UTC' });

function monthTitle(day: string): string {
  const title = MONTH_TITLE.format(new Date(`${day.slice(0, 7)}-15T12:00:00Z`));
  return title.charAt(0).toUpperCase() + title.slice(1);
}

/** Le `day`-ième jour du mois situé `offset` mois après celui d'aujourd'hui (Paris). */
function dayOfMonthFromNow(offset: number, day: number): string {
  const today = dayFromToday(0);
  const date = new Date(Date.UTC(Number(today.slice(0, 4)), Number(today.slice(5, 7)) - 1 + offset, day));
  return date.toISOString().slice(0, 10);
}

async function createPoll(days: string[]): Promise<string> {
  const owner = await db.user.create({
    data: { email: `grille-${Date.now()}-${randomBytes(3).toString('hex')}@exemple.test`, displayName: 'Proprio' },
  });
  const publicId = randomBytes(16).toString('base64url');
  await db.poll.create({
    data: {
      publicId,
      ownerId: owner.id,
      title: 'Disposition',
      days: { create: days.map((day) => ({ day: new Date(`${day}T00:00:00Z`) })) },
    },
  });
  return publicId;
}

async function gridNames(page: Page): Promise<(string | null)[]> {
  return page.getByRole('grid').evaluateAll((grids) => grids.map((grid) => grid.getAttribute('aria-label')));
}

/** Cases carrées, grille plafonnée à sa largeur. */
async function expectProportions(page: Page, day: string, grid: Locator) {
  const cell = (await dayButton(page, day).first().boundingBox())!;
  expect(Math.abs(cell.width - cell.height)).toBeLessThanOrEqual(1);
  expect((await grid.boundingBox())!.width).toBeLessThanOrEqual(MAX_GRID_WIDTH + 1);
}

test('création : deux mois consécutifs, chaque jour une seule fois', async ({ browser, baseURL }) => {
  const user = await db.user.create({ data: { email: `creation-${Date.now()}@exemple.test`, displayName: 'Camille' } });
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  await signInAs(context, user.id, baseURL!);
  const page = await context.newPage();
  await page.goto('/nouveau');

  const names = await gridNames(page);
  expect(names).toEqual([
    `Jours proposés, ${monthTitle(dayOfMonthFromNow(0, 1))}`,
    `Jours proposés, ${monthTitle(dayOfMonthFromNow(1, 1))}`,
  ]);
  // Les jours voisins ne sont pas rendus : le 1er du mois suivant n'existe qu'une fois.
  await expect(dayButton(page, dayOfMonthFromNow(1, 1))).toHaveCount(1);
  // Côte à côte sur un écran large.
  const [first, second] = [page.getByRole('grid').nth(0), page.getByRole('grid').nth(1)];
  expect((await first.boundingBox())!.y).toBeCloseTo((await second.boundingBox())!.y, 0);
  await expectProportions(page, dayOfMonthFromNow(1, 10), second);

  // Le mois suivant, par la flèche : la fenêtre glisse d'un mois.
  await page.getByRole('button', { name: 'Mois suivant' }).click();
  expect(await gridNames(page)).toEqual([
    `Jours proposés, ${monthTitle(dayOfMonthFromNow(1, 1))}`,
    `Jours proposés, ${monthTitle(dayOfMonthFromNow(2, 1))}`,
  ]);
  await context.close();
});

test('création sur téléphone : les deux mois l’un sous l’autre, sans défilement horizontal', async ({ browser, baseURL }) => {
  const user = await db.user.create({ data: { email: `mobile-${Date.now()}@exemple.test`, displayName: 'Camille' } });
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await signInAs(context, user.id, baseURL!);
  const page = await context.newPage();
  await page.goto('/nouveau');
  const [first, second] = [page.getByRole('grid').nth(0), page.getByRole('grid').nth(1)];
  expect((await second.boundingBox())!.y).toBeGreaterThan((await first.boundingBox())!.y + 100);
  await expectProportions(page, dayOfMonthFromNow(1, 10), second);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(0);
  await context.close();
});

test('réponse : un mois quand les jours proposés y tiennent, deux sinon', async ({ page }) => {
  const oneMonth = await createPoll([dayOfMonthFromNow(1, 10), dayOfMonthFromNow(1, 12)]);
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto(`/s/${oneMonth}`);
  expect(await gridNames(page)).toEqual([`Vos disponibilités, ${monthTitle(dayOfMonthFromNow(1, 1))}`]);
  // Un seul mois : la grille garde sa taille, au centre de son cadre.
  const grid = page.getByRole('grid');
  await expectProportions(page, dayOfMonthFromNow(1, 10), grid);
  const frame = (await page.locator('.date-picker').boundingBox())!;
  const box = (await grid.boundingBox())!;
  expect(Math.abs(frame.x + frame.width / 2 - (box.x + box.width / 2))).toBeLessThanOrEqual(2);

  const twoMonths = await createPoll([dayOfMonthFromNow(1, 10), dayOfMonthFromNow(2, 5)]);
  await page.goto(`/s/${twoMonths}`);
  expect(await gridNames(page)).toEqual([
    `Vos disponibilités, ${monthTitle(dayOfMonthFromNow(1, 1))}`,
    `Vos disponibilités, ${monthTitle(dayOfMonthFromNow(2, 1))}`,
  ]);
  for (const day of [dayOfMonthFromNow(1, 10), dayOfMonthFromNow(2, 5)]) await expect(dayButton(page, day)).toBeVisible();
});
