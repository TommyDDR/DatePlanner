import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Browser, type BrowserContext, type Locator, type Page } from '@playwright/test';
import { createHash, randomBytes } from 'node:crypto';
import { dayButton, dayFromToday, db, resetDatabase } from './helpers';

/**
 * Accessibilité (FR-034, SC-009) : chaque page passe axe dans les deux thèmes,
 * les parcours principaux se font au clavier seul avec un focus visible, et
 * « réduire les animations » arrête tout mouvement.
 */

test.beforeAll(resetDatabase);

const WCAG = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'];

type Fixture = { ownerId: string; publicId: string };

async function fixture(): Promise<Fixture> {
  const owner = await db.user.create({
    data: { email: `proprio-${Date.now()}-${randomBytes(3).toString('hex')}@exemple.test`, displayName: 'Proprio' },
  });
  const publicId = randomBytes(16).toString('base64url');
  const poll = await db.poll.create({
    data: {
      publicId,
      ownerId: owner.id,
      title: 'Accessibilité',
      description: 'Un sondage pour les contrôles.',
      days: { create: [3, 4, 6].map((offset) => ({ day: new Date(`${dayFromToday(offset)}T00:00:00Z`) })) },
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
  return { ownerId: owner.id, publicId };
}

/** Une session ouverte en base, posée dans le contexte : pas de détour par le formulaire. */
async function signInAs(context: BrowserContext, userId: string, baseURL: string): Promise<void> {
  const token = randomBytes(32).toString('base64url');
  await db.session.create({
    data: {
      userId,
      tokenHash: createHash('sha256').update(token).digest('hex'),
      expiresAt: new Date(Date.now() + 86_400_000),
    },
  });
  await context.addCookies([{ name: 'dp_session', value: token, url: baseURL }]);
}

async function newContext(browser: Browser, colorScheme: 'light' | 'dark') {
  // Animations réduites : la démonstration de l'accueil est jugée dans son
  // état final, sans attendre qu'elle y arrive.
  return browser.newContext({ colorScheme, reducedMotion: 'reduce' });
}

async function violations(page: Page, label: string): Promise<string[]> {
  const results = await new AxeBuilder({ page }).withTags(WCAG).analyze();
  return results.violations.flatMap((violation) =>
    violation.nodes.map((node) => {
      // Le contraste mesuré, quand axe le donne : de quoi corriger sans rejouer.
      const data = node.any[0]?.data as { fgColor?: string; bgColor?: string; contrastRatio?: number } | undefined;
      const measured = data?.contrastRatio ? ` (${data.fgColor} sur ${data.bgColor} : ${data.contrastRatio})` : '';
      return `${label} [${violation.id}] ${node.target.join(' ')} : ${violation.help}${measured}`;
    }),
  );
}

test('chaque page passe axe, dans les deux thèmes', async ({ browser, baseURL }) => {
  test.setTimeout(120_000);
  const { ownerId, publicId } = await fixture();
  const anonymous = [
    '/',
    '/connexion',
    '/inscription',
    '/mot-de-passe-oublie',
    '/reinitialisation?jeton=inconnu',
    '/mentions-legales',
    '/confidentialite',
    `/s/${publicId}`,
    '/s/inconnu',
    '/notifications/resume/desactiver?t=inconnu',
  ];
  const signedIn = ['/nouveau', '/mes-sondages', '/compte', `/s/${publicId}`];

  const failures: string[] = [];
  for (const scheme of ['light', 'dark'] as const) {
    const visitor = await newContext(browser, scheme);
    const visitorPage = await visitor.newPage();
    for (const path of anonymous) {
      await visitorPage.goto(path);
      failures.push(...(await violations(visitorPage, `${scheme} ${path}`)));
    }
    await visitor.close();

    const owner = await newContext(browser, scheme);
    await signInAs(owner, ownerId, baseURL!);
    const ownerPage = await owner.newPage();
    for (const path of signedIn) {
      await ownerPage.goto(path);
      failures.push(...(await violations(ownerPage, `${scheme} créateur ${path}`)));
    }
    await owner.close();
  }
  expect(failures).toEqual([]);
});

/* -------------------------------------------------------------------------- */
/* Clavier seul                                                                */
/* -------------------------------------------------------------------------- */

/**
 * Le focus se VOIT : un contour, ou une ombre colorée (l'anneau des jours et
 * des champs). Une ombre entièrement transparente ne compte pas.
 */
function focusIsVisible(page: Page): Promise<{ visible: boolean; element: string }> {
  return page.evaluate(() => {
    const element = document.activeElement as HTMLElement | null;
    if (!element || element === document.body) return { visible: false, element: 'body' };
    const style = getComputedStyle(element);
    const outline = style.outlineStyle !== 'none' && parseFloat(style.outlineWidth) > 0;
    const colors = style.boxShadow.match(/(rgba?|oklab|oklch|color)\([^)]*\)/g) ?? [];
    const shadow = colors.some((color) => !/(,\s*0\)|\/\s*0\))$/.test(color));
    const name = `${element.tagName.toLowerCase()}${element.id ? `#${element.id}` : ''} « ${(element.textContent ?? '').trim().slice(0, 30)} »`;
    return { visible: outline || shadow, element: name };
  });
}

