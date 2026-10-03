'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { parseUserListQuery, POLLS_PATH, userListHref, USERS_PATH } from '@/lib/admin-query';
import type { FormState } from '@/lib/form-state';
import { adminDeleteUserSchema, readForm } from '@/lib/validation';
import { getAdminUser } from '@/server/admin/access';
import { deleteUserAsAdmin } from '@/server/admin/users';
import { publish } from '@/server/events/bus';
import { recordActivity } from '@/server/polls/news';

/** Actions de l'administration (contracts/server-actions.md, « Administration »). */

/**
 * Supprime un compte et tous ses sondages (FR-047), puis revient sur la même
 * page de la liste, qui le confirme. Sans session d'administrateur : introuvable.
 */
export async function deleteUserAction(_previous: FormState, form: FormData): Promise<FormState> {
  const admin = await getAdminUser();
  if (!admin) return { error: { code: 'NOT_FOUND' } };
  const values = readForm(form);
  const parsed = adminDeleteUserSchema.safeParse(values);
  if (!parsed.success) return { error: { code: 'NOT_FOUND' } };

  const result = await deleteUserAsAdmin(admin, parsed.data.userId);
  if (!result.ok) return { error: result.error };
  // Une trace dans le journal du service : qui a supprimé quoi, par identifiants seulement.
  console.info(`Administration : compte ${parsed.data.userId} supprimé par ${admin.id}.`);

  // Après la transaction : ses sondages disent « introuvable » sur les pages
  // ouvertes, et ceux où il avait répondu se relisent (FR-023, FR-044).
  for (const pollId of result.data.deletedPollIds) await publish(pollId, 'deleted');
  for (const pollId of result.data.touchedPollIds) {
    await publish(pollId, 'responses');
    await recordActivity(pollId, null);
  }
  revalidatePath(USERS_PATH);
  revalidatePath(POLLS_PATH);
  redirect(userListHref(parseUserListQuery(values), 'supprime'));
}
