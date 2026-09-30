import { SESSION } from '@/config/limits';

/**
 * Le cookie de session : ses attributs, et quand sa ligne en base se prolonge.
 *
 * Module PUR : `proxy.ts` le lit sur chaque navigation, et n'a rien à faire
 * de Prisma.
 *
 * La politique de confidentialité annonce une session qui expire après
 * `SESSION.maxAgeSeconds` d'INACTIVITÉ. Deux horloges doivent donc glisser
 * ensemble : la ligne en base, prolongée par `getSessionUser`, et le cookie,
 * dont la date d'expiration, posée une fois pour toutes à la connexion, le
 * ferait oublier du navigateur trente jours plus tard, active ou non.
 *
 * Attributs (constitution I) : `HttpOnly` - aucun script de la page ne lit le
 * jeton -, `SameSite=Lax`, `Secure` en production, où le site ne se sert
 * qu'en HTTPS.
 */

/** Attributs du cookie, identiques à la pose et à la prolongation. */
export function sessionCookieOptions(expires: Date) {
  return {
    httpOnly: true,
    sameSite: 'lax' as const,
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    expires,
  };
}

/**
 * L'échéance d'une session prolongée maintenant.
 *
 * Connue la date de connexion, l'échéance ne dépasse jamais
 * `SESSION.absoluteMaxAgeSeconds` après elle : la prolongation glisse, le
 * plafond non.
 */
export function sessionExpiryFrom(now: Date, createdAt?: Date): Date {
  const sliding = now.getTime() + SESSION.maxAgeSeconds * 1000;
  if (!createdAt) return new Date(sliding);
  return new Date(Math.min(sliding, sessionAbsoluteExpiry(createdAt).getTime()));
}

/** L'instant où une session ouverte à `createdAt` expire, active ou non. */
export function sessionAbsoluteExpiry(createdAt: Date): Date {
  return new Date(createdAt.getTime() + SESSION.absoluteMaxAgeSeconds * 1000);
}

/**
 * Vrai quand la ligne en base mérite d'être prolongée.
 *
 * Mesuré depuis la dernière prolongation - l'échéance moins la durée de vie -,
 * jamais depuis la création : mesurée depuis la création, la condition
 * deviendrait vraie pour toujours passé le délai, et chaque requête écrirait
 * en base.
 */
export function sessionNeedsRenewal(expiresAt: Date, now: Date): boolean {
  const renewedAt = expiresAt.getTime() - SESSION.maxAgeSeconds * 1000;
  return now.getTime() - renewedAt > SESSION.renewAfterSeconds * 1000;
}
