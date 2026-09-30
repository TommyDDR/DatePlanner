'use client';

import { useMemo, useState } from 'react';
import { ActionForm, ConfirmSubmit } from '@/components/action-form';
import { CopyLink } from '@/components/copy-link';
import { DatePicker, type MarkState } from '@/components/date-picker';
import { FieldError, SubmitButton } from '@/components/form-parts';
import { POLL_LIMITS } from '@/config/limits';
import type { Marks } from '@/lib/date-picker';
import { fieldError } from '@/lib/form-state';
import { formatLongDay } from '@/lib/paris-day';
import { voteCountLabel } from '@/lib/availability';
import {
  addPollDaysAction,
  closePollAction,
  deletePollAction,
  deleteResponseAction,
  removePollDayAction,
  reopenPollAction,
  setPollOptionsAction,
  setRetainedDayAction,
  updatePollDetailsAction,
} from '../actions';

const NEW_DAYS: readonly MarkState[] = [{ label: 'à ajouter', plural: 'à ajouter', tone: 'fill', name: 'days' }];

type Props = {
  publicId: string;
  shareUrl: string;
  title: string;
  description: string | null;
  status: 'OPEN' | 'CLOSED';
  retainedDay: string | null;
  days: string[];
  votesByDay: Record<string, number>;
  responses: Array<{ id: string; name: string; account: boolean }>;
  requireAccount: boolean;
  notifyOwner: boolean;
  today: string;
  /** Faux juste après la création : le bandeau « Sondage créé » montre déjà le lien. */
  showShare: boolean;
};

const SECTION = 'flex flex-col gap-3 border-t border-[var(--color-rule)] pt-5';
const TITLE = 'text-base font-semibold';

/**
 * Le panneau du créateur (contracts/pages.md), rendu à lui seul : partage,
 * titre, jours, options, clôture, réponses, suppression. Chaque geste est une
 * action serveur qui revérifie le propriétaire (FR-028).
 */
