import { SESSION } from '@/config/limits';
import { fail, ok, type ActionResult } from '@/lib/action-result';
import { prisma } from '@/server/db/client';
import { verifyOptionalPassword } from './password';
import { destroySession, type SessionUser } from './session';

/**
 * Le compte de son titulaire (FR-006, constitution IV).
 */

export async function updateDisplayName(userId: string, displayName: string): Promise<ActionResult> {
  await prisma.user.update({ where: { id: userId }, data: { displayName } });
  return ok();
}

/**
 * Supprime le compte, ses sondages - avec leurs jours, réponses et votes - et
 * les réponses qu'il a données ailleurs : la cascade de la base emporte tout
 * en une instruction.
 *
 * La preuve demandée dépend du compte : son mot de passe s'il en a un ; sinon
 * - compte né de Google -, une connexion de moins de dix minutes. Sans cela,
 * un onglet laissé ouvert sur un poste partagé suffirait à effacer le compte.
 */
export async function deleteAccount(user: SessionUser, password: string | undefined): Promise<ActionResult> {
  if (user.hasPassword) {
    const stored = await prisma.user.findUnique({ where: { id: user.id }, select: { passwordHash: true } });
    if (!stored || !(await verifyOptionalPassword(stored.passwordHash, password ?? ''))) {
      return fail({ code: 'AUTH_FAILED' });
    }
  } else if (Date.now() - user.sessionCreatedAt.getTime() > SESSION.recentLoginSeconds * 1000) {
    return fail({ code: 'REAUTH_REQUIRED' });
  }

  await prisma.user.delete({ where: { id: user.id } });
  await destroySession();
  return ok();
}
