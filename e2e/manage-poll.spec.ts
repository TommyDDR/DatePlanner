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

/** « lundi 5 octobre 2026 » : un jour écrit comme sur les pages. */
const longDay = (day: string) =>
  new Intl.DateTimeFormat('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }).format(
    new Date(`${day}T12:00:00Z`),
  );

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

  // Scénarios 6 et 7, sur le seul calendrier : un jour voté est gris et ne
  // bouge pas ; un jour orangé se retire, un jour libre s'ajoute, et les deux
  // partent ensemble.
  const panelDay = (day: string) => panel(page).getByRole('grid', { name: /^Jours proposés,/ }).locator(`[data-day="${day}"]`);
  await expect(panel(page).getByRole('button', { name: /Retirer/ })).toHaveCount(0);
  await expect(panelDay(dayFromToday(3))).toHaveAttribute('data-locked', '');
  await expect(panelDay(dayFromToday(3))).toHaveAttribute('aria-disabled', 'true');
  await expect(panelDay(dayFromToday(4))).toHaveAttribute('data-mark', 'fill');
  await panelDay(dayFromToday(3)).click({ force: true });
  await expect(panelDay(dayFromToday(3))).not.toHaveAttribute('data-withdrawn');
  const save = panel(page).getByRole('button', { name: 'Enregistrer les jours' });
  await expect(save).toBeDisabled();
  await panelDay(dayFromToday(4)).click();
  await expect(panelDay(dayFromToday(4))).toHaveAttribute('data-withdrawn', '');
  await panelDay(dayFromToday(6)).click();
  await expect(panel(page).getByText('1 jour à ajouter · 1 jour à retirer')).toBeVisible();
  await save.click();
  await expect(panel(page).getByText('Jours enregistrés.')).toBeVisible();
  await expect(panelDay(dayFromToday(4))).not.toHaveAttribute('data-mark');
  await expect(panelDay(dayFromToday(4))).not.toHaveAttribute('data-withdrawn');
  await expect(panelDay(dayFromToday(6))).toHaveAttribute('data-mark', 'fill');
  // La date retenue se choisit au calendrier, parmi les seuls jours proposés ;
  // le plus voté se prend aussi d'une touche.
  const retainedDay = (day: string) =>
    panel(page).getByRole('grid', { name: /^Date retenue,/ }).locator(`[data-day="${day}"]`);
  await expect(retainedDay(dayFromToday(4))).toHaveAttribute('aria-disabled', 'true');
  await expect(retainedDay(dayFromToday(6))).not.toHaveAttribute('aria-disabled');
  const favorite = panel(page).getByRole('button', { name: /, 1 vote$/ });
  await expect(favorite).toHaveAttribute('aria-pressed', 'false');
  await favorite.click();
  await expect(favorite).toHaveAttribute('aria-pressed', 'true');
  await expect(retainedDay(dayFromToday(3))).toHaveAttribute('data-match', '');
  await panel(page).getByRole('button', { name: 'Sans date retenue' }).click();
  await expect(panel(page).getByText('Aucune date retenue')).toBeVisible();
  await expect(retainedDay(dayFromToday(3))).not.toHaveAttribute('data-match');

  // Scénario 9 : répondants connectés uniquement.
  await panel(page).getByLabel('Répondants connectés uniquement').check();
  await panel(page).getByRole('button', { name: 'Enregistrer les options' }).click();
  await expect(panel(page).getByText('Options enregistrées.')).toBeVisible();

  // Scénario 8 : supprimer la réponse de Léa.
  await panel(page).getByRole('button', { name: 'Supprimer', exact: true }).click();
  await panel(page).getByRole('button', { name: 'Supprimer la réponse' }).click();
  await expect(panel(page).getByText('Aucune réponse pour l’instant.')).toBeVisible();

  // Scénario 4 : clore en désignant la date retenue.
  // Un jour repris est rendu.
  await retainedDay(dayFromToday(6)).click();
  await expect(retainedDay(dayFromToday(6))).toHaveAttribute('data-match', '');
  await retainedDay(dayFromToday(6)).click();
  await expect(retainedDay(dayFromToday(6))).not.toHaveAttribute('data-match');
  await expect(panel(page).getByText('Aucune date retenue')).toBeVisible();
  await retainedDay(dayFromToday(6)).click();
  await expect(retainedDay(dayFromToday(6))).toHaveAttribute('data-match', '');
  await panel(page).getByRole('button', { name: 'Clore le sondage' }).click();
  const banner = page.getByTestId('bandeau-clos');
  await expect(banner).toBeVisible();
  await expect(banner).toContainText('Date retenue');
  await expect(page.getByRole('button', { name: 'Valider ma réponse' })).toHaveCount(0);
  await expect(dayButton(page, dayFromToday(6)).first()).toHaveAttribute('data-retained', '');

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

