'use server';

import type { FormState } from '@/lib/form-state';
import { disableOwnerDigestSchema, readForm } from '@/lib/validation';
import { disableOwnerDigest } from '@/server/notifications/unsubscribe';

/** Désactive le résumé d'un sondage, depuis le lien d'un email (contracts/server-actions.md). */
export async function disableOwnerDigestAction(_previous: FormState, form: FormData): Promise<FormState> {
  const parsed = disableOwnerDigestSchema.safeParse(readForm(form));
  if (!parsed.success) return { error: { code: 'NOT_FOUND' } };
  return (await disableOwnerDigest(parsed.data.token)) ? { done: true } : { error: { code: 'NOT_FOUND' } };
}
