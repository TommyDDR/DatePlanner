'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import type { FormState } from '@/lib/form-state';
import { deleteAccountSchema, fieldErrors, readForm, updateDisplayNameSchema } from '@/lib/validation';
import { deleteAccount, updateDisplayName } from '@/server/auth/account';
import { getSessionUser } from '@/server/auth/session';

/** Actions du compte (contracts/server-actions.md, « Comptes »). */

export async function updateDisplayNameAction(_previous: FormState, form: FormData): Promise<FormState> {
  const user = await getSessionUser();
  if (!user) return { error: { code: 'NOT_FOUND' } };
  const values = readForm(form);
  const parsed = updateDisplayNameSchema.safeParse(values);
  if (!parsed.success) return { error: { code: 'VALIDATION', fields: fieldErrors(parsed.error) }, values };
  await updateDisplayName(user.id, parsed.data.displayName);
  revalidatePath('/', 'layout');
  return { done: true };
}

export async function deleteAccountAction(_previous: FormState, form: FormData): Promise<FormState> {
  const user = await getSessionUser();
  if (!user) return { error: { code: 'NOT_FOUND' } };
  const parsed = deleteAccountSchema.safeParse(readForm(form));
  if (!parsed.success) return { error: { code: 'VALIDATION', fields: fieldErrors(parsed.error) } };
  const result = await deleteAccount(user, parsed.data.password);
  if (!result.ok) return { error: result.error };
  redirect('/');
}