/** Tabule jusqu'à `target`, en vérifiant que chaque arrêt montre son focus. */
async function tabTo(page: Page, target: Locator, limit = 60): Promise<void> {
  for (let step = 0; step < limit; step += 1) {
    await page.keyboard.press('Tab');
    const focus = await focusIsVisible(page);
    expect(focus.visible, `focus invisible sur ${focus.element}`).toBe(true);
    if (await target.evaluate((element) => element === document.activeElement)) return;
  }
  throw new Error('Cible jamais atteinte au clavier.');
}

/** Déplace le focus du calendrier, aux flèches, jusqu'au jour voulu, puis le coche. */
async function pickDayWithKeyboard(page: Page, day: string): Promise<void> {
  await tabTo(page, page.locator('[data-day][tabindex="0"]').first());
  for (let step = 0; step < 60; step += 1) {
    const current = await page.evaluate(() => (document.activeElement as HTMLElement | null)?.dataset.day ?? null);
    if (current === day) break;
    await page.keyboard.press(current !== null && current > day ? 'ArrowLeft' : 'ArrowRight');
    expect((await focusIsVisible(page)).visible).toBe(true);
  }
  await expect(dayButton(page, day)).toBeFocused();
  await page.keyboard.press('Space');
}

test('créer un sondage puis y répondre, au clavier seul, focus toujours visible', async ({ browser, baseURL }) => {
  const owner = await db.user.create({
    data: { email: `clavier-${Date.now()}@exemple.test`, displayName: 'Clavier' },
  });
  const creator = await browser.newContext({ reducedMotion: 'reduce' });
  await signInAs(creator, owner.id, baseURL!);
  const page = await creator.newPage();
  await page.goto('/nouveau');

  await tabTo(page, page.getByLabel('Titre du sondage'));
  await page.keyboard.type('Sortie au clavier');
  await pickDayWithKeyboard(page, dayFromToday(3));
  await expect(page.locator(`input[name="days"][value="${dayFromToday(3)}"]`)).toHaveCount(1);
  await tabTo(page, page.getByRole('button', { name: 'Créer le sondage' }));
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/\/s\/[A-Za-z0-9_-]+\?cree=1$/);
  const pollPath = new URL(page.url()).pathname;
  await creator.close();

  const visitor = await browser.newContext({ reducedMotion: 'reduce' });
  const answer = await visitor.newPage();
  await answer.goto(pollPath);
  await tabTo(answer, answer.getByLabel('Votre nom ou un pseudo'));
  await answer.keyboard.type('Noé');
  await pickDayWithKeyboard(answer, dayFromToday(3));
  await tabTo(answer, answer.getByRole('button', { name: 'Valider ma réponse' }));
  await answer.keyboard.press('Enter');
  await expect(answer.getByText('Votre réponse est enregistrée')).toBeVisible();
  expect(await db.response.count({ where: { pseudonym: 'Noé' } })).toBe(1);
  await visitor.close();
});

/* -------------------------------------------------------------------------- */
/* Animations réduites                                                         */
/* -------------------------------------------------------------------------- */

function runningAnimations(page: Page): Promise<string[]> {
  return page.evaluate(() =>
    document
      .getAnimations()
      .filter((animation) => animation.playState === 'running')
      .map((animation) => {
        const target = (animation.effect as KeyframeEffect | null)?.target as Element | null;
        return `${animation.constructor.name} ${target?.tagName.toLowerCase() ?? '?'}.${target?.className ?? ''}`;
      }),
  );
}

/** Laisse passer les transitions de 0,01 ms que la règle globale conserve. */
async function expectStill(page: Page, label: string): Promise<void> {
  await page.waitForTimeout(100);
  expect(await runningAnimations(page), label).toEqual([]);
}

test('« réduire les animations » : rien ne bouge, même après un vote et un changement de thème', async ({
  browser,
  baseURL,
}) => {
  const { ownerId, publicId } = await fixture();

  const owner = await browser.newContext({ reducedMotion: 'reduce' });
  await signInAs(owner, ownerId, baseURL!);
  const ownerPage = await owner.newPage();
  await ownerPage.goto('/');
  await expectStill(ownerPage, '/');
  await ownerPage.goto('/nouveau');
  await expectStill(ownerPage, '/nouveau');
  // Le créateur garde sa page ouverte : le vote d'un autre lui arrive en direct.
  await ownerPage.goto(`/s/${publicId}`);
  await expectStill(ownerPage, 'sondage du créateur');

  const visitor = await browser.newContext({ reducedMotion: 'reduce' });
  const page = await visitor.newPage();
  await page.goto(`/s/${publicId}`);
  await page.getByLabel('Votre nom ou un pseudo').fill('Inès');
  await dayButton(page, dayFromToday(4)).click();
  await page.getByRole('button', { name: 'Valider ma réponse' }).click();
  await expect(page.getByText('Votre réponse est enregistrée')).toBeVisible();
  await expectStill(page, 'après le vote');

  await expect(ownerPage.getByTestId('disponibilites')).toContainText('Inès');
  await expectStill(ownerPage, 'mise à jour en direct');

  await page.getByRole('button', { name: /Passer au thème/ }).click();
  await expectStill(page, 'après le changement de thème');

  await visitor.close();
  await owner.close();
});