export function OwnerPanel(props: Props) {
  const { publicId } = props;
  const hidden = <input type="hidden" name="publicId" value={publicId} />;

  return (
    <section aria-labelledby="gestion" className="surface-raised flex flex-col gap-5 p-4 sm:p-6">
      <div className="flex flex-col gap-1">
        <p className="label-tech">Vous êtes le créateur</p>
        <h2 id="gestion" className="text-lg font-semibold">
          Gérer le sondage
        </h2>
      </div>

      {props.showShare ? <CopyLink url={props.shareUrl} /> : null}

      <ClosingSection {...props} />

      <div className={SECTION}>
        <h3 className={TITLE}>Titre et description</h3>
        <ActionForm action={updatePollDetailsAction} success="Enregistré.">
          {(state) => (
            <>
              {hidden}
              <label htmlFor="gestion-titre" className="text-sm font-medium">
                Titre
              </label>
              <input
                id="gestion-titre"
                name="title"
                required
                maxLength={POLL_LIMITS.titleMax}
                defaultValue={props.title}
                className="field"
              />
              <FieldError id="gestion-titre-erreur" message={fieldError(state, 'title')} />
              <label htmlFor="gestion-description" className="text-sm font-medium">
                Description
              </label>
              <textarea
                id="gestion-description"
                name="description"
                rows={3}
                maxLength={POLL_LIMITS.descriptionMax}
                defaultValue={props.description ?? ''}
                className="field resize-y"
              />
              <div>
                <SubmitButton className="btn-ghost">Enregistrer</SubmitButton>
              </div>
            </>
          )}
        </ActionForm>
      </div>

      {/* Les jours changent : la section repart de zéro, sélection comprise. */}
      <DaysSection key={props.days.join(',')} {...props} />

      <div className={SECTION}>
        <h3 className={TITLE}>Options</h3>
        <ActionForm action={setPollOptionsAction} success="Options enregistrées.">
          {() => (
            <>
              {hidden}
              <label className="flex items-start gap-3">
                <input type="checkbox" name="requireAccount" defaultChecked={props.requireAccount} className="mt-1 size-4 accent-[var(--color-ember)]" />
                <span>Répondants connectés uniquement</span>
              </label>
              <label className="flex items-start gap-3">
                <input type="checkbox" name="notifyOwner" defaultChecked={props.notifyOwner} className="mt-1 size-4 accent-[var(--color-ember)]" />
                <span>Me prévenir des nouvelles réponses par email</span>
              </label>
              <div>
                <SubmitButton className="btn-ghost">Enregistrer les options</SubmitButton>
              </div>
            </>
          )}
        </ActionForm>
      </div>

      <div className={SECTION}>
        <h3 className={TITLE}>Réponses reçues</h3>
        {props.responses.length === 0 ? (
          <p className="text-sm text-[var(--color-text-muted)]">Aucune réponse pour l’instant.</p>
        ) : (
          <ul className="flex flex-col divide-y divide-[var(--color-rule)]">
            {props.responses.map((response) => (
              <li key={response.id} className="flex flex-wrap items-center justify-between gap-3 py-2">
                <span>
                  {response.name}
                  {response.account ? <span className="label-tech ml-2 !text-[var(--color-jade)]">compte</span> : null}
                </span>
                <ActionForm action={deleteResponseAction} className="flex flex-col gap-2">
                  {() => (
                    <>
                      {hidden}
                      <input type="hidden" name="responseId" value={response.id} />
                      <ConfirmSubmit
                        label="Supprimer"
                        confirmLabel="Supprimer la réponse"
                        question={`Supprimer la réponse de ${response.name} ?`}
                      />
                    </>
                  )}
                </ActionForm>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className={SECTION}>
        <h3 className={TITLE}>Supprimer le sondage</h3>
        <p className="text-sm text-[var(--color-text-muted)]">Le sondage et toutes ses réponses disparaissent ; le lien ne mène plus à rien.</p>
        <ActionForm action={deletePollAction}>
          {() => (
            <>
              {hidden}
              <ConfirmSubmit
                label="Supprimer le sondage"
                confirmLabel="Supprimer définitivement"
                question="Supprimer ce sondage et toutes ses réponses ?"
              />
            </>
          )}
        </ActionForm>
      </div>
    </section>
  );
}

function RetainedDaySelect({ days, value, name = 'retainedDay' }: { days: string[]; value: string | null; name?: string }) {
  return (
    <select name={name} defaultValue={value ?? ''} className="field max-w-sm" aria-label="Date retenue">
      <option value="">Sans date retenue</option>
      {days.map((day) => (
        <option key={day} value={day}>
          {formatLongDay(day)}
        </option>
      ))}
    </select>
  );
}

function ClosingSection({ publicId, status, retainedDay, days }: Props) {
  const hidden = <input type="hidden" name="publicId" value={publicId} />;
  if (status === 'OPEN') {
    return (
      <div className={SECTION}>
        <h3 className={TITLE}>Clore le sondage</h3>
        <p className="text-sm text-[var(--color-text-muted)]">
          Plus personne ne pourra répondre. Désignez la date retenue : les répondants connectés en seront prévenus par email.
        </p>
        <ActionForm action={closePollAction}>
          {(state) => (
            <>
              {hidden}
              <RetainedDaySelect days={days} value={null} />
              <FieldError id="clore-erreur" message={fieldError(state, 'retainedDay')} />
              <div>
                <SubmitButton>Clore le sondage</SubmitButton>
              </div>
            </>
          )}
        </ActionForm>
      </div>
    );
  }
  return (
    <div className={SECTION}>
      <h3 className={TITLE}>Sondage clos</h3>
      <ActionForm action={setRetainedDayAction} success="Date retenue enregistrée.">
        {() => (
          <>
            {hidden}
            <RetainedDaySelect days={days} value={retainedDay} />
            <div>
              <SubmitButton className="btn-ghost">Enregistrer la date retenue</SubmitButton>
            </div>
          </>
        )}
      </ActionForm>
      <ActionForm action={reopenPollAction}>
        {() => (
          <>
            {hidden}
            <div>
              <SubmitButton className="btn-ghost">Rouvrir le sondage</SubmitButton>
            </div>
          </>
        )}
      </ActionForm>
    </div>
  );
}

function DaysSection({ publicId, days, votesByDay, retainedDay, today }: Props) {
  const hidden = <input type="hidden" name="publicId" value={publicId} />;
  const [marks, setMarks] = useState<Marks>({});
  const existing = useMemo(() => days.filter((day) => day >= today), [days, today]);

  return (
    <div className={SECTION}>
      <h3 className={TITLE}>Jours proposés</h3>
      <ul className="flex flex-col gap-1">
        {days.map((day) => {
          const votes = votesByDay[day] ?? 0;
          const removable = votes === 0 && day !== retainedDay && days.length > 1;
          return (
            <li key={day} className="flex flex-wrap items-center justify-between gap-2">
              <span className="first-letter:uppercase">
                {formatLongDay(day)}
                <span className="ml-2 text-sm text-[var(--color-text-faint)]">{votes > 0 ? voteCountLabel(votes) : 'aucun vote'}</span>
              </span>
              {removable ? (
                <ActionForm action={removePollDayAction} className="flex items-center gap-2">
                  {() => (
                    <>
                      {hidden}
                      <input type="hidden" name="day" value={day} />
                      <SubmitButton className="text-sm text-[var(--color-rust)] underline-offset-4 hover:underline">
                        <span>
                          Retirer<span className="sr-only"> le {formatLongDay(day)}</span>
                        </span>
                      </SubmitButton>
                    </>
                  )}
                </ActionForm>
              ) : null}
            </li>
          );
        })}
      </ul>
      <ActionForm action={addPollDaysAction} success="Jours ajoutés.">
        {(state) => (
          <>
            {hidden}
            <p className="text-sm font-medium">Ajouter des jours</p>
            <DatePicker
              mode="multiple"
              label="Jours à ajouter"
              today={today}
              min={today}
              disabled={existing}
              disabledLabel="déjà proposé"
              states={NEW_DAYS}
              value={marks}
              onChange={setMarks}
            />
            <FieldError id="ajout-erreur" message={fieldError(state, 'days')} />
            <div>
              <SubmitButton className="btn-ghost">Ajouter ces jours</SubmitButton>
            </div>
          </>
        )}
      </ActionForm>
    </div>
  );
}
