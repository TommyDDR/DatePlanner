import { createHash, randomBytes } from 'node:crypto';
import { cookies } from 'next/headers';
import { DEVICE } from '@/config/limits';

/**
 * Reconnaître l'appareil d'un répondant sans compte (research.md R6, FR-018,
 * FR-019).
 *
 * Un jeton aléatoire de 256 bits dans un cookie `HttpOnly` ; la base ne garde
 * que son empreinte SHA-256. Une fuite de la base ne permet donc pas de se
 * faire passer pour un répondant. Cookie strictement nécessaire au service
 * demandé - retrouver et modifier sa réponse - : pas de consentement requis.
 */

export function hashDeviceToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

function cookieOptions() {
  return {
    httpOnly: true,
    sameSite: 'lax' as const,
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: DEVICE.maxAgeSeconds,
  };
}

/** L'empreinte du jeton de cet appareil, ou `null` s'il n'en a pas encore. */
export async function readDeviceTokenHash(): Promise<string | null> {
  const token = (await cookies()).get(DEVICE.cookieName)?.value;
  return token ? hashDeviceToken(token) : null;
}

/** L'empreinte du jeton de cet appareil, le jeton étant posé s'il manquait. */
export async function ensureDeviceToken(): Promise<string> {
  const store = await cookies();
  const existing = store.get(DEVICE.cookieName)?.value;
  if (existing) return hashDeviceToken(existing);
  const token = randomBytes(32).toString('base64url');
  store.set(DEVICE.cookieName, token, cookieOptions());
  return hashDeviceToken(token);
}
