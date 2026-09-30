'use client';

import { useActionState } from 'react';
import { FieldError, FormAlert, Honeypot, SubmitButton } from '@/components/form-parts';
import { PasswordInput } from '@/components/password-input';
import { POLL_LIMITS } from '@/config/limits';
import { fieldError, keptText } from '@/lib/form-state';
import { PASSWORD_HINT } from '@/lib/password-rules';
import { registerAction } from '../actions';

export function RegisterForm({ next }: { next: string | undefined }) {
  const [state, action] = useActionState(registerAction, null);
  const errors = {
    email: fieldError(state, 'email'),
    displayName: fieldError(state, 'displayName'),
    password: fieldError(state, 'password'),
  };

  return (
    <form action={action} className="flex flex-col gap-5" noValidate>
      <FormAlert state={state} />
      <Honeypot />
      {next ? <input type="hidden" name="next" value={next} /> : null}
      <div>
        <label htmlFor="displayName" className="mb-1.5 block text-sm font-medium">
          Votre nom
        </label>
        <input
          id="displayName"
          name="displayName"
          required
          maxLength={POLL_LIMITS.displayNameMax}
          autoComplete="name"
          defaultValue={keptText(state, 'displayName')}
          aria-invalid={errors.displayName ? true : undefined}
          aria-describedby="displayName-aide"
          className={`field ${errors.displayName ? 'field-error' : ''}`}
        />
        <p id="displayName-aide" className="mt-1.5 text-sm text-[var(--color-text-subtle)]">
          C’est le nom que verront les personnes qui répondent à vos sondages.
        </p>
        <FieldError id="displayName-erreur" message={errors.displayName} />
      </div>
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
          aria-invalid={errors.email ? true : undefined}
          aria-describedby={errors.email ? 'email-erreur' : undefined}
          className={`field ${errors.email ? 'field-error' : ''}`}
        />
        <FieldError id="email-erreur" message={errors.email} />
      </div>
      <div>
        <label htmlFor="password" className="mb-1.5 block text-sm font-medium">
          Mot de passe
        </label>
        <PasswordInput
          id="password"
          name="password"
          autoComplete="new-password"
          invalid={Boolean(errors.password)}
          describedBy="password-aide"
        />
        <p id="password-aide" className="mt-1.5 text-sm text-[var(--color-text-subtle)]">
          {PASSWORD_HINT}
        </p>
        <FieldError id="password-erreur" message={errors.password} />
      </div>
      <SubmitButton pendingLabel="Création du compte…">Créer mon compte</SubmitButton>
    </form>
  );
}
