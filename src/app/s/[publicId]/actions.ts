'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import type { z } from 'zod';
import type { ActionResult } from '@/lib/action-result';
import { isBot, type FormState } from '@/lib/form-state';
import { todayInParis } from '@/lib/paris-day';
import {
  changePollDaysSchema,
  closePollSchema,
  deleteResponseSchema,
  fieldErrors,
  pollOnlySchema,
  pseudonymSchema,
  readForm,
  setPollOptionsSchema,
  setRetainedDaySchema,
  submitResponseSchema,
  updatePollDetailsSchema,
} from '@/lib/validation';
import { ensureDeviceToken, readDeviceTokenHash } from '@/server/auth/device';
import { getSessionUser } from '@/server/auth/session';
import { publish, type LiveEventKind } from '@/server/events/bus';
import { changePollDays, deletePoll, deleteResponse, setPollOptions, updatePollDetails } from '@/server/polls/edit';
import { submitResponse, withdrawResponse, type Respondent } from '@/server/polls/responses';
import { closePoll, reopenPoll, setRetainedDay } from '@/server/polls/state';
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

  // Après la transaction : les pages ouvertes se relisent (FR-023).
  await publish(result.data.pollId, 'responses');
  revalidatePath(`/s/${publicId}`);
  return { done: true };
}

/* -------------------------------------------------------------------------- */
/* Actions du créateur                                                         */
/* -------------------------------------------------------------------------- */

type OwnerOutcome = ActionResult<{ pollId: string }>;

/**
 * Le socle de chaque action du créateur : session exigée - sans elle, le
 * sondage est introuvable -, entrée validée, puis, en cas de succès, les pages
 * ouvertes prévenues (`kind`) et la page relue.
 */
async function ownerAction<T extends { publicId: string }>(
  form: FormData,
  schema: z.ZodType<T>,
  run: (ownerId: string, input: T) => Promise<OwnerOutcome>,
  kind: LiveEventKind,
  arrays: readonly string[] = [],
): Promise<FormState> {
  const user = await getSessionUser();
  if (!user) return { error: { code: 'NOT_FOUND' } };
  const values = readForm(form, arrays);
  const parsed = schema.safeParse(values);
  if (!parsed.success) {
    const fields = fieldErrors(parsed.error);
    return fields.publicId ? { error: { code: 'NOT_FOUND' } } : { error: { code: 'VALIDATION', fields }, values };
  }
  const result = await run(user.id, parsed.data);
  if (!result.ok) return { error: result.error, values };
  await publish(result.data.pollId, kind);
  revalidatePath(`/s/${parsed.data.publicId}`);
  revalidatePath('/mes-sondages');
  return { done: true };
}

export async function updatePollDetailsAction(_previous: FormState, form: FormData): Promise<FormState> {
  return ownerAction(form, updatePollDetailsSchema, (ownerId, input) => updatePollDetails(ownerId, input.publicId, input), 'poll');
}

/**
 * Les jours ajoutés et retirés depuis le calendrier du créateur, d'un seul
 * envoi. Refusé parce qu'un jour vient d'être voté, l'envoi relit quand même
 * la page : le créateur voit aussitôt ce jour passer au gris.
 */
export async function changePollDaysAction(_previous: FormState, form: FormData): Promise<FormState> {
  const state = await ownerAction(
    form,
    changePollDaysSchema,
    (ownerId, input) => changePollDays(ownerId, input.publicId, input, todayInParis(new Date())),
    'poll',
    ['add', 'remove'],
  );
  const publicId = form.get('publicId');
  if (state?.error?.code === 'DAY_HAS_VOTES' && typeof publicId === 'string') revalidatePath(`/s/${publicId}`);
  return state;
}

export async function setPollOptionsAction(_previous: FormState, form: FormData): Promise<FormState> {
  return ownerAction(
    form,
    setPollOptionsSchema,
    (ownerId, input) =>
      setPollOptions(ownerId, input.publicId, {
        requireAccount: input.requireAccount ?? false,
        notifyOwner: input.notifyOwner ?? false,
      }),
    'poll',
  );
}

export async function closePollAction(_previous: FormState, form: FormData): Promise<FormState> {
  return ownerAction(form, closePollSchema, (ownerId, input) => closePoll(ownerId, input.publicId, input.retainedDay ?? null), 'poll');
}

export async function setRetainedDayAction(_previous: FormState, form: FormData): Promise<FormState> {
  return ownerAction(form, setRetainedDaySchema, (ownerId, input) => setRetainedDay(ownerId, input.publicId, input.retainedDay), 'poll');
}

export async function reopenPollAction(_previous: FormState, form: FormData): Promise<FormState> {
  return ownerAction(form, pollOnlySchema, (ownerId, input) => reopenPoll(ownerId, input.publicId), 'poll');
}

export async function deleteResponseAction(_previous: FormState, form: FormData): Promise<FormState> {
  return ownerAction(
    form,
    deleteResponseSchema,
    (ownerId, input) => deleteResponse(ownerId, input.publicId, input.responseId),
    'responses',
  );
}

/** Supprime le sondage, puis renvoie sur « Mes sondages » ; les pages ouvertes se relisent et disent « introuvable ». */
export async function deletePollAction(_previous: FormState, form: FormData): Promise<FormState> {
  const state = await ownerAction(form, pollOnlySchema, (ownerId, input) => deletePoll(ownerId, input.publicId), 'deleted');
  if (!state?.done) return state;
  redirect('/mes-sondages');
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

  await publish(result.data.pollId, 'responses');
  revalidatePath(`/s/${publicId}`);
  return { done: true };
}
