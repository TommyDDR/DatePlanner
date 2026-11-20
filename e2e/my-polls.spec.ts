import { expect, test, type Page } from '@playwright/test';
import { randomBytes } from 'node:crypto';
import { dayButton, dayFromToday, db, resetDatabase, signUp } from './helpers';

/**
 * « Mes sondages » : les sondages créés, ceux auxquels on a répondu, et une
 * bordure orangée à gauche de ce qui a changé depuis la dernière visite
 * (FR-024, FR-044).
 */

test.beforeEach(resetDatabase);

/** Un sondage de `ownerEmail`, déjà vu par son créateur. */
async function seedPoll(ownerEmail: string, title: string): Promise<string> {
  const owner = await db.user.findUniqueOrThrow({ where: { email: ownerEmail } });
  const publicId = randomBytes(16).toString('base64url');
  const now = new Date();
  await db.poll.create({
    data: {
      publicId,
      ownerId: owner.id,
      title,
      activityAt: now,
      ownerSeenAt: now,
      days: { create: [3, 4].map((offset) => ({ day: new Date(`${dayFromToday(offset)}T00:00:00Z`) })) },
    },
  });
  return publicId;
}

/** Les lignes marquées « du nouveau » d'une liste. */
const news = (page: Page, list: string) => page.getByTestId(list).locator('a[data-news]');

/**
 * Attend que la version courante du sondage soit enregistrée comme vue par
 * son créateur, ou par la réponse du compte `respondentEmail`.
 *
 * On lit la base plutôt que d'attendre la réponse de l'action : Playwright
 * manquait parfois cette réponse, et le test attendait jusqu'à son délai
 * alors que le serveur l'avait traitée en quelques millisecondes.
 */
async function waitUntilSeen(publicId: string, respondentEmail?: string) {
  await expect
    .poll(async () => {
      const poll = await db.poll.findUniqueOrThrow({ where: { publicId } });
      const seenAt = respondentEmail
        ? (
            await db.response.findFirst({
              where: { pollId: poll.id, user: { email: respondentEmail } },
              select: { seenAt: true },
            })
          )?.seenAt
        : poll.ownerSeenAt;
      return seenAt?.getTime() === poll.activityAt.getTime();
    })
    .toBe(true);
}

/** Ouvre le sondage depuis « Mes sondages » et attend que la page ait dit l'avoir affiché. */
async function openFromList(page: Page, list: string, title: string, publicId: string) {
  await page.getByTestId(list).getByRole('link', { name: new RegExp(title) }).click();
  await page.waitForURL(`**/s/${publicId}`);
  await waitUntilSeen(publicId);
}

test('créés, répondus, et du nouveau en direct jusqu’à la prochaine visite', async ({ page, browser }) => {
  const camille = await signUp(page, { name: 'Camille' });
  const publicId = await seedPoll(camille, 'Pique-nique');

  await page.goto('/mes-sondages');
  await expect(page.getByTestId('mes-sondages')).toContainText('Pique-nique');
  await expect(news(page, 'mes-sondages')).toHaveCount(0);
  await expect(page.getByText('Les sondages auxquels vous répondez connecté à ce compte apparaîtront ici.')).toBeVisible();

  // Bob, dans un autre navigateur, répond avec son compte.
  const bobContext = await browser.newContext();
  const bob = await bobContext.newPage();
  const bobEmail = await signUp(bob, { name: 'Bob' });
  await expect(bob.getByText('Vous n’avez pas encore créé de sondage.')).toBeVisible();
  await bob.goto(`/s/${publicId}`);
  await dayButton(bob, dayFromToday(3)).click();
  await bob.getByRole('button', { name: 'Valider ma réponse' }).click();
  await expect(bob.getByText('Votre réponse est enregistrée')).toBeVisible();

  // Pour Bob, sa propre réponse n'a rien de nouveau.
  await bob.goto('/mes-sondages');
  const responded = bob.getByTestId('sondages-repondus');
  await expect(responded).toContainText('Pique-nique');
  await expect(responded).toContainText('Créé par Camille');
  await expect(news(bob, 'sondages-repondus')).toHaveCount(0);

  // Pour Camille, si, et sans recharger : sa page est restée ouverte. L'ouvrir
  // l'efface, même au retour en arrière.
  const marked = news(page, 'mes-sondages');
  await expect(marked).toHaveCount(1);
  await expect(marked).toHaveAccessibleName(/Pique-nique - du nouveau/);
  await expect(marked).toHaveCSS('border-left-width', '4px');
  const ember = await page.evaluate(() => {
    const probe = document.createElement('span');
    probe.style.color = 'var(--color-ember)';
    document.body.append(probe);
    const color = getComputedStyle(probe).color;
    probe.remove();
    return color;
  });
  await expect(marked).toHaveCSS('border-left-color', ember);
  await openFromList(page, 'mes-sondages', 'Pique-nique', publicId);
  await page.goBack();
  await expect(page.getByTestId('mes-sondages')).toContainText('Pique-nique');
  await expect(news(page, 'mes-sondages')).toHaveCount(0);

  // Camille change le titre : du nouveau pour Bob, pas pour elle.
  await page.goto(`/s/${publicId}`);
  const panel = page.getByRole('region', { name: 'Gérer le sondage' });
  await panel.getByLabel('Titre', { exact: true }).fill('Pique-nique au lac');
  await panel.getByRole('button', { name: 'Enregistrer', exact: true }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Pique-nique au lac' })).toBeVisible();
  await page.goto('/mes-sondages');
  await expect(page.getByTestId('mes-sondages')).toContainText('Pique-nique au lac');
  await expect(news(page, 'mes-sondages')).toHaveCount(0);

  // La page de Bob, ouverte depuis sa réponse, s'est mise à jour seule.
  await expect(news(bob, 'sondages-repondus')).toHaveCount(1);
  await expect(responded).toContainText('Pique-nique au lac');

  // Lu dans un autre onglet : la bordure s'efface au retour sur celui-ci.
  const tab = await bobContext.newPage();
  await tab.goto(`/s/${publicId}`);
  await waitUntilSeen(publicId, bobEmail);
  await tab.close();
  await bob.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
  await expect(news(bob, 'sondages-repondus')).toHaveCount(0);

  await bobContext.close();
});
