import { expect, test } from '@playwright/test';
import { dayButton, dayFromToday, PASSWORD, resetDatabase, uniqueEmail } from './helpers';

/**
 * US1 - Créer un sondage et obtenir son lien de partage (scénarios 1 à 6).
 */

test.beforeAll(resetDatabase);

/** Numéro de semaine ISO 8601 d'un jour `AAAA-MM-JJ`. */
function isoWeek(day: string): number {
  // Le jeudi de la semaine décide de l'année ; la semaine 1 contient le premier jeudi.
  const thursday = new Date(`${day}T00:00:00Z`);
  thursday.setUTCDate(thursday.getUTCDate() + 3 - ((thursday.getUTCDay() + 6) % 7));
  const firstJanuary = Date.UTC(thursday.getUTCFullYear(), 0, 1);
  return Math.floor((thursday.getTime() - firstJanuary) / 86_400_000 / 7) + 1;
}

test('un visiteur crée un compte, un sondage, et partage son lien', async ({ page, browser, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);

  // Scénario 1 : sans compte, la création mène à la connexion, puis y revient.
  await page.goto('/nouveau');
  await expect(page).toHaveURL(/\/connexion\?suite=%2Fnouveau$/);
  await page.getByRole('link', { name: 'Créer un compte' }).click();
  await page.getByLabel('Votre nom').fill('Camille');
  await page.getByLabel('Adresse email').fill(uniqueEmail());
  await page.getByLabel('Mot de passe', { exact: true }).fill(PASSWORD);
  await page.getByRole('button', { name: 'Créer mon compte' }).click();
  await expect(page).toHaveURL(/\/nouveau$/);

  // Scénario 3 : sans titre, le champ est signalé et la saisie gardée.
  await page.getByLabel('Description').fill('Chez Léa, apportez un dessert.');
  await dayButton(page, dayFromToday(3)).click();
  await page.getByRole('button', { name: 'Créer le sondage' }).click();
  await expect(page.getByText('Donnez un titre au sondage.')).toBeVisible();
  await expect(page.getByLabel('Description')).toHaveValue('Chez Léa, apportez un dessert.');

  // Scénario 6 : un jour passé reste inerte.
  const yesterday = dayButton(page, dayFromToday(-1));
  if ((await yesterday.count()) > 0) {
    await expect(yesterday).toHaveAttribute('aria-disabled', 'true');
    // Forcé : Playwright refuse d'emblée un bouton `aria-disabled`, et c'est
    // justement l'effet d'un clic quand même qu'on vérifie.
    await yesterday.click({ force: true });
    await expect(page.locator(`input[type="hidden"][name="days"][value="${dayFromToday(-1)}"]`)).toHaveCount(0);
  }

  await page.getByRole('button', { name: 'Tout effacer' }).click();

  // Scénario 5 : une semaine entière s'ajoute d'un clic, puis se retire.
  const weekButton = page.getByRole('button', { name: `Faire avancer la semaine ${isoWeek(dayFromToday(3))}` });
  await weekButton.click();
  await expect(page.locator(`input[name="days"][value="${dayFromToday(3)}"]`)).toHaveCount(1);
  await weekButton.click();
  await expect(page.locator('input[name="days"]')).toHaveCount(0);

  // Scénario 4 : un glissé marque toute la plage.
  const from = await dayButton(page, dayFromToday(3)).boundingBox();
  const to = await dayButton(page, dayFromToday(5)).boundingBox();
  await page.mouse.move(from!.x + from!.width / 2, from!.y + from!.height / 2);
  await page.mouse.down();
  await page.mouse.move(to!.x + to!.width / 2, to!.y + to!.height / 2, { steps: 5 });
  await page.mouse.up();
  for (const offset of [3, 4, 5]) {
    await expect(page.locator(`input[name="days"][value="${dayFromToday(offset)}"]`)).toHaveCount(1);
  }

  // Scénario 2 : création, lien de partage, copie.
  await page.getByLabel('Titre du sondage').fill('Dîner de rentrée');
  await page.getByRole('button', { name: 'Créer le sondage' }).click();
  await expect(page).toHaveURL(/\/s\/[A-Za-z0-9_-]{22}\?cree=1$/);
  const link = await page.getByLabel('Lien du sondage').inputValue();
  expect(link).toMatch(/\/s\/[A-Za-z0-9_-]{22}$/);
  await page.getByRole('button', { name: 'Copier le lien' }).click();
  await expect(page.getByText('Lien copié : collez-le dans un message.')).toBeVisible();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(link);

  // Le lien ouvert ailleurs, sans session : titre, description et jours.
  const guest = await browser.newContext();
  const guestPage = await guest.newPage();
  await guestPage.goto(new URL(link).pathname);
  await expect(guestPage.getByRole('heading', { level: 1, name: 'Dîner de rentrée' })).toBeVisible();
  await expect(guestPage.getByText('Chez Léa, apportez un dessert.')).toBeVisible();
  await expect(guestPage.getByRole('heading', { name: 'Qui est disponible ?' })).toBeVisible();
  for (const offset of [3, 4, 5]) await expect(guestPage.locator(`[data-day="${dayFromToday(offset)}"]`)).toBeVisible();
  await expect(guestPage.getByText('Sondage créé : partagez-le')).toHaveCount(0);
  await guest.close();
});
