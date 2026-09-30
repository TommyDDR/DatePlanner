import { config } from 'dotenv';
import { vi } from 'vitest';

/**
 * Amorçage de l'environnement de test.
 *
 *  1. Charger `.env.test`, qui pointe vers une base SÉPARÉE : les tests vident
 *     les tables, et les faire tourner sur la base de développement effacerait
 *     le travail en cours.
 *
 *  2. Remplacer `next/headers`. Les sessions et le cookie d'appareil passent
 *     par l'API de Next, qui n'existe qu'à l'intérieur d'une requête HTTP. Le
 *     bocal ci-dessous en fournit un équivalent en mémoire, qui garde aussi les
 *     OPTIONS de chaque cookie : les tests vérifient ses attributs réels.
 */

config({ path: '.env.test', override: true, quiet: true });

/* -------------------------------------------------------------------------- */
/* Bocal à cookies                                                             */
/* -------------------------------------------------------------------------- */

export type CookieOptions = {
  httpOnly?: boolean;
  secure?: boolean;
  sameSite?: 'lax' | 'strict' | 'none' | boolean;
  path?: string;
  expires?: Date;
  maxAge?: number;
};

type CookieEntry = { name: string; value: string };

const jar = new Map<string, { value: string; options: CookieOptions }>();
let requestHeaders = new Headers();

export const testCookies = {
  clear(): void {
    jar.clear();
  },
  get(name: string): string | undefined {
    return jar.get(name)?.value;
  },
  options(name: string): CookieOptions | undefined {
    return jar.get(name)?.options;
  },
  set(name: string, value: string): void {
    jar.set(name, { value, options: {} });
  },
  /** Simule un autre navigateur : les cookies précédents sont oubliés. */
  newBrowser(): void {
    jar.clear();
  },
};

export function setTestHeaders(headers: Record<string, string>): void {
  requestHeaders = new Headers(headers);
}

vi.mock('next/headers', () => ({
  cookies: async () => ({
    get(name: string): CookieEntry | undefined {
      const entry = jar.get(name);
      return entry === undefined ? undefined : { name, value: entry.value };
    },
    set(name: string, value: string, options: CookieOptions = {}): void {
      jar.set(name, { value, options });
    },
    delete(name: string): void {
      jar.delete(name);
    },
    has(name: string): boolean {
      return jar.has(name);
    },
  }),
  headers: async () => requestHeaders,
}));

/**
 * `next/cache` n'a pas de sens hors d'un rendu : `revalidatePath` devient un
 * appel sans effet, ce qui laisse les Server Actions testables telles quelles.
 */
vi.mock('next/cache', () => ({
  revalidatePath: () => undefined,
  revalidateTag: () => undefined,
}));

/**
 * `redirect` lève une exception dans Next pour interrompre le rendu. On
 * reproduit ce comportement avec une erreur reconnaissable, que les tests
 * interceptent pour vérifier la destination.
 */
export class TestRedirect extends Error {
  constructor(readonly location: string) {
    super(`REDIRECT:${location}`);
    this.name = 'TestRedirect';
  }
}

vi.mock('next/navigation', () => ({
  redirect: (location: string) => {
    throw new TestRedirect(location);
  },
  notFound: () => {
    throw new Error('NOT_FOUND');
  },
}));
