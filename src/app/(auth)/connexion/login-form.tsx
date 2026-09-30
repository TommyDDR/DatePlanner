'use client';

import { useActionState } from 'react';
import { FieldError, FormAlert, Honeypot, SubmitButton } from '@/components/form-parts';
import { PasswordInput } from '@/components/password-input';
import { fieldError, keptText } from '@/lib/form-state';
import { loginAction } from '../actions';

export function LoginForm({ next }: { next: string | undefined }) {
  const [state, action] = useActionState(loginAction, null);
  const emailError = fieldError(state, 'email');
  const passwordError = fieldError(state, 'password');

  return (
    <form action={action} className="flex flex-col gap-5" noValidate>
      <FormAlert state={state} />
      <Honeypot />
      {next ? <input type="hidden" name="next" value={next} /> : null}
      <div>
        <label htmlFor="email" className="mb-1.5 block text-sm font-medium">
          Adresse email
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
      <div>
        <label htmlFor="password" className="mb-1.5 block text-sm font-medium">
          Mot de passe
        </label>
        <PasswordInput
          id="password"
          name="password"
          autoComplete="current-password"
          invalid={Boolean(passwordError)}
          describedBy={passwordError ? 'password-erreur' : undefined}
        />
        <FieldError id="password-erreur" message={passwordError} />
      </div>
      <SubmitButton pendingLabel="Connexion…">Se connecter</SubmitButton>
    </form>
  );
}
