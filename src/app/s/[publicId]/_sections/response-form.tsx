'use client';

import Link from 'next/link';
import { useActionState, useMemo, useState } from 'react';
import { DatePicker, type DayBadge, type MarkState } from '@/components/date-picker';
import { FieldError, FormAlert, Honeypot, SubmitButton } from '@/components/form-parts';
import { POLL_LIMITS } from '@/config/limits';
import { addDays, type Marks } from '@/lib/date-picker';
import { fieldError, keptText } from '@/lib/form-state';
import { submitResponseAction, withdrawResponseAction } from '../actions';

/** Un seul état : « disponible ». Chaque jour marqué part dans un champ `days`. */
const AVAILABLE: readonly MarkState[] = [{ label: 'disponible', plural: 'disponibles', tone: 'fill', name: 'days' }];

type Props = {
  publicId: string;
  /** Jours proposés par le créateur, `AAAA-MM-JJ`, triés. */
  pollDays: string[];
  today: string;
  /** Le sondage accepte des réponses : ouvert, avec au moins un jour à venir. */
  accepting: boolean;
  closed: boolean;
  requireAccount: boolean;
  user: { displayName: string } | null;
  existing: { pseudonym: string | null; days: string[] } | null;
  /** Pastilles de votes, par jour. */
  badges: Record<string, DayBadge>;
  /** Mois (`AAAA-MM`) qui portent des jours proposés. */
  markedMonths: string[];
  retainedDay: string | null;
};

/**
 * Le calendrier du sondage et le formulaire de réponse (contracts/pages.md).
 *
 * Seuls les jours proposés et à venir se choisissent (FR-015) : les autres
 * restent visibles, barrés ou hors bornes. Le serveur revérifie tout. Quand
 * on ne peut pas répondre - sondage clos, jours passés, compte exigé -, le
 * même calendrier se montre en consultation, pastilles comprises.
 */
export function ResponseForm(props: Props) {
  const { publicId, accepting, closed, requireAccount, user, existing } = props;

  if (closed) {
    return (
      <ReadOnly {...props}>
        <p className="text-[var(--color-text-muted)]">Ce sondage est clos : il n’accepte plus de réponse.</p>
      </ReadOnly>
    );
  }
  if (!accepting) {
    return (
      <ReadOnly {...props}>
        <p className="text-[var(--color-text-muted)]">
          Tous les jours proposés sont passés : ce sondage n’accepte plus de réponse.
        </p>
      </ReadOnly>
    );
  }
  if (!user && requireAccount) {
    return (
      <ReadOnly {...props}>
        <p>
          Le créateur de ce sondage demande de répondre avec un compte.{' '}
          <Link
            href={`/connexion?suite=${encodeURIComponent(`/s/${publicId}`)}`}
            className="font-medium text-[var(--color-ember)] underline-offset-4 hover:underline"
          >
            Se connecter pour répondre
          </Link>
        </p>
        {existing ? <WithdrawForm publicId={publicId} label="Retirer ma réponse sans compte" /> : null}
      </ReadOnly>
    );
  }
  // La réponse enregistrée change (créée, modifiée, retirée) : le formulaire
  // repart d'elle, jours cochés compris.
  return <AnswerForm {...props} key={existing ? `${existing.pseudonym}|${existing.days.join(',')}` : 'nouvelle'} />;
}

function ReadOnly({ pollDays, today, badges, markedMonths, retainedDay, children }: Props & { children: React.ReactNode }) {
  const firstUpcoming = pollDays.find((day) => day >= today) ?? pollDays[pollDays.length - 1] ?? today;
  return (
    <div className="flex flex-col gap-4">
      {children}
      <DatePicker
        mode="multiple"
        readOnly
        label="Disponibilités"
        today={today}
        highlighted={pollDays}
        highlightLabel="jour proposé"
        badges={badges}
        retainedDay={retainedDay}
        markedMonths={markedMonths}
        initialDay={retainedDay ?? firstUpcoming}
      />
    </div>
  );
}

