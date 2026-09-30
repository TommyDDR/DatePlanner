import { expect, test, type Page } from '@playwright/test';
import { resetDatabase, signUp } from './helpers';

/**
 * US6 - Découvrir le service sur une page d'accueil marquante (FR-032 à
 * FR-034, SC-006).
 */

test.beforeAll(resetDatabase);

const cta = (page: Page) => page.getByRole('link', { name: 'Créer un sondage' }).first();

async function horizontalOverflow(page: Page): Promise<number> {
  return page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
}

for (const viewport of [
  { width: 1280, height: 800 },
  { width: 375, height: 667 },
]) {
  test(`à ${viewport.width} px : démonstration, trois étapes, appel visible sans défiler`, async ({ browser }) => {
    const context = await browser.newContext({ viewport });
    const page = await context.newPage();
    await page.goto('/');

    await expect(page.getByTestId('demonstration')).toBeVisible();
    await expect(cta(page)).toBeInViewport();
    const steps = page.getByTestId('etapes').getByRole('listitem');
    await expect(steps).toHaveCount(3);
    expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0);
    await context.close();
  });
}

test('sans session, l’appel mène à la connexion, puis à la création', async ({ page }) => {
  await page.goto('/');
  await cta(page).click();
  await expect(page).toHaveURL(/\/connexion\?suite=%2Fnouveau$/);

  await signUp(page);
  await page.goto('/');
  await cta(page).click();
  await expect(page).toHaveURL(/\/nouveau$/);
});

test('« réduire les animations » : la démonstration s’affiche immobile, dans son état final', async ({ browser }) => {
  const context = await browser.newContext({ reducedMotion: 'reduce' });
  const page = await context.newPage();
  await page.goto('/');
  await expect(page.getByTestId('demonstration')).toBeVisible();
  // Laisse passer le premier cadre, puis plus aucune animation ne doit tourner.
  await page.waitForTimeout(200);
  const running = await page.evaluate(
    () => document.getAnimations().filter((animation) => animation.playState === 'running').length,
  );
  expect(running).toBe(0);
  // L'état final est montré : la date retenue est allumée.
  const retained = page.getByTestId('demo-date-retenue');
  expect(await retained.evaluate((element) => getComputedStyle(element).opacity)).toBe('1');
  await context.close();
});

test('le contenu principal s’affiche en moins de 2,5 s sur un réseau 4G', async ({ page, context }) => {
  // Une première visite compile la page (serveur de développement) : elle ne compte pas.
  await page.goto('/');

  const cdp = await context.newCDPSession(page);
  await cdp.send('Network.enable');
  // Réseau 4G « lent » : 9 Mb/s descendants, 150 ms de latence.
  await cdp.send('Network.emulateNetworkConditions', {
    offline: false,
    latency: 150,
    downloadThroughput: (9 * 1024 * 1024) / 8,
    uploadThroughput: (1.5 * 1024 * 1024) / 8,
  });

  const started = Date.now();
  await page.goto('/', { waitUntil: 'commit' });
  await cta(page).waitFor({ state: 'visible' });
  await page.getByRole('heading', { level: 1 }).waitFor({ state: 'visible' });
  const elapsed = Date.now() - started;
  expect(elapsed).toBeLessThan(2500);
});
