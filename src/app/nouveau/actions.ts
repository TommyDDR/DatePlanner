'use server';

import { redirect } from 'next/navigation';
import type { FormState } from '@/lib/form-state';
import { todayInParis } from '@/lib/paris-day';
import { createPollSchema, fieldErrors, readForm } from '@/lib/validation';
import { getSessionUser } from '@/server/auth/session';
import { createPoll } from '@/server/polls/create';
import { consume } from '@/server/ratelimit';

/** Créer un sondage (contracts/server-actions.md, `createPoll`). */
export async function createPollAction(_previous: FormState, form: FormData): Promise<FormState> {
  const user = await getSessionUser();
  if (!user) redirect(`/connexion?suite=${encodeURIComponent('/nouveau')}`);

  const values = readForm(form, ['days']);
  const parsed = createPollSchema.safeParse(values);
  if (!parsed.success) return { error: { code: 'VALIDATION', fields: fieldErrors(parsed.error) }, values };

  const limit = await consume('pollCreatePerUser', user.id);
  if (!limit.allowed) return { error: { code: 'RATE_LIMITED', retryAfterSeconds: limit.retryAfterSeconds }, values };

  const result = await createPoll(user.id, parsed.data, todayInParis(new Date()));
  if (!result.ok) return { error: result.error, values };
  redirect(`/s/${result.data.publicId}?cree=1`);
}
