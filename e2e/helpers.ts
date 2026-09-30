import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';
import type { Page } from '@playwright/test';

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
    'TRUNCATE "vote", "response", "poll_day", "poll", "password_reset_token", "session", "user", "email_outbox", "rate_limit_hit", "maintenance_run" RESTART IDENTITY CASCADE',
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
