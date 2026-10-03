'use client';

import { ActionForm, ConfirmSubmit } from '@/components/action-form';
import { plural } from '@/lib/text';
import { deleteUserAction } from '../actions';

/**
 * Supprimer un compte depuis la liste (FR-047), après confirmation. La page
 * de la liste et sa recherche voyagent avec l'envoi : l'action y revient.
 */
export function DeleteUserForm({
  userId,
  displayName,
  polls,
  q,
  page,
}: {
  userId: string;
  displayName: string;
  polls: number;
  q: string;
  page: number;
}) {
  return (
    <ActionForm action={deleteUserAction} className="flex flex-col gap-2 sm:items-end">
      {() => (
        <>
          <input type="hidden" name="userId" value={userId} />
          <input type="hidden" name="q" value={q} />
          <input type="hidden" name="page" value={page} />
          <ConfirmSubmit
            label={
              <>
                Supprimer<span className="sr-only"> le compte de {displayName}</span>
              </>
            }
            confirmLabel="Supprimer définitivement"
            question={`Supprimer le compte de ${displayName}, ${pollsWord(polls)} et ses réponses ?`}
          />
        </>
      )}
    </ActionForm>
  );
}

function pollsWord(polls: number): string {
  if (polls === 0) return 'sans sondage';
  return polls === 1 ? 'son sondage' : `ses ${plural(polls, 'sondage')}`;
}
