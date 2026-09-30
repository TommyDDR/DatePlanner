import { expect, test, type Page } from '@playwright/test';
import { randomBytes } from 'node:crypto';
import { dayButton, dayFromToday, db, resetDatabase, signUp } from './helpers';

/**
 * US2 - Répondre à un sondage, avec ou sans compte (scénarios 1 à 8, et le
 * cas limite « se connecte ensuite »).
 */

test.beforeEach(resetDatabase);

async function createPoll(options: { requireAccount?: boolean; days?: string[] } = {}): Promise<string> {
  const owner = await db.user.create({ data: { email: `proprio-${Date.now()}@exemple.test`, displayName: 'Proprio' } });
  const publicId = randomBytes(16).toString('base64url');
  await db.poll.create({
    data: {
      publicId,
      ownerId: owner.id,
      title: 'Pique-nique',
      requireAccount: options.requireAccount ?? false,
      days: {
        create: (options.days ?? [dayFromToday(3), dayFromToday(5)]).map((day) => ({ day: new Date(`${day}T00:00:00Z`) })),
      },
    },
  });
  return publicId;
}

async function respond(page: Page, pseudonym: string | null, days: string[]) {
  if (pseudonym !== null) await page.getByLabel('Votre nom ou un pseudo').fill(pseudonym);
  for (const day of days) await dayButton(page, day).click();
}

test('répondre sans compte, retrouver, modifier puis retirer sa réponse', async ({ page }) => {
  const publicId = await createPoll();
  await page.goto(`/s/${publicId}`);

  // Scénario 5 : pseudo vide refusé.
  await page.getByLabel('Votre nom ou un pseudo').fill('   ');
  await dayButton(page, dayFromToday(3)).click();
  await page.getByRole('button', { name: 'Valider ma réponse' }).click();
  await expect(page.getByText('Indiquez votre nom ou un pseudo.')).toBeVisible();

  // Scénario 3 : un jour non proposé est inerte.
  const notProposed = dayButton(page, dayFromToday(4));
  await expect(notProposed).toHaveAttribute('aria-disabled', 'true');
  await notProposed.click({ force: true });
  await expect(page.locator(`input[name="days"][value="${dayFromToday(4)}"]`)).toHaveCount(0);

  // Scénario 1 : réponse sans compte.
  await page.getByLabel('Votre nom ou un pseudo').fill('Léa');
  await page.getByRole('button', { name: 'Valider ma réponse' }).click();
  await expect(page.getByText('Votre réponse est enregistrée')).toBeVisible();

  // Scénario 7 : au retour, la réponse est retrouvée et modifiable.
  await page.reload();
  await expect(page.getByLabel('Votre nom ou un pseudo')).toHaveValue('Léa');
  await expect(page.locator(`input[name="days"][value="${dayFromToday(3)}"]`)).toHaveCount(1);
  await dayButton(page, dayFromToday(5)).click();
  await page.getByRole('button', { name: 'Mettre à jour' }).click();
  await expect(page.locator(`input[name="days"][value="${dayFromToday(5)}"]`)).toHaveCount(1);
  await expect.poll(async () => db.vote.count()).toBe(2);

  await page.getByRole('button', { name: 'Retirer ma réponse' }).click();
  await expect(page.getByRole('button', { name: 'Valider ma réponse' })).toBeVisible();
  expect(await db.response.count()).toBe(0);
});

test('un sondage qui exige un compte n’offre pas de pseudo', async ({ page }) => {
  const publicId = await createPoll({ requireAccount: true });
  await page.goto(`/s/${publicId}`);
  await expect(page.getByLabel('Votre nom ou un pseudo')).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'Se connecter pour répondre' })).toBeVisible();
});

test('répondre sous son compte, puis retrouver sa réponse anonyme une fois déconnecté', async ({ page }) => {
  const publicId = await createPoll();

  // Réponse anonyme d'abord.
  await page.goto(`/s/${publicId}`);
  await respond(page, 'Léa anonyme', [dayFromToday(3)]);
  await page.getByRole('button', { name: 'Valider ma réponse' }).click();
  await expect(page.getByText('Votre réponse est enregistrée')).toBeVisible();

  // Scénario 2 et cas limite : connecté, le formulaire est vierge et au nom du compte.
  await signUp(page, { name: 'Léa Compte' });
  await page.goto(`/s/${publicId}`);
  await expect(page.getByText('Vous répondez sous le nom de')).toContainText('Léa Compte');
  await expect(page.locator('input[name="days"]')).toHaveCount(0);
  await respond(page, null, [dayFromToday(5)]);
  await page.getByRole('button', { name: 'Valider ma réponse' }).click();
  await expect(page.getByText('Votre réponse est enregistrée')).toBeVisible();
  expect(await db.response.count()).toBe(2);

  // Déconnecté : la réponse anonyme de l'appareil revient.
  await page.context().clearCookies({ name: 'dp_session' });
  await page.goto(`/s/${publicId}`);
  await expect(page.getByLabel('Votre nom ou un pseudo')).toHaveValue('Léa anonyme');
  await expect(page.locator(`input[name="days"][value="${dayFromToday(3)}"]`)).toHaveCount(1);
});
