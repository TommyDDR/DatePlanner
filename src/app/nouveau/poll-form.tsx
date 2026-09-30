'use client';

import { useActionState, useState } from 'react';
import { DatePicker, type MarkState } from '@/components/date-picker';
import { FieldError, FormAlert, SubmitButton } from '@/components/form-parts';
import { POLL_LIMITS } from '@/config/limits';
import { fieldError, keptText } from '@/lib/form-state';
import type { Marks } from '@/lib/date-picker';
import { createPollAction } from './actions';

/** Un seul état : « proposé ». Chaque jour marqué part dans un champ `days`. */
const PROPOSED: readonly MarkState[] = [{ label: 'proposé', plural: 'proposés', tone: 'fill', name: 'days' }];

export function PollForm({ today }: { today: string }) {
  const [state, action] = useActionState(createPollAction, null);
  const [marks, setMarks] = useState<Marks>({});
  const [description, setDescription] = useState('');
  const count = Object.keys(marks).length;
  const tooMany = count > POLL_LIMITS.maxDays;

  const errors = {
    title: fieldError(state, 'title'),
    description: fieldError(state, 'description'),
    days: fieldError(state, 'days'),
  };

  return (
    <form action={action} className="flex flex-col gap-8" noValidate>
      <FormAlert state={state} />

      <div className="flex flex-col gap-5">
        <div>
          <label htmlFor="title" className="mb-1.5 block text-sm font-medium">
            Titre du sondage
          </label>
          <input
            id="title"
            name="title"
            required
            maxLength={POLL_LIMITS.titleMax}
            placeholder="Dîner de rentrée, réunion de bureau…"
            defaultValue={keptText(state, 'title')}
            aria-invalid={errors.title ? true : undefined}
            aria-describedby={errors.title ? 'title-erreur' : undefined}
            className={`field ${errors.title ? 'field-error' : ''}`}
          />
          <FieldError id="title-erreur" message={errors.title} />
        </div>
        <div>
          <label htmlFor="description" className="mb-1.5 block text-sm font-medium">
            Description <span className="font-normal text-[var(--color-text-subtle)]">(facultative)</span>
          </label>
          <textarea
            id="description"
            name="description"
            rows={3}
            maxLength={POLL_LIMITS.descriptionMax}
            defaultValue={keptText(state, 'description')}
            onChange={(event) => setDescription(event.target.value)}
            aria-invalid={errors.description ? true : undefined}
            aria-describedby="description-compte"
            className={`field resize-y ${errors.description ? 'field-error' : ''}`}
          />
          <p id="description-compte" className="mt-1 text-right text-xs text-[var(--color-text-subtle)] tabular-nums">
            {description.length} / {POLL_LIMITS.descriptionMax}
          </p>
          <FieldError id="description-erreur" message={errors.description} />
        </div>
      </div>

      <fieldset className="flex flex-col gap-3">
        <legend className="mb-1 text-sm font-medium">Jours proposés</legend>
        <p id="jours-aide" className="text-sm text-[var(--color-text-muted)]">
          Cliquez sur les jours, faites glisser pour une plage, ou choisissez une colonne ou une semaine entière.
        </p>
        <DatePicker
          mode="multiple"
          label="Jours proposés"
          today={today}
          min={today}
          states={PROPOSED}
          value={marks}
          onChange={setMarks}
        />
        {tooMany ? (
          <p className="text-sm text-[var(--color-rust)]">Un sondage propose au plus {POLL_LIMITS.maxDays} jours.</p>
        ) : null}
        <FieldError id="jours-erreur" message={errors.days} />
      </fieldset>

      <fieldset className="flex flex-col gap-3">
        <legend className="mb-1 text-sm font-medium">Options</legend>
        <label className="flex items-start gap-3">
          <input
            type="checkbox"
            name="requireAccount"
            defaultChecked={state?.values?.requireAccount === 'on'}
            className="mt-1 size-4 accent-[var(--color-ember)]"
          />
          <span>
            Répondants connectés uniquement
            <span className="block text-sm text-[var(--color-text-subtle)]">
              Sans cette option, on peut répondre sous un simple pseudo.
            </span>
          </span>
        </label>
        <label className="flex items-start gap-3">
          <input
            type="checkbox"
            name="notifyOwner"
            defaultChecked={state?.values ? state.values.notifyOwner === 'on' : true}
            className="mt-1 size-4 accent-[var(--color-ember)]"
          />
          <span>
            Me prévenir des nouvelles réponses par email
            <span className="block text-sm text-[var(--color-text-subtle)]">
              Au plus un email toutes les trente minutes, qui les regroupe.
            </span>
          </span>
        </label>
      </fieldset>

      <div>
        <SubmitButton pendingLabel="Création…">Créer le sondage</SubmitButton>
      </div>
    </form>
  );
}
