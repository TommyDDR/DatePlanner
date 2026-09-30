'use client';

import { useFormStatus } from 'react-dom';
import { errorMessage } from '@/lib/action-result';
import { HONEYPOT_FIELD, type FormState } from '@/lib/form-state';

/** Bouton d'envoi qui dit qu'il travaille, et ne se laisse pas cliquer deux fois. */
export function SubmitButton({
  children,
  pendingLabel,
  className = 'btn-ember',
}: {
  children: React.ReactNode;
  pendingLabel?: string;
  className?: string;
}) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className={className} disabled={pending} aria-disabled={pending}>
      {pending ? (pendingLabel ?? 'Un instant…') : children}
    </button>
  );
}

/** Le message sous un champ en erreur. */
export function FieldError({ id, message }: { id: string; message: string | undefined }) {
  if (!message) return null;
  return (
    <p id={id} className="mt-1.5 text-sm text-[var(--color-rust)]">
      {message}
    </p>
  );
}

/**
 * L'erreur qui n'est propre à aucun champ : rendue dans une région annoncée,
 * pour qu'un lecteur d'écran l'entende sans chercher.
 */
export function FormAlert({ state, fieldsHandled = true }: { state: FormState; fieldsHandled?: boolean }) {
  const error = state?.error;
  if (!error) return null;
  // Les erreurs de champ se lisent sous leur champ ; seule reste ici celle du formulaire.
  if (error.code === 'VALIDATION' && fieldsHandled && !error.fields._form) return null;
  return (
    <p
      role="alert"
      className="rounded-[10px] border border-[color-mix(in_oklab,var(--color-rust)_45%,transparent)] bg-[color-mix(in_oklab,var(--color-rust)_8%,transparent)] px-4 py-3 text-sm"
    >
      {errorMessage(error)}
    </p>
  );
}

/** Le champ leurre des formulaires publics. */
export function Honeypot() {
  return (
    <div className="honeypot" aria-hidden="true">
      <label htmlFor={HONEYPOT_FIELD}>Ne pas remplir</label>
      <input id={HONEYPOT_FIELD} name={HONEYPOT_FIELD} type="text" tabIndex={-1} autoComplete="off" />
    </div>
  );
}
