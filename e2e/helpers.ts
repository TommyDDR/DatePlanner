import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';
import type { BrowserContext, Page } from '@playwright/test';
import { createHash, randomBytes } from 'node:crypto';

/**
 * Outils des parcours de bout en bout.
 *
 * La base est celle de TEST (`.env.test`, chargé par `playwright.config.ts`) :
 * elle est vidée au début de chaque fichier.
 */

const url = process.env.DATABASE_URL ?? '';
if (!/_test(\?|$)/.test(url)) throw new Error('Les parcours refusent une base dont le nom ne finit pas par _test.');

export const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) });

export async function resetDatabase(): Promise<void> {
  await db.$executeRawUnsafe(
    'TRUNCATE "retained_day", "vote", "response", "poll_day", "poll", "password_reset_token", "session", "user", "email_outbox", "rate_limit_hit", "maintenance_run" RESTART IDENTITY CASCADE',
  );
}

/** Aujourd'hui à Paris, décalé de `offset` jours, au format `AAAA-MM-JJ`. */
export function dayFromToday(offset: number): string {
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Paris' }).format(new Date());
  const date = new Date(`${today}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + offset);
  return date.toISOString().slice(0, 10);
}

export const PASSWORD = 'Mot-de-passe-9';

let counter = 0;
export function uniqueEmail(prefix = 'e2e'): string {
  counter += 1;
  return `${prefix}-${Date.now().toString(36)}-${counter}@exemple.test`;
}

/** Crée un compte par le formulaire d'inscription ; la page est ensuite connectée. */
export async function signUp(page: Page, options: { name?: string; email?: string } = {}): Promise<string> {
  const email = options.email ?? uniqueEmail();
  await page.goto('/inscription');
  await page.getByLabel('Votre nom').fill(options.name ?? 'Camille');
  await page.getByLabel('Adresse email').fill(email);
  await page.getByLabel('Mot de passe', { exact: true }).fill(PASSWORD);
  await page.getByRole('button', { name: 'Créer mon compte' }).click();
  await page.waitForURL('**/mes-sondages');
  return email;
}

/** Le bouton d'un jour du calendrier. */
export function dayButton(page: Page, day: string) {
  return page.locator(`[data-day="${day}"]`);
}

/** Une session ouverte en base, posée dans le contexte : pas de détour par le formulaire. */
export async function signInAs(context: BrowserContext, userId: string, baseURL: string): Promise<void> {
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

/**
 * Un doigt sur l'écran, par le protocole de Chromium : de vrais événements
 * tactiles, que le navigateur fait défiler s'il le décide - `touchscreen` de
 * Playwright ne sait que taper. Le contexte doit avoir `hasTouch`.
 */
export async function finger(page: Page) {
  const cdp = await page.context().newCDPSession(page);
  let at = { x: 0, y: 0 };
  const send = (type: 'touchStart' | 'touchMove' | 'touchEnd', touchPoints: { x: number; y: number }[]) =>
    cdp.send('Input.dispatchTouchEvent', { type, touchPoints });
  return {
    async down(x: number, y: number) {
      at = { x, y };
      await send('touchStart', [at]);
    },
    /** Un déplacement par petits pas, comme un doigt, pas d'un saut. */
    async move(x: number, y: number, steps = 10) {
      const from = at;
      for (let step = 1; step <= steps; step += 1) {
        at = { x: from.x + ((x - from.x) * step) / steps, y: from.y + ((y - from.y) * step) / steps };
        await send('touchMove', [at]);
        await page.waitForTimeout(16);
      }
    },
    async up() {
      await send('touchEnd', []);
    },
  };
}

/** Le centre d'un jour du calendrier, à l'écran. */
export async function dayCenter(page: Page, day: string): Promise<{ x: number; y: number }> {
  const box = (await dayButton(page, day).boundingBox())!;
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}
