'use server';

import { revalidatePath } from 'next/cache';
import { isBot, type FormState } from '@/lib/form-state';
import { todayInParis } from '@/lib/paris-day';
import { fieldErrors, pollOnlySchema, pseudonymSchema, readForm, submitResponseSchema } from '@/lib/validation';
import { ensureDeviceToken, readDeviceTokenHash } from '@/server/auth/device';
import { getSessionUser } from '@/server/auth/session';
import { submitResponse, withdrawResponse, type Respondent } from '@/server/polls/responses';
import { consume, currentIp } from '@/server/ratelimit';

/** Actions de la page d'un sondage (contracts/server-actions.md). */

export async function submitResponseAction(_previous: FormState, form: FormData): Promise<FormState> {
  const values = readForm(form, ['days']);
  const parsed = submitResponseSchema.safeParse(values);
  if (!parsed.success) return { error: { code: 'VALIDATION', fields: fieldErrors(parsed.error) }, values };
  const { publicId, days } = parsed.data;

  // Un robot reçoit une réponse ordinaire, et rien n'est écrit.
  if (isBot(form)) return { done: true };

  const user = await getSessionUser();
  let pseudonym: string | null = null;
  if (!user) {
    const checked = pseudonymSchema.safeParse(parsed.data.pseudonym ?? '');
    if (!checked.success) {
      return { error: { code: 'VALIDATION', fields: { pseudonym: checked.error.issues[0]!.message } }, values };
    }
    pseudonym = checked.data;
  }

  const ip = await currentIp();
  for (const [bucket, key] of [
    ['responsePerIp', ip],
    ['responsePerPollIp', `${publicId}:${ip}`],
  ] as const) {
    const limit = await consume(bucket, key);
    if (!limit.allowed) return { error: { code: 'RATE_LIMITED', retryAfterSeconds: limit.retryAfterSeconds }, values };
  }

  const respondent: Respondent = user
    ? { kind: 'user', userId: user.id }
    : { kind: 'device', deviceTokenHash: await ensureDeviceToken() };

  const result = await submitResponse(publicId, respondent, days, pseudonym, todayInParis(new Date()));
  if (!result.ok) return { error: result.error, values };

  revalidatePath(`/s/${publicId}`);
  return { done: true };
}

export async function withdrawResponseAction(_previous: FormState, form: FormData): Promise<FormState> {
  const parsed = pollOnlySchema.safeParse(readForm(form));
  if (!parsed.success) return { error: { code: 'NOT_FOUND' } };
  const { publicId } = parsed.data;

  const user = await getSessionUser();
  let respondent: Respondent;
  if (user) {
    respondent = { kind: 'user', userId: user.id };
  } else {
    const deviceTokenHash = await readDeviceTokenHash();
    if (!deviceTokenHash) return { error: { code: 'NOT_FOUND' } };
    respondent = { kind: 'device', deviceTokenHash };
  }

  const result = await withdrawResponse(publicId, respondent);
  if (!result.ok) return { error: result.error };

  revalidatePath(`/s/${publicId}`);
  return { done: true };
}
