import { LOGIN_LOCK } from '@/config/limits';
import { RETENTION } from '@/config/retention';
import { fail, ok, type ActionResult } from '@/lib/action-result';
import { prisma } from '@/server/db/client';
import { enqueueEmail } from '@/server/notifications/outbox';
import { consume, reset as resetBucket } from '@/server/ratelimit';
import { fakeVerify, hashPassword, verifyOptionalPassword } from './password';
import { createSession, destroyAllSessions, destroySession, hashToken, issueToken } from './session';

/**
 * Service d'authentification des comptes locaux (FR-001, FR-004, FR-005).
 *
 * Toutes les réponses d'échec sont volontairement indifférenciées : un seul
 * `AUTH_FAILED` couvre une adresse inconnue, un mot de passe faux, un compte
 * sans mot de passe et un compte verrouillé. Un message plus précis ferait du
 * formulaire de connexion un outil d'énumération des comptes.
 */

const AUTH_FAILED = { code: 'AUTH_FAILED' } as const;

export type RegisterInput = { email: string; displayName: string; password: string };

/* -------------------------------------------------------------------------- */
/* Inscription                                                                 */
/* -------------------------------------------------------------------------- */

export async function register(input: RegisterInput, ip: string): Promise<ActionResult<{ userId: string }>> {
  const limit = await consume('registerPerIp', ip);
  if (!limit.allowed) return fail({ code: 'RATE_LIMITED', retryAfterSeconds: limit.retryAfterSeconds });

  const email = input.email.trim().toLowerCase();
  const existing = await prisma.user.findUnique({ where: { email }, select: { id: true } });

  /**
   * Adresse déjà inscrite : on CONNECTE, on n'annonce pas.
   *
   * « Un compte existe déjà avec cette adresse » serait un oracle GRATUIT :
   * envoyer une adresse, lire la réponse, recommencer. Le mot de passe saisi
   * est donc présenté à `login` : juste, il ouvre la session que le visiteur
   * venait chercher ; faux, il rend le message générique de la connexion.
   * L'oracle qui subsiste est celui de la connexion, inévitable et PAYANT (seau
   * par adresse, verrou du compte). Ne jamais vérifier le mot de passe ici sans
   * passer par `login` : ce serait rouvrir l'oracle gratuit par l'autre bout.
   */
  if (existing) return login(email, input.password, ip);

  const user = await prisma.user.create({
    data: { email, displayName: input.displayName, passwordHash: await hashPassword(input.password) },
    select: { id: true },
  });
  await createSession(user.id);
  return ok({ userId: user.id });
}

/* -------------------------------------------------------------------------- */
/* Connexion                                                                   */
/* -------------------------------------------------------------------------- */

export async function login(email: string, password: string, ip: string): Promise<ActionResult<{ userId: string }>> {
  // Deux garde-fous complémentaires : celui-ci freine qui balaie beaucoup de
  // comptes depuis une adresse ; le verrou par compte, plus bas, freine qui
  // cible un compte depuis beaucoup d'adresses.
  const limit = await consume('loginPerIp', ip);
  if (!limit.allowed) return fail({ code: 'RATE_LIMITED', retryAfterSeconds: limit.retryAfterSeconds });

  const user = await prisma.user.findUnique({
    where: { email: email.trim().toLowerCase() },
    select: { id: true, passwordHash: true, failedLoginCount: true, lockedUntil: true },
  });

  if (!user) {
    // Coût de calcul identique à une vérification réelle : sans cela, la
    // rapidité de la réponse révélerait que l'adresse n'existe pas.
    await fakeVerify(password);
    return fail(AUTH_FAILED);
  }

  // Le verrou est appliqué, mais il ne S'ANNONCE PAS : « compte bloqué » ne se
  // dirait que d'un compte existant. Même message, même temps de réponse.
  if (user.lockedUntil && user.lockedUntil.getTime() > Date.now()) {
    await fakeVerify(password);
    return fail(AUTH_FAILED);
  }

  if (!(await verifyOptionalPassword(user.passwordHash, password))) {
    const failedLoginCount = user.failedLoginCount + 1;
    await prisma.user.update({
      where: { id: user.id },
      data: { failedLoginCount, lockedUntil: lockoutFor(failedLoginCount) },
    });
    return fail(AUTH_FAILED);
  }

  await prisma.user.update({ where: { id: user.id }, data: { failedLoginCount: 0, lockedUntil: null } });
  await resetBucket('loginPerIp', ip);
  await createSession(user.id);
  return ok({ userId: user.id });
}

