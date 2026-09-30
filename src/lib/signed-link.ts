import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * Liens signés (research.md R10) : un sujet - l'identifiant d'un sondage -
 * suivi de sa signature HMAC-SHA-256, liée à un OBJET (`owner-digest`). Un
 * lien signé pour un objet n'ouvre rien pour un autre, et un sujet retouché ne
 * se signe pas sans `APP_SECRET`.
 */

function secret(): string {
  const value = process.env.APP_SECRET;
  if (!value || value.length < 16) throw new Error('APP_SECRET est absente ou trop courte.');
  return value;
}

function signature(purpose: string, subject: string): string {
  return createHmac('sha256', secret()).update(`${purpose}:${subject}`).digest('base64url');
}

export function signLink(purpose: string, subject: string): string {
  return `${subject}.${signature(purpose, subject)}`;
}

/** Le sujet d'un lien dont la signature tient, sinon `null`. Comparaison à temps constant. */
export function verifyLink(purpose: string, token: string): string | null {
  const dot = token.lastIndexOf('.');
  if (dot <= 0) return null;
  const subject = token.slice(0, dot);
  const given = Buffer.from(token.slice(dot + 1));
  const expected = Buffer.from(signature(purpose, subject));
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;
  return subject;
}
