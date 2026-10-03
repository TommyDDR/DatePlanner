import { getSessionUser, type SessionUser } from '@/server/auth/session';

/**
 * Accès à l'administration (décision 042).
 *
 * Chaque lecture et chaque écriture de l'administration exige un `AdminUser`,
 * que seule `getAdminUser` rend : une page ou une action qui oublierait le
 * contrôle ne compilerait pas. Le contrôle se fait à chaque page et à chaque
 * action, jamais dans une mise en page commune, que Next ne rejoue pas d'une
 * page à l'autre.
 */

declare const ADMIN: unique symbol;

export type AdminUser = SessionUser & { readonly [ADMIN]: true };

/** La session courante si elle est celle d'un administrateur ; sinon `null`, et l'appelant répond « introuvable ». */
export async function getAdminUser(): Promise<AdminUser | null> {
  const user = await getSessionUser();
  return user?.isAdmin ? (user as AdminUser) : null;
}
