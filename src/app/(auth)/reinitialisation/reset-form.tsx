'use client';

import Link from 'next/link';
import { useActionState } from 'react';
import { FieldError, SubmitButton } from '@/components/form-parts';
import { PasswordInput } from '@/components/password-input';
import { fieldError } from '@/lib/form-state';
import { PASSWORD_HINT } from '@/lib/password-rules';
import { resetPasswordAction } from '../actions';

export function ResetForm({ token }: { token: string }) {
  const [state, action] = useActionState(resetPasswordAction, null);
  const passwordError = fieldError(state, 'password');
  // Un jeton refusé l'est en entier : invalide, expiré ou déjà servi, le
  // message est le même.
  const tokenRefused = state?.error?.code === 'NOT_FOUND' || fieldError(state, 'token') !== undefined;

  if (tokenRefused) {
    return (
      <div role="alert" className="flex flex-col gap-4">
        <p>Ce lien n’est plus valable : il a déjà servi, ou il a expiré.</p>
        <Link href="/mot-de-passe-oublie" className="btn-ghost self-start">
          Demander un nouveau lien
        </Link>
      </div>
    );
  }

  return (
    <form action={action} className="flex flex-col gap-5" noValidate>
      <input type="hidden" name="token" value={token} />
      <div>
        <label htmlFor="password" className="mb-1.5 block text-sm font-medium">
          Nouveau mot de passe
        </label>
        <PasswordInput
          id="password"
          name="password"
          autoComplete="new-password"
          invalid={Boolean(passwordError)}
          describedBy="password-aide"
        />
        <p id="password-aide" className="mt-1.5 text-sm text-[var(--color-text-subtle)]">
          {PASSWORD_HINT}
        </p>
        <FieldError id="password-erreur" message={passwordError} />
      </div>
      <SubmitButton pendingLabel="Enregistrement…">Enregistrer</SubmitButton>
    </form>
  );
}
