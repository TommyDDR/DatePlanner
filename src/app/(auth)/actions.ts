'use server';

import { redirect } from 'next/navigation';
import { isBot, type FormState } from '@/lib/form-state';
import { safeInternalPath } from '@/lib/safe-redirect';
import {
  fieldErrors,
  loginSchema,
  readForm,
  registerSchema,
  requestPasswordResetSchema,
  resetPasswordSchema,
} from '@/lib/validation';
import { login, logout, register, requestPasswordReset, resetPassword } from '@/server/auth/service';
import { currentIp } from '@/server/ratelimit';

/**
 * Actions des comptes (contracts/server-actions.md, « Comptes »).
 *
 * Chaque action rend l'état du formulaire : l'erreur, et les valeurs saisies
 * - jamais le mot de passe - pour que le formulaire les garde après un refus.
 */

/** Les valeurs à rendre au formulaire : tout sauf les secrets. */
function keptValues(values: Record<string, unknown>): Record<string, unknown> {
  const { password: _password, token: _token, ...rest } = values;
  return rest;
}

const DEFAULT_DESTINATION = '/mes-sondages';

export async function registerAction(_previous: FormState, form: FormData): Promise<FormState> {
  const values = readForm(form);
  if (isBot(form)) return { error: { code: 'AUTH_FAILED' }, values: keptValues(values) };
  const parsed = registerSchema.safeParse(values);
  if (!parsed.success) {
    return { error: { code: 'VALIDATION', fields: fieldErrors(parsed.error) }, values: keptValues(values) };
  }

  const result = await register(parsed.data, await currentIp());
  if (!result.ok) return { error: result.error, values: keptValues(values) };
  redirect(safeInternalPath(parsed.data.next ?? '', DEFAULT_DESTINATION));
}

export async function loginAction(_previous: FormState, form: FormData): Promise<FormState> {
  const values = readForm(form);
  if (isBot(form)) return { error: { code: 'AUTH_FAILED' }, values: keptValues(values) };
  const parsed = loginSchema.safeParse(values);
  if (!parsed.success) {
    return { error: { code: 'VALIDATION', fields: fieldErrors(parsed.error) }, values: keptValues(values) };
  }

  const result = await login(parsed.data.email, parsed.data.password, await currentIp());
  if (!result.ok) return { error: result.error, values: keptValues(values) };
  redirect(safeInternalPath(parsed.data.next ?? '', DEFAULT_DESTINATION));
}

export async function logoutAction(): Promise<void> {
  await logout();
  redirect('/');
}

/**
 * Toujours la même réponse, que l'adresse existe ou non, que la limite soit
 * atteinte ou non (FR-005) : la page ne doit rien apprendre des comptes.
 */
export async function requestPasswordResetAction(_previous: FormState, form: FormData): Promise<FormState> {
  const values = readForm(form);
  const parsed = requestPasswordResetSchema.safeParse(values);
  if (!parsed.success) return { error: { code: 'VALIDATION', fields: fieldErrors(parsed.error) }, values };
  if (!isBot(form)) await requestPasswordReset(parsed.data.email, await currentIp());
  return { done: true };
}

export async function resetPasswordAction(_previous: FormState, form: FormData): Promise<FormState> {
  const parsed = resetPasswordSchema.safeParse(readForm(form));
  if (!parsed.success) return { error: { code: 'VALIDATION', fields: fieldErrors(parsed.error) } };

  const result = await resetPassword(parsed.data.token, parsed.data.password);
  if (!result.ok) return { error: result.error };
  redirect(DEFAULT_DESTINATION);
}
