'use client';

import { ActionForm, ConfirmSubmit } from '@/components/action-form';
import { FieldError, SubmitButton } from '@/components/form-parts';
import { PasswordInput } from '@/components/password-input';
import { POLL_LIMITS } from '@/config/limits';
import { fieldError } from '@/lib/form-state';
import { deleteAccountAction, updateDisplayNameAction } from './actions';

export function AccountForms({ displayName, hasPassword }: { displayName: string; hasPassword: boolean }) {
  return (
    <>
      <div className="surface flex flex-col gap-3 p-5">
        <h2 className="text-lg font-semibold">Nom d’affichage</h2>
        <ActionForm action={updateDisplayNameAction} success="Nom enregistré.">
          {(state) => (
            <>
              <label htmlFor="displayName" className="text-sm font-medium">
                Le nom que voient les personnes qui répondent à vos sondages
              </label>
              <input
                id="displayName"
                name="displayName"
                required
                maxLength={POLL_LIMITS.displayNameMax}
                defaultValue={displayName}
                className="field max-w-sm"
              />
              <FieldError id="displayName-erreur" message={fieldError(state, 'displayName')} />
              <div>
                <SubmitButton className="btn-ghost">Enregistrer</SubmitButton>
              </div>
            </>
          )}
        </ActionForm>
      </div>

      <div className="surface flex flex-col gap-3 p-5">
        <h2 className="text-lg font-semibold">Supprimer mon compte</h2>
        <p className="text-sm text-[var(--color-text-muted)]">
          Vos sondages, leurs réponses et les réponses que vous avez données disparaissent. C’est définitif.
        </p>
        <ActionForm action={deleteAccountAction}>
          {() => (
            <>
              {hasPassword ? (
                <div className="flex flex-col gap-1.5">
                  <label htmlFor="password" className="text-sm font-medium">
                    Votre mot de passe, pour confirmer
                  </label>
                  <div className="max-w-sm">
                    <PasswordInput id="password" name="password" autoComplete="current-password" />
                  </div>
                </div>
              ) : (
                <p className="text-sm text-[var(--color-text-muted)]">
                  Votre compte se connecte avec Google : si votre connexion date de plus de dix minutes, déconnectez-vous
                  puis reconnectez-vous avant de le supprimer.
                </p>
              )}
              <ConfirmSubmit
                label="Supprimer mon compte"
                confirmLabel="Supprimer définitivement"
                question="Supprimer votre compte et tout ce qui s’y rattache ?"
              />
            </>
          )}
        </ActionForm>
      </div>
    </>
  );
}
