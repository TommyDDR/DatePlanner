import { createHash, randomBytes } from 'node:crypto';
import { cookies } from 'next/headers';
import { SESSION } from '@/config/limits';
import { prisma } from '@/server/db/client';
import {
  sessionAbsoluteExpiry,
  sessionCookieOptions,
  sessionExpiryFrom,
  sessionNeedsRenewal,
} from '@/lib/session-cookie';

/**
 * Sessions.
 *
 * Le cookie contient un jeton aléatoire de 256 bits ; la base ne stocke que son
 * SHA-256. Une lecture de la base - sauvegarde égarée, injection SQL - ne
 * permet donc pas de rejouer une session. Le hachage est rapide (et non
 * argon2) parce que le jeton est déjà à haute entropie : il n'y a rien à
 * forcer par dictionnaire, contrairement à un mot de passe.
 */

export type SessionUser = {
  id: string;
  email: string;
  displayName: string;
  /** Le compte a un mot de passe (un compte né de Google n'en a pas). */
  hasPassword: boolean;
  emailProvedAt: Date | null;
  /** Ouverture de CETTE session : une action sensible sans mot de passe exige qu'elle soit récente. */
  sessionCreatedAt: Date;
};

export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

function generateToken(): string {
  return randomBytes(32).toString('base64url');
}

/** Crée une session et pose le cookie. */
export async function createSession(userId: string): Promise<void> {
  const token = generateToken();
  const expiresAt = sessionExpiryFrom(new Date());

  await prisma.session.create({
    data: { userId, tokenHash: hashToken(token), expiresAt },
  });

  const store = await cookies();
  store.set(SESSION.cookieName, token, sessionCookieOptions(expiresAt));
}

/** Un jour : `lastActiveAt` n'est réécrit qu'au plus une fois par jour. */
const ACTIVITY_WRITE_MS = 24 * 3600 * 1000;

/**
 * Lit la session courante.
 *
 * Renvoie `null` sans lever si le cookie est absent, expiré ou inconnu :
 * l'absence de session est un état normal, pas une erreur.
 */
export async function getSessionUser(): Promise<SessionUser | null> {
  const store = await cookies();
  const token = store.get(SESSION.cookieName)?.value;
  if (!token) return null;

  const session = await prisma.session.findUnique({
    where: { tokenHash: hashToken(token) },
    include: {
      user: {
        select: {
          id: true,
          email: true,
          displayName: true,
          passwordHash: true,
          emailProvedAt: true,
          lastActiveAt: true,
        },
      },
    },
  });

  // Le plafond absolu est relu ici, pas seulement à la prolongation : une
  // ligne écrite avant lui porte une échéance qui l'ignore.
  const now = new Date();
  const expired =
    !session ||
    session.expiresAt.getTime() < now.getTime() ||
    sessionAbsoluteExpiry(session.createdAt).getTime() < now.getTime();
  if (!session || expired) {
    if (session) await prisma.session.delete({ where: { id: session.id } }).catch(() => undefined);
    return null;
  }

  // Prolongation glissante, au plus une écriture par `renewAfterSeconds`,
  // sans dépasser le plafond compté depuis la connexion. Le cookie, lui, est
  // reposé par `proxy.ts` à chaque navigation.
  if (sessionNeedsRenewal(session.expiresAt, now)) {
    await prisma.session.update({
      where: { id: session.id },
      data: { expiresAt: sessionExpiryFrom(now, session.createdAt), lastSeenAt: now },
    });
  }

  // L'activité du compte sert à la conservation (3 ans) : une visite la
  // renouvelle, au plus une fois par jour, et annule un avertissement
  // d'inactivité déjà parti.
  if (now.getTime() - session.user.lastActiveAt.getTime() > ACTIVITY_WRITE_MS) {
    await prisma.user.update({
      where: { id: session.user.id },
      data: { lastActiveAt: now, inactivityWarnedAt: null },
    });
  }

  return {
    id: session.user.id,
    email: session.user.email,
    displayName: session.user.displayName,
    hasPassword: session.user.passwordHash !== null,
    emailProvedAt: session.user.emailProvedAt,
    sessionCreatedAt: session.createdAt,
  };
}

/** Ferme la session courante et efface le cookie. */
export async function destroySession(): Promise<void> {
  const store = await cookies();
  const token = store.get(SESSION.cookieName)?.value;
  if (token) {
    await prisma.session.deleteMany({ where: { tokenHash: hashToken(token) } });
  }
  store.delete(SESSION.cookieName);
}

/**
 * Ferme toutes les sessions d'un utilisateur.
 *
 * Utilisée quand plus aucune session ne doit survivre : une réinitialisation
 * de mot de passe par lien, un rattachement Google sur une adresse jamais
 * prouvée - on ne sait pas laquelle est celle du titulaire.
 */
export async function destroyAllSessions(userId: string): Promise<void> {
  await prisma.session.deleteMany({ where: { userId } });
}

/**
 * Ferme toutes les sessions d'un utilisateur SAUF celle du navigateur courant.
 * La session courante est reconnue à son cookie ; s'il n'y en a pas, toutes
 * sont fermées.
 */
export async function destroyOtherSessions(userId: string): Promise<void> {
  const store = await cookies();
  const token = store.get(SESSION.cookieName)?.value;
  await prisma.session.deleteMany({
    where: {
      userId,
      ...(token ? { tokenHash: { not: hashToken(token) } } : {}),
    },
  });
}

/** Supprime les sessions expirées (maintenance). */
export async function purgeExpiredSessions(now = new Date()): Promise<number> {
  const result = await prisma.session.deleteMany({ where: { expiresAt: { lt: now } } });
  return result.count;
}

/** Retire les jetons de réinitialisation expirés : ils n'ouvrent plus rien. */
export async function purgeExpiredTokens(now = new Date()): Promise<number> {
  const result = await prisma.passwordResetToken.deleteMany({ where: { expiresAt: { lt: now } } });
  return result.count;
}

/* -------------------------------------------------------------------------- */
/* Jetons à usage unique                                                       */
/* -------------------------------------------------------------------------- */

export type IssuedToken = { token: string; tokenHash: string; expiresAt: Date };

export function issueToken(ttlSeconds: number): IssuedToken {
  const token = generateToken();
  return {
    token,
    tokenHash: hashToken(token),
    expiresAt: new Date(Date.now() + ttlSeconds * 1000),
  };
}
