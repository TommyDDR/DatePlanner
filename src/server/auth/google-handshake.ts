import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * Le cookie qui traverse l'aller-retour chez Google (research.md R5).
 *
 * Ce qu'il porte : l'anti-rejeu (`state`), le vérificateur PKCE, et la
 * destination d'arrivée. Le visiteur quitte le site pour l'écran de Google, et
 * rien de tout cela ne peut voyager dans l'URL : le `state` y serait lisible,
 * et le vérificateur, envoyé à l'aller, ne vérifierait plus rien.
 *
 * Il est SIGNÉ par `APP_SECRET`. Le cookie est déjà `httpOnly`, donc hors de
 * portée d'un script de la page ; la signature ferme l'autre porte, celle d'un
 * cookie POSÉ depuis un sous-domaine voisin - de `laserit.fr`, par exemple -,
 * le seul chemin par lequel un tiers choisirait le `state` comparé au retour.
 *
 * Il ne vit que le temps de la poignée de main, et la route de retour l'efface
 * dans tous les cas : un vérificateur qui traîne est un vérificateur rejouable.
 */

export const GOOGLE_HANDSHAKE_COOKIE = 'dp_google';

/** Dix minutes : le temps de choisir un compte et de donner son mot de passe. */
export const COOKIE_MAX_AGE_SECONDS = 600;

export type HandshakePayload = {
  state: string;
  verifier: string;
  /** Chemin interne d'arrivée, déjà analysé par `safeInternalPath`. */
  next: string;
};

function secret(): string {
  const value = process.env.APP_SECRET;
  if (!value || value.length < 16) throw new Error('APP_SECRET est absente ou trop courte.');
  return value;
}

function sign(payload: string): string {
  return createHmac('sha256', secret()).update(`google-handshake:${payload}`).digest('base64url');
}

export function sealHandshake(payload: HandshakePayload): string {
  const body = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
  return `${body}.${sign(body)}`;
}

/** `null` dès que la signature, la forme ou le contenu ne tiennent pas. */
export function openHandshake(cookie: string | undefined): HandshakePayload | null {
  if (!cookie) return null;
  const parts = cookie.split('.');
  if (parts.length !== 2) return null;

  const [body, signature] = parts as [string, string];
  const a = Buffer.from(signature);
  const b = Buffer.from(sign(body));
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;

  try {
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as HandshakePayload;
    if (typeof payload.state !== 'string' || payload.state === '') return null;
    if (typeof payload.verifier !== 'string' || payload.verifier === '') return null;
    if (typeof payload.next !== 'string') return null;
    return payload;
  } catch {
    return null;
  }
}

/**
 * `sameSite: 'lax'` et pas `strict` : le retour de Google est une navigation
 * venue d'un autre site, et `strict` retiendrait le cookie exactement là où on
 * en a besoin.
 */
export function handshakeCookieOptions() {
  return {
    httpOnly: true,
    sameSite: 'lax' as const,
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: COOKIE_MAX_AGE_SECONDS,
  };
}

/** Les deux états comparés à temps constant. */
export function sameState(expected: string, received: string): boolean {
  const a = Buffer.from(expected);
  const b = Buffer.from(received);
  return a.length === b.length && timingSafeEqual(a, b);
}