function AnswerForm({ publicId, pollDays, today, user, existing, badges, markedMonths }: Props) {
  const [state, action] = useActionState(submitResponseAction, null);
  const pickable = useMemo(() => pollDays.filter((day) => day >= today), [pollDays, today]);
  const initial = useMemo<Marks>(
    () => Object.fromEntries((existing?.days ?? []).filter((day) => pickable.includes(day)).map((day) => [day, 1])),
    [existing, pickable],
  );
  const [marks, setMarks] = useState<Marks>(initial);

  // Bornes : du premier au dernier jour proposé encore à venir ; entre les
  // deux, les jours non proposés sont montrés barrés et ne se choisissent pas.
  const min = pickable[0] ?? today;
  const max = pickable[pickable.length - 1] ?? today;
  const disabled = useMemo(() => {
    const proposed = new Set(pickable);
    const out: string[] = [];
    for (let day = min; day <= max; day = addDays(day, 1)) if (!proposed.has(day)) out.push(day);
    return out;
  }, [pickable, min, max]);

  const pseudonymError = fieldError(state, 'pseudonym');
  const daysError = fieldError(state, 'days');

  return (
    <div className="flex flex-col gap-4">
      {existing ? (
        <p role="status" className="text-sm text-[var(--color-jade)]">
          Votre réponse est enregistrée : vous pouvez la modifier ou la retirer.
        </p>
      ) : null}
      <form action={action} className="flex flex-col gap-5" noValidate>
        <input type="hidden" name="publicId" value={publicId} />
        <Honeypot />
        <FormAlert state={state} />

        {user ? (
          <p className="text-sm text-[var(--color-text-muted)]">
            Vous répondez sous le nom de <span className="font-medium text-[var(--color-text)]">{user.displayName}</span>.
          </p>
        ) : (
          <div>
            <label htmlFor="pseudonym" className="mb-1.5 block text-sm font-medium">
              Votre nom ou un pseudo
            </label>
            <input
              id="pseudonym"
              name="pseudonym"
              required
              maxLength={POLL_LIMITS.pseudonymMax}
              autoComplete="nickname"
              defaultValue={keptText(state, 'pseudonym') ?? existing?.pseudonym ?? ''}
              aria-invalid={pseudonymError ? true : undefined}
              aria-describedby={pseudonymError ? 'pseudonym-erreur' : 'pseudonym-aide'}
              className={`field max-w-sm ${pseudonymError ? 'field-error' : ''}`}
            />
            <p id="pseudonym-aide" className="mt-1.5 text-sm text-[var(--color-text-faint)]">
              Visible par toutes les personnes qui ont le lien.{' '}
              <Link
                href={`/connexion?suite=${encodeURIComponent(`/s/${publicId}`)}`}
                className="text-[var(--color-ember)] underline-offset-4 hover:underline"
              >
                Se connecter pour répondre
              </Link>
            </p>
            <FieldError id="pseudonym-erreur" message={pseudonymError} />
          </div>
        )}

        <fieldset className="flex flex-col gap-2">
          <legend className="mb-1 text-sm font-medium">Vos disponibilités</legend>
          <p className="text-sm text-[var(--color-text-faint)]">
            Cochez les jours qui vous conviennent. Les pastilles comptent les votes déjà reçus ; survolez un jour pour
            voir qui a voté.
          </p>
          <DatePicker
            mode="multiple"
            label="Vos disponibilités"
            today={today}
            min={min}
            max={max}
            disabled={disabled}
            highlighted={pickable}
            highlightLabel="jour proposé"
            disabledLabel="non proposé"
            states={AVAILABLE}
            value={marks}
            onChange={setMarks}
            badges={badges}
            markedMonths={markedMonths}
          />
          <FieldError id="jours-erreur" message={daysError} />
        </fieldset>

        <div>
          <SubmitButton pendingLabel="Enregistrement…">{existing ? 'Mettre à jour' : 'Valider ma réponse'}</SubmitButton>
        </div>
      </form>
      {existing ? <WithdrawForm publicId={publicId} label="Retirer ma réponse" /> : null}
    </div>
  );
}

function WithdrawForm({ publicId, label }: { publicId: string; label: string }) {
  const [state, action] = useActionState(withdrawResponseAction, null);
  return (
    <form action={action} className="flex flex-col gap-2">
      <input type="hidden" name="publicId" value={publicId} />
      <FormAlert state={state} fieldsHandled={false} />
      <div>
        <SubmitButton className="btn-danger" pendingLabel="Retrait…">
          {label}
        </SubmitButton>
      </div>
    </form>
  );
}
