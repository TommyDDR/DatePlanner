import { expect, test, type Browser, type Page } from '@playwright/test';
import { randomBytes } from 'node:crypto';
import { dayButton, dayCenter, dayFromToday, db, finger, resetDatabase, signUp } from './helpers';

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

  // Le jour choisi est en vert, et la légende le nomme.
  await expect(dayButton(page, dayFromToday(3))).toHaveAttribute('data-match', '');
  await expect(dayButton(page, dayFromToday(3))).toHaveAccessibleName(/jour choisi/);
  await expect(page.locator('.date-picker').getByText('jour choisi', { exact: true })).toBeVisible();

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

test('une tape au doigt choisit le jour même quand le clic arrive après coup, comme sur iPhone', async ({ page }) => {
  const publicId = await createPoll();
  await page.goto(`/s/${publicId}`);
  // Un premier choix ordinaire : la page est hydratée.
  await dayButton(page, dayFromToday(5)).click();
  await expect(dayButton(page, dayFromToday(5))).toHaveAttribute('data-mark', 'fill');

  // Safari sur iPhone envoie le clic d'une tape bien après le relâcher, une
  // fois la tape reconnue, et sur le bouton malgré la capture du pointeur.
  await dayButton(page, dayFromToday(3)).evaluate(async (button) => {
    const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
    const { left, top, width, height } = button.getBoundingClientRect();
    const init = {
      bubbles: true,
      cancelable: true,
      composed: true,
      pointerId: 1,
      pointerType: 'touch',
      isPrimary: true,
      button: 0,
      clientX: left + width / 2,
      clientY: top + height / 2,
    };
    button.dispatchEvent(new PointerEvent('pointerdown', init));
    await pause(20);
    button.dispatchEvent(new PointerEvent('pointerup', { ...init, buttons: 0 }));
    await pause(100);
    button.dispatchEvent(new MouseEvent('click', { ...init, detail: 1 }));
  });

  await expect(dayButton(page, dayFromToday(3))).toHaveAttribute('data-mark', 'fill');
  await expect(page.locator(`input[name="days"][value="${dayFromToday(3)}"]`)).toHaveCount(1);
});

/** Un téléphone, la page du sondage ouverte et hydratée : une tape a choisi le dernier jour. */
async function openOnPhone(browser: Browser, publicId: string, last: string) {
  const phone = await browser.newContext({ viewport: { width: 375, height: 740 }, hasTouch: true, isMobile: true });
  const page = await phone.newPage();
  await page.goto(`/s/${publicId}`);
  await dayButton(page, last).tap();
  await expect(dayButton(page, last)).toHaveAttribute('data-mark', 'fill');
  // Le calendrier au milieu de l'écran : le doigt a de la place des deux côtés.
  await dayButton(page, dayFromToday(3)).evaluate((button) => button.scrollIntoView({ block: 'center', behavior: 'instant' }));
  return { phone, page, scrollY: () => page.evaluate(() => window.scrollY) };
}

test('au doigt, un geste qui part du calendrier fait défiler la page sans rien choisir', async ({ browser }) => {
  const publicId = await createPoll({ days: [dayFromToday(3), dayFromToday(4), dayFromToday(5)] });
  const { phone, page, scrollY } = await openOnPhone(browser, publicId, dayFromToday(5));
  const before = await scrollY();

  const from = await dayCenter(page, dayFromToday(3));
  const touch = await finger(page);
  await touch.down(from.x, from.y);
  await touch.move(from.x, from.y - 200);
  await touch.up();

  await expect.poll(scrollY).toBeGreaterThan(before + 100);
  await expect(dayButton(page, dayFromToday(3))).not.toHaveAttribute('data-mark');
  await expect(page.locator('input[name="days"]')).toHaveCount(1);
  await phone.close();
});

test('au doigt, un appui long puis un glissé marque la plage, sans faire défiler la page', async ({ browser }) => {
  const publicId = await createPoll({ days: [dayFromToday(3), dayFromToday(4), dayFromToday(5), dayFromToday(6)] });
  const { phone, page, scrollY } = await openOnPhone(browser, publicId, dayFromToday(6));
  const before = await scrollY();

  const from = await dayCenter(page, dayFromToday(3));
  const to = await dayCenter(page, dayFromToday(5));
  const touch = await finger(page);
  await touch.down(from.x, from.y);
  await page.waitForTimeout(600);
  await touch.move(to.x, to.y);
  await touch.up();

  for (const offset of [3, 4, 5]) {
    await expect(page.locator(`input[name="days"][value="${dayFromToday(offset)}"]`)).toHaveCount(1);
  }
  expect(await scrollY()).toBe(before);
  await phone.close();
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
