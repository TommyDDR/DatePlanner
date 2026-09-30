import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { db, resetDatabase, signInAs, uniqueEmail } from './helpers';

/**
 * Menu de l'en-tête sur téléphone (décision 035) : « Mes sondages »,
 * « Nouveau sondage » et le compte passent derrière un bouton ; la bascule de
 * thème reste dans le bandeau. Sur un écran large, rien ne change.
 */

test.beforeAll(resetDatabase);

const PHONE = { width: 390, height: 844 };

async function owner(): Promise<string> {
  const user = await db.user.create({ data: { email: uniqueEmail('menu'), displayName: 'Camille' } });
  return user.id;
}

function nav(page: Page) {
  return page.getByRole('navigation', { name: 'Navigation principale' });
}

function toggle(page: Page) {
  return nav(page).locator('summary');
}

test('sur téléphone, les liens passent dans le menu et le thème reste dans le bandeau', async ({ browser, baseURL }) => {
  const context = await browser.newContext({ viewport: PHONE });
  await signInAs(context, await owner(), baseURL!);
  const page = await context.newPage();
  await page.goto('/nouveau');

  await expect(nav(page).getByRole('button', { name: /Passer au thème/ })).toBeVisible();
  await expect(toggle(page)).toBeVisible();
  const myPolls = nav(page).getByRole('link', { name: 'Mes sondages' });
  await expect(myPolls).toBeHidden();

  await toggle(page).click();
  await expect(myPolls).toBeVisible();
  await expect(nav(page).getByRole('link', { name: 'Nouveau sondage' })).toBeVisible();
  await expect(nav(page).getByRole('link', { name: 'Mon compte (Camille)' })).toBeVisible();

  // Un lien suivi referme le menu : l'en-tête, lui, reste monté.
  await myPolls.click();
  await expect(page).toHaveURL(/\/mes-sondages$/);
  await expect(myPolls).toBeHidden();

  // Échap le referme et rend le focus au bouton.
  await toggle(page).click();
  await expect(myPolls).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(myPolls).toBeHidden();
  await expect(toggle(page)).toBeFocused();

  // Un toucher ailleurs aussi.
  await toggle(page).click();
  await expect(myPolls).toBeVisible();
  await page.locator('main').click({ position: { x: 20, y: 200 } });
  await expect(myPolls).toBeHidden();

  await context.close();
});

test('menu ouvert : axe ne relève rien, dans les deux thèmes', async ({ browser, baseURL }) => {
  const userId = await owner();
  for (const colorScheme of ['light', 'dark'] as const) {
    const context = await browser.newContext({ viewport: PHONE, colorScheme, reducedMotion: 'reduce' });
    await signInAs(context, userId, baseURL!);
    const page = await context.newPage();
    await page.goto('/mes-sondages');
    await toggle(page).click();
    await expect(nav(page).getByRole('link', { name: 'Mes sondages' })).toBeVisible();

    const results = await new AxeBuilder({ page })
      .include('header')
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .analyze();
    expect(results.violations.map((violation) => `${colorScheme} [${violation.id}] ${violation.help}`)).toEqual([]);
    await context.close();
  }
});

test('sans JavaScript, le menu s’ouvre et ses liens mènent où il faut', async ({ browser, baseURL }) => {
  const context = await browser.newContext({ viewport: PHONE, javaScriptEnabled: false });
  await signInAs(context, await owner(), baseURL!);
  const page = await context.newPage();
  await page.goto('/compte');

  await toggle(page).click();
  await nav(page).getByRole('link', { name: 'Mes sondages' }).click();
  await expect(page).toHaveURL(/\/mes-sondages$/);

  await context.close();
});

test('sur un écran large, les liens restent dans le bandeau, sans menu', async ({ browser, baseURL }) => {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  await signInAs(context, await owner(), baseURL!);
  const page = await context.newPage();
  await page.goto('/nouveau');

  await expect(toggle(page)).toBeHidden();
  await expect(nav(page).getByRole('link', { name: 'Mes sondages' })).toBeVisible();
  await expect(nav(page).getByRole('link', { name: 'Nouveau sondage' })).toBeVisible();
  await expect(nav(page).getByRole('link', { name: 'Mon compte (Camille)' })).toBeVisible();

  await context.close();
});
