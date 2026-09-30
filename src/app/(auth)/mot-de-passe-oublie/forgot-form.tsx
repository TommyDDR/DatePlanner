'use client';

import { useActionState } from 'react';
import { FieldError, FormAlert, Honeypot, SubmitButton } from '@/components/form-parts';
import { fieldError, keptText } from '@/lib/form-state';
import { requestPasswordResetAction } from '../actions';

export function ForgotForm() {
  const [state, action] = useActionState(requestPasswordResetAction, null);
  const emailError = fieldError(state, 'email');

  if (state?.done) {
    return (
      <p role="status" className="text-[var(--color-text-muted)]">
        Si un compte existe avec cette adresse, un email vient de partir avec un lien pour choisir un nouveau mot de
        passe. Pensez à regarder dans les indésirables.
      </p>
    );
  }

  return (
    <form action={action} className="flex flex-col gap-5" noValidate>
      <FormAlert state={state} />
      <Honeypot />
      <div>
        <label htmlFor="email" className="mb-1.5 block text-sm font-medium">
          Adresse email du compte
        </label>
        <input
          id="email"
          name="email"
          type="email"
          required
          autoComplete="email"
          defaultValue={keptText(state, 'email')}
          aria-invalid={emailError ? true : undefined}
          aria-describedby={emailError ? 'email-erreur' : undefined}
          className={`field ${emailError ? 'field-error' : ''}`}
        />
        <FieldError id="email-erreur" message={emailError} />
      </div>
      <SubmitButton pendingLabel="Envoi…">Recevoir un lien</SubmitButton>
    </form>
  );
}
