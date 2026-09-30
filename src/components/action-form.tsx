'use client';

import { useActionState, useState } from 'react';
import type { FormState } from '@/lib/form-state';
import { FormAlert, SubmitButton } from './form-parts';

type Action = (previous: FormState, form: FormData) => Promise<FormState>;

/**
 * Un petit formulaire d'action : ses champs, son erreur, et un mot quand
 * l'action a abouti. La page se relit d'elle-même (`revalidatePath`) : le
 * formulaire n'a rien d'autre à montrer.
 */
export function ActionForm({
  action,
  children,
  success,
  className = 'flex flex-col gap-3',
}: {
  action: Action;
  children: (state: FormState) => React.ReactNode;
  success?: string;
  className?: string;
}) {
  const [state, formAction] = useActionState(action, null);
  return (
    <form action={formAction} className={className}>
      <FormAlert state={state} fieldsHandled={false} />
      {children(state)}
      {success && state?.done ? (
        <p role="status" className="text-sm text-[var(--color-jade)]">
          {success}
        </p>
      ) : null}
    </form>
  );
}

/**
 * Un geste qu'on ne défait pas se confirme : le premier clic ne fait que
 * demander, le second envoie. Sans boîte de dialogue du navigateur, que les
 * lecteurs d'écran annoncent mal.
 */
export function ConfirmSubmit({
  label,
  confirmLabel,
  question,
}: {
  label: string;
  confirmLabel: string;
  question: string;
}) {
  const [asking, setAsking] = useState(false);
  if (!asking) {
    return (
      <button type="button" className="btn-danger self-start" onClick={() => setAsking(true)}>
        {label}
      </button>
    );
  }
  return (
    <div role="group" aria-label={question} className="flex flex-wrap items-center gap-3">
      <span className="text-sm">{question}</span>
      <SubmitButton className="btn-danger">{confirmLabel}</SubmitButton>
      <button type="button" className="text-sm underline-offset-4 hover:underline" onClick={() => setAsking(false)}>
        Annuler
      </button>
    </div>
  );
}
