'use client';

import { useActionState } from 'react';
import { SubmitButton } from '@/components/form-parts';
import { disableOwnerDigestAction } from './actions';

export function UnsubscribeForm({ token }: { token: string }) {
  const [state, action] = useActionState(disableOwnerDigestAction, null);

  if (state?.done) {
    return (
      <p role="status" className="text-[var(--color-text-muted)]">
        C’est fait : vous ne recevrez plus de résumé pour ce sondage. Vous pouvez le réactiver depuis la page du sondage.
      </p>
    );
  }
  if (!token || state?.error) {
    return <p role="alert">Ce lien n’est pas valable, ou le sondage n’existe plus.</p>;
  }
  return (
    <form action={action} className="flex flex-col gap-4">
      <input type="hidden" name="token" value={token} />
      <p className="text-[var(--color-text-muted)]">
        Vous ne recevrez plus d’email quand de nouvelles personnes répondent à ce sondage.
      </p>
      <div>
        <SubmitButton pendingLabel="Un instant…">Ne plus recevoir ces résumés</SubmitButton>
      </div>
    </form>
  );
}
