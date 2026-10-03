import { expect, test, type Page } from '@playwright/test';
import { randomBytes } from 'node:crypto';
import { adminAccount, dayFromToday, db, resetDatabase, signInAs, uniqueEmail } from './helpers';

/**
 * Administration (FR-046 à FR-048, décision 042) : un menu et deux écrans
 * pour le seul administrateur, « introuvables » pour tout autre compte.
 */

test.beforeAll(resetDatabase);

const PHONE = { width: 390, height: 844 };

async function account(displayName: string): Promise<string> {
  const user = await db.user.create({ data: { email: uniqueEmail('admin'), displayName, emailProvedAt: new Date() } });
  return user.id;
}

async function poll(ownerId: string, title: string, closed = false): Promise<string> {
  const publicId = randomBytes(16).toString('base64url');
  await db.poll.create({
    data: {
      publicId,
      ownerId,
      title,
      ...(closed ? { status: 'CLOSED' as const, closedAt: new Date() } : {}),
      days: { create: [{ day: new Date(`${dayFromToday(3)}T00:00:00Z`) }] },
    },
  });
  return publicId;
}

function nav(page: Page) {
  return page.getByRole('navigation', { name: 'Navigation principale' });
}

test('un compte ordinaire n’a ni le menu, ni les écrans', async ({ browser, baseURL }) => {
  const context = await browser.newContext();
  await signInAs(context, await account('Camille'), baseURL!);
  const page = await context.newPage();

  await page.goto('/mes-sondages');
  await expect(nav(page).getByText('Administration')).toHaveCount(0);
  for (const path of ['/admin', '/admin/utilisateurs', '/admin/sondages?etat=clos']) {
    const response = await page.goto(path);
    expect(response?.status()).toBe(404);
    await expect(page.getByRole('heading', { name: 'Introuvable' })).toBeVisible();
  }
  await context.close();
});

test('l’administrateur trie et filtre les sondages, puis supprime un compte avec ses sondages', async ({
  browser,
  baseURL,
}) => {
  const victim = await account('Indésirable');
  const doomed = await poll(victim, 'Sondage indésirable');
  await poll(await account('Alice'), 'Chez Alice', true);

  const context = await browser.newContext();
  await signInAs(context, await adminAccount(), baseURL!);
  const page = await context.newPage();
  await page.goto('/mes-sondages');

  await nav(page).locator('summary', { hasText: 'Administration' }).click();
  await nav(page).getByRole('link', { name: 'Tous les sondages' }).click();
  await expect(page).toHaveURL(/\/admin\/sondages$/);
  const polls = page.getByTestId('admin-sondages');
  await expect(polls.getByRole('link', { name: 'Sondage indésirable' })).toBeVisible();
  await expect(polls.getByRole('link', { name: 'Chez Alice' })).toBeVisible();

  await page.getByLabel('État').selectOption('clos');
  await page.getByLabel('Trier par').selectOption('titre');
  await page.getByRole('button', { name: 'Appliquer' }).click();
  await expect(page).toHaveURL(/[?&]etat=clos&.*tri=titre/);
  await expect(polls.getByRole('link', { name: 'Chez Alice' })).toBeVisible();
  await expect(polls.getByRole('link', { name: 'Sondage indésirable' })).toHaveCount(0);
  await expect(page.getByLabel('État')).toHaveValue('clos');

  await page.getByRole('navigation', { name: 'Administration' }).getByRole('link', { name: 'Utilisateurs' }).click();
  await expect(page).toHaveURL(/\/admin\/utilisateurs$/);
  const users = page.getByTestId('admin-utilisateurs');
  // Le compte de l'administrateur ne se supprime pas d'ici.
  await expect(users.getByRole('listitem').filter({ hasText: 'Administrateur' }).getByRole('button')).toHaveCount(0);

  const row = users.getByRole('listitem').filter({ hasText: 'Indésirable' });
  await row.getByRole('button', { name: 'Supprimer le compte de Indésirable' }).click();
  await row.getByRole('button', { name: 'Supprimer définitivement' }).click();
  await expect(page.getByText('Compte supprimé, avec ses sondages et ses réponses.')).toBeVisible();
  await expect(users.getByText('Indésirable')).toHaveCount(0);

  await page.goto(`/s/${doomed}`);
  await expect(page.getByRole('heading', { name: 'Introuvable' })).toBeVisible();
  await context.close();
});

test('sur téléphone, les deux écrans passent dans le menu', async ({ browser, baseURL }) => {
  const context = await browser.newContext({ viewport: PHONE });
  await signInAs(context, await adminAccount(), baseURL!);
  const page = await context.newPage();
  await page.goto('/mes-sondages');

  await nav(page).locator('summary').filter({ hasText: 'Menu' }).click();
  await nav(page).getByRole('link', { name: 'Utilisateurs' }).click();
  await expect(page).toHaveURL(/\/admin\/utilisateurs$/);
  await expect(page.getByRole('heading', { level: 1, name: 'Utilisateurs' })).toBeVisible();
  await context.close();
});