/**
 * Verrou progressif : rien avant le seuil, puis un délai qui double à chaque
 * nouvel échec, plafonné. Assez souple pour une faute de frappe, assez ferme
 * pour rendre une attaque par dictionnaire inexploitable.
 */
function lockoutFor(failedLoginCount: number): Date | null {
  if (failedLoginCount < LOGIN_LOCK.freeAttempts) return null;
  const steps = failedLoginCount - LOGIN_LOCK.freeAttempts;
  const seconds = Math.min(LOGIN_LOCK.baseLockSeconds * 2 ** steps, LOGIN_LOCK.maxLockSeconds);
  return new Date(Date.now() + seconds * 1000);
}

export async function logout(): Promise<void> {
  await destroySession();
}

/* -------------------------------------------------------------------------- */
/* Mot de passe oublié                                                         */
/* -------------------------------------------------------------------------- */

/**
 * Toujours silencieux : que l'adresse existe ou non, que la limite soit
 * atteinte ou non, l'appelant rend la même réponse. Un seul lien valable à la
 * fois : une nouvelle demande consomme les précédents.
 */
export async function requestPasswordReset(email: string, ip: string): Promise<void> {
  const normalized = email.trim().toLowerCase();
  const perIp = await consume('resetPerIp', ip);
  const perAccount = await consume('resetPerAccount', normalized);
  if (!perIp.allowed || !perAccount.allowed) return;

  const user = await prisma.user.findUnique({ where: { email: normalized }, select: { id: true, email: true } });
  if (!user) return;

  const issued = issueToken(RETENTION.passwordResetMinutes * 60);
  await prisma.$transaction(async (tx) => {
    await tx.passwordResetToken.updateMany({
      where: { userId: user.id, usedAt: null },
      data: { usedAt: new Date() },
    });
    await tx.passwordResetToken.create({
      data: { userId: user.id, tokenHash: issued.tokenHash, expiresAt: issued.expiresAt },
    });
  });

  // Le jeton en clair voyage dans la file, le temps de l'envoi : il ne vaut
  // qu'une heure, une seule fois, et la ligne est purgée avec les emails
  // envoyés (`RETENTION.sentEmailDays`).
  await enqueueEmail({ to: user.email, template: 'PASSWORD_RESET', payload: { token: issued.token } });
}

/**
 * Réinitialise le mot de passe par un lien reçu.
 *
 * Le jeton est CONSOMMÉ par une écriture conditionnelle (`used_at IS NULL` et
 * non expiré) : deux clics simultanés n'en appliquent qu'un. L'adresse est
 * désormais prouvée - le titulaire a reçu le lien. Toutes les sessions sont
 * fermées : le mot de passe était peut-être compromis.
 */
export async function resetPassword(token: string, newPassword: string): Promise<ActionResult<{ userId: string }>> {
  const now = new Date();
  const record = await prisma.passwordResetToken.findUnique({
    where: { tokenHash: hashToken(token) },
    select: { id: true, userId: true },
  });
  if (!record) return fail({ code: 'NOT_FOUND' });

  const passwordHash = await hashPassword(newPassword);
  const applied = await prisma.$transaction(async (tx) => {
    const consumed = await tx.passwordResetToken.updateMany({
      where: { id: record.id, usedAt: null, expiresAt: { gt: now } },
      data: { usedAt: now },
    });
    if (consumed.count === 0) return false;
    await tx.user.update({
      where: { id: record.userId },
      data: { passwordHash, failedLoginCount: 0, lockedUntil: null },
    });
    await tx.user.updateMany({ where: { id: record.userId, emailProvedAt: null }, data: { emailProvedAt: now } });
    return true;
  });
  if (!applied) return fail({ code: 'NOT_FOUND' });

  await destroyAllSessions(record.userId);
  await createSession(record.userId);
  return ok({ userId: record.userId });
}
