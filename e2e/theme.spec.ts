import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { randomBytes } from 'node:crypto';
import { dayFromToday, db, resetDatabase } from './helpers';

/**
 * US7 - Thème clair ou sombre (FR-029 à FR-031, SC-007) et contraste des deux
 * thèmes.
 */

test.beforeAll(resetDatabase);

/** La couleur de fond effective de la page. */
function background(page: Page): Promise<string> {
  return page.evaluate(() => getComputedStyle(document.body).backgroundColor);
}

const DARK_INK = 'rgb(12, 10, 9)';
const LIGHT_INK = 'rgb(246, 242, 234)';

test('première visite : le thème du système, même sans JavaScript', async ({ browser }) => {
  for (const [scheme, expected] of [
    ['dark', DARK_INK],
    ['light', LIGHT_INK],
  ] as const) {
    const context = await browser.newContext({ colorScheme: scheme, javaScriptEnabled: false });
    const page = await context.newPage();
    await page.goto('/');
    expect(await background(page)).toBe(expected);
    await context.close();
  }
});

test('le choix explicite est retenu sur l’appareil, contre le système', async ({ browser }) => {
  const context = await browser.newContext({ colorScheme: 'dark' });
  const page = await context.newPage();
  await page.goto('/');
  expect(await background(page)).toBe(DARK_INK);

  await page.getByRole('button', { name: /Passer au thème clair/ }).click();
  await expect.poll(() => background(page)).toBe(LIGHT_INK);

  await page.reload();
  expect(await background(page)).toBe(LIGHT_INK);
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await context.close();
});

test('le thème choisi est posé avant la première peinture, par un script du <head>', async ({ browser }) => {
  const context = await browser.newContext({ colorScheme: 'dark' });
  await context.addInitScript(() => localStorage.setItem('dp-theme', 'light'));
  const page = await context.newPage();
  const response = await page.goto('/');
  const html = (await response!.text()).split('<body')[0]!;
  // Le script est dans le <head>, avec le nonce de la requête.
  expect(html).toMatch(/<script nonce="[^"]+">\(function\(\)\{try\{var c=localStorage\.getItem\("dp-theme"\)/);
  // Dès le document chargé, avant tout rendu client, l'attribut est posé.
  expect(await page.evaluate(() => document.documentElement.dataset.theme)).toBe('light');
  expect(await background(page)).toBe(LIGHT_INK);
  await context.close();
});

test('les textes et les pastilles gardent un contraste lisible dans les deux thèmes', async ({ browser }) => {
  const owner = await db.user.create({ data: { email: `proprio-${Date.now()}@exemple.test`, displayName: 'Proprio' } });
  const publicId = randomBytes(16).toString('base64url');
  const poll = await db.poll.create({
    data: {
      publicId,
      ownerId: owner.id,
      title: 'Contraste',
      days: { create: [3, 4].map((offset) => ({ day: new Date(`${dayFromToday(offset)}T00:00:00Z`) })) },
    },
    include: { days: true },
  });
  await db.response.create({
    data: {
      pollId: poll.id,
      pseudonym: 'Léa',
      deviceTokenHash: randomBytes(32).toString('hex'),
      votes: { create: [{ pollDayId: poll.days[0]!.id }] },
    },
  });

  const failures: string[] = [];
  for (const scheme of ['light', 'dark'] as const) {
    const context = await browser.newContext({ colorScheme: scheme });
    const page = await context.newPage();
    for (const path of ['/', `/s/${publicId}`, '/connexion']) {
      await page.goto(path);
      // Laisse la démonstration de l'accueil atteindre son état final.
      if (path === '/') await page.waitForTimeout(4500);
      const results = await new AxeBuilder({ page }).withRules(['color-contrast']).analyze();
      for (const violation of results.violations) {
        for (const node of violation.nodes) {
          const data = node.any[0]?.data as { fgColor?: string; bgColor?: string; contrastRatio?: number } | undefined;
          failures.push(
            `${scheme} ${path} ${node.target.join(' ')} : ${data?.fgColor} sur ${data?.bgColor} (${data?.contrastRatio})`,
          );
        }
      }
    }
    await context.close();
  }
  expect(failures).toEqual([]);
});