test('un sondage créé pour plusieurs dates retenues se clôt sur plusieurs jours', async ({ page }) => {
  await signUp(page, { name: 'Camille' });
  const [first, second, third] = [dayFromToday(3), dayFromToday(4), dayFromToday(5)];

  // À la création, l'option permet de retenir plusieurs jours à la clôture.
  await page.goto('/nouveau');
  await page.getByLabel('Titre du sondage').fill('Stage de voile');
  for (const day of [first, second, third]) await dayButton(page, day).click();
  await page.getByLabel(/^Plusieurs dates retenues/).check();
  await page.getByRole('button', { name: 'Créer le sondage' }).click();
  await expect(panel(page)).toBeVisible();
  await expect(panel(page).getByLabel('Plusieurs dates retenues')).toBeChecked();

  // Chaque jour proposé s'ajoute aux dates retenues, d'un clic.
  const retainedDay = (day: string) =>
    panel(page).getByRole('grid', { name: /^Dates retenues,/ }).locator(`[data-day="${day}"]`);
  await retainedDay(first).click();
  await retainedDay(third).click();
  await expect(retainedDay(first)).toHaveAttribute('data-match', '');
  await expect(retainedDay(third)).toHaveAttribute('data-match', '');
  await expect(retainedDay(second)).not.toHaveAttribute('data-match');
  await expect(panel(page).getByText(/^Retenues :/)).toBeVisible();
  await panel(page).getByRole('button', { name: 'Clore le sondage' }).click();

  const banner = page.getByTestId('bandeau-clos');
  await expect(banner).toContainText('Dates retenues');
  await expect(dayButton(page, first).first()).toHaveAttribute('data-retained', '');
  await expect(dayButton(page, third).first()).toHaveAttribute('data-retained', '');
  await expect(dayButton(page, second).first()).not.toHaveAttribute('data-retained');

  // Revenir à une seule date retenue n'est permis qu'une fois les autres rendues.
  await panel(page).getByLabel('Plusieurs dates retenues').uncheck();
  await panel(page).getByRole('button', { name: 'Enregistrer les options' }).click();
  await expect(panel(page).getByText(/^Plusieurs dates sont retenues/)).toBeVisible();

  // « Mes sondages » montre les deux dates.
  await page.goto('/mes-sondages');
  const row = page.getByTestId('mes-sondages').getByRole('link', { name: /Stage de voile/ });
  for (const day of [first, third]) await expect(row).toContainText(longDay(day));
  await expect(row).not.toContainText(longDay(second));
});

test('un vote arrivé pendant qu’on prépare un retrait verrouille le jour, et le créateur en est averti', async ({
  page,
  browser,
}) => {
  const email = await signUp(page, { name: 'Camille' });
  const [kept, withdrawn] = [dayFromToday(3), dayFromToday(4)];
  const publicId = await seedPoll(email, 'Pique-nique', [kept, withdrawn]);
  await page.goto(`/s/${publicId}`);
  const panelDay = (day: string) => panel(page).getByRole('grid', { name: /^Jours proposés,/ }).locator(`[data-day="${day}"]`);
  await panelDay(withdrawn).click();
  await expect(panelDay(withdrawn)).toHaveAttribute('data-withdrawn', '');
  // Laisse au flux le temps de s'ouvrir (première compilation de la route).
  await page.waitForTimeout(1500);

  const guestContext = await browser.newContext();
  const guest = await guestContext.newPage();
  await guest.goto(`/s/${publicId}`);
  await guest.getByLabel('Votre nom ou un pseudo').fill('Léa');
  await dayButton(guest, withdrawn).click();
  await guest.getByRole('button', { name: 'Valider ma réponse' }).click();
  await expect(guest.getByText('Votre réponse est enregistrée')).toBeVisible();

  // Sans recharger : le jour passe au gris, le retrait tombe, et on le dit.
  await expect(panelDay(withdrawn)).toHaveAttribute('data-locked', '', { timeout: 5000 });
  await expect(panelDay(withdrawn)).not.toHaveAttribute('data-withdrawn');
  await expect(panel(page).getByTestId('retrait-devance')).toContainText('vient de recevoir un vote');
  await expect(panel(page).getByRole('button', { name: 'Enregistrer les jours' })).toBeDisabled();
  expect(await db.pollDay.count({ where: { poll: { publicId } } })).toBe(2);
  await guestContext.close();
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
