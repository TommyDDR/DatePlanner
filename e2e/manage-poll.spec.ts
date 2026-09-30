import { expect, test, type Page } from '@playwright/test';
import { randomBytes } from 'node:crypto';
import { dayButton, dayFromToday, db, resetDatabase, signUp } from './helpers';

/**
 * US5 - Gérer ses sondages (scénarios 1 à 10).
 */

test.beforeEach(resetDatabase);

async function seedPoll(ownerEmail: string, title: string, days: string[]): Promise<string> {
  const owner = await db.user.findUniqueOrThrow({ where: { email: ownerEmail } });
  const publicId = randomBytes(16).toString('base64url');
  await db.poll.create({
    data: { publicId, ownerId: owner.id, title, days: { create: days.map((day) => ({ day: new Date(`${day}T00:00:00Z`) })) } },
  });
  return publicId;
}

async function addAnonymousVote(publicId: string, pseudonym: string, day: string) {
  const poll = await db.poll.findUniqueOrThrow({ where: { publicId }, include: { days: true } });
  const pollDay = poll.days.find((d) => d.day.toISOString().slice(0, 10) === day)!;
  await db.response.create({
    data: {
      pollId: poll.id,
      pseudonym,
      deviceTokenHash: randomBytes(32).toString('hex'),
      votes: { create: [{ pollDayId: pollDay.id }] },
    },
  });
}

const panel = (page: Page) => page.getByRole('region', { name: 'Gérer le sondage' });

test('le créateur gère son sondage de bout en bout', async ({ page }) => {
  const email = await signUp(page, { name: 'Camille' });
  const first = await seedPoll(email, 'Pique-nique', [dayFromToday(3), dayFromToday(4)]);
  await seedPoll(email, 'Réunion', [dayFromToday(5)]);
  await addAnonymousVote(first, 'Léa', dayFromToday(3));

  // Scénario 1 : « Mes sondages ».
  await page.goto('/mes-sondages');
  const list = page.getByTestId('mes-sondages');
  await expect(list.getByRole('link')).toHaveCount(2);
  await expect(list).toContainText('Pique-nique');
  await expect(list).toContainText('1 répondant');

  await list.getByRole('link', { name: /Pique-nique/ }).click();
  await expect(panel(page)).toBeVisible();

  // Scénario 2 : modifier le titre.
  await panel(page).getByLabel('Titre', { exact: true }).fill('Pique-nique au lac');
  await panel(page).getByRole('button', { name: 'Enregistrer', exact: true }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Pique-nique au lac' })).toBeVisible();

  // Scénario 6 : ajouter un jour.
  await panel(page).locator(`[data-day="${dayFromToday(6)}"]`).click();
  await panel(page).getByRole('button', { name: 'Ajouter ces jours' }).click();
  await expect(panel(page).getByRole('button', { name: /Retirer le/ })).toHaveCount(2);

  // Scénario 7 : un jour voté ne s'offre pas au retrait.
  const votedDay = panel(page).locator('li', { hasText: '1 vote' });
  await expect(votedDay.getByRole('button', { name: /Retirer/ })).toHaveCount(0);

  // Scénario 9 : répondants connectés uniquement.
  await panel(page).getByLabel('Répondants connectés uniquement').check();
  await panel(page).getByRole('button', { name: 'Enregistrer les options' }).click();
  await expect(panel(page).getByText('Options enregistrées.')).toBeVisible();

  // Scénario 8 : supprimer la réponse de Léa.
  await panel(page).getByRole('button', { name: 'Supprimer', exact: true }).click();
  await panel(page).getByRole('button', { name: 'Supprimer la réponse' }).click();
  await expect(panel(page).getByText('Aucune réponse pour l’instant.')).toBeVisible();

  // Scénario 4 : clore en désignant la date retenue.
  await panel(page).getByLabel('Date retenue').selectOption(dayFromToday(4));
  await panel(page).getByRole('button', { name: 'Clore le sondage' }).click();
  const banner = page.getByTestId('bandeau-clos');
  await expect(banner).toBeVisible();
  await expect(banner).toContainText('Date retenue');
  await expect(page.getByRole('button', { name: 'Valider ma réponse' })).toHaveCount(0);
  await expect(dayButton(page, dayFromToday(4)).first()).toHaveAttribute('data-retained', '');

  // Scénario 5 : rouvrir efface la date retenue.
  await panel(page).getByRole('button', { name: 'Rouvrir le sondage' }).click();
  await expect(banner).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Valider ma réponse' })).toBeVisible();

  // Scénario 3 : supprimer le sondage.
  const url = page.url();
  await panel(page).getByRole('button', { name: 'Supprimer le sondage' }).click();
  await panel(page).getByRole('button', { name: 'Supprimer définitivement' }).click();
  await expect(page).toHaveURL(/\/mes-sondages$/);
  await expect(page.getByTestId('mes-sondages').getByRole('link')).toHaveCount(1);
  await page.goto(url);
  await expect(page.getByRole('heading', { name: 'Introuvable' })).toBeVisible();
});

test('un autre compte ne voit aucun panneau de gestion', async ({ page, browser }) => {
  const email = await signUp(page, { name: 'Camille' });
  const publicId = await seedPoll(email, 'Pique-nique', [dayFromToday(3)]);
  const other = await browser.newContext();
  const otherPage = await other.newPage();
  await signUp(otherPage, { name: 'Autre' });
  await otherPage.goto(`/s/${publicId}`);
  await expect(otherPage.getByRole('heading', { level: 1, name: 'Pique-nique' })).toBeVisible();
  await expect(panel(otherPage)).toHaveCount(0);
  await other.close();
});
