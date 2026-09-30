'use client';

import { useActionState, useMemo, useState } from 'react';
import { ActionForm, ConfirmSubmit } from '@/components/action-form';
import { CopyLink } from '@/components/copy-link';
import { DatePicker, type DayBadge, type MarkState } from '@/components/date-picker';
import { FieldError, FormAlert, SubmitButton } from '@/components/form-parts';
import { POLL_LIMITS } from '@/config/limits';
import { draftChanges, draftFromMarks, draftMarks, EMPTY_DRAFT, lockedDays, type DaysDraft, type SavedDays } from '@/lib/days-draft';
import { fieldError, type FormState } from '@/lib/form-state';
import { formatLongDay } from '@/lib/paris-day';
import {
  changePollDaysAction,
  closePollAction,
  deletePollAction,
  deleteResponseAction,
  reopenPollAction,
  setPollOptionsAction,
  setRetainedDayAction,
  updatePollDetailsAction,
} from '../actions';

/** Un seul état : « proposé ». Les champs partent du brouillon, pas du calendrier. */
const PROPOSED: readonly MarkState[] = [{ label: 'proposé', plural: 'proposés', tone: 'fill' }];

type Props = {
  publicId: string;
  shareUrl: string;
  title: string;
  description: string | null;
  status: 'OPEN' | 'CLOSED';
  retainedDay: string | null;
  days: string[];
  /** Pastilles de votes, par jour : un jour voté ne se retire plus. */
  badges: Record<string, DayBadge>;
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

      <DaysSection {...props} />

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

/**
 * Les jours proposés, sur le seul calendrier (FR-027, décision 031) : un jour
 * orangé est proposé et sans vote - un clic le retire -, un jour gris a déjà
 * reçu un vote et reste, un jour libre s'ajoute d'un clic. Rien ne part avant
 * « Enregistrer les jours », qui envoie ajouts et retraits ensemble.
 */
function DaysSection(props: Props) {
  const [state, action] = useActionState(changePollDaysAction, null);
  return (
    <div className={SECTION}>
      <h3 className={TITLE}>Jours proposés</h3>
      <p className="text-sm text-[var(--color-text-subtle)]">
        Touchez un jour libre pour l’ajouter, un jour orangé pour le retirer. Les jours grisés ont déjà reçu un vote :
        ils restent.
      </p>
      <form action={action} className="flex flex-col gap-3">
        {/* Les jours enregistrés changent : le brouillon repart de zéro. */}
        <DaysEditor key={props.days.join(',')} {...props} state={state} />
      </form>
    </div>
  );
}

function DaysEditor({ publicId, days, badges, retainedDay, today, state }: Props & { state: FormState }) {
  const [draft, setDraft] = useState<DaysDraft>(EMPTY_DRAFT);
  // Relu à chaque mise à jour en direct : un vote arrivé pendant qu'on
  // prépare ses changements verrouille aussitôt son jour.
  const saved = useMemo<SavedDays>(
    () => ({ days, voted: new Set(Object.keys(badges).filter((day) => badges[day]!.count > 0)), retainedDay }),
    [days, badges, retainedDay],
  );
  const locked = useMemo(() => lockedDays(saved), [saved]);
  const marks = useMemo(() => draftMarks(saved, draft), [saved, draft]);
  const changes = draftChanges(saved, draft);
  const dirty = changes.add.length + changes.remove.length > 0;
  const markedMonths = [
    ...new Set([...days, ...changes.add].filter((day) => day >= today).map((day) => day.slice(0, 7))),
  ].sort();

  return (
    <>
      <input type="hidden" name="publicId" value={publicId} />
      {changes.add.map((day) => (
        <input key={`add-${day}`} type="hidden" name="add" value={day} />
      ))}
      {changes.remove.map((day) => (
        <input key={`remove-${day}`} type="hidden" name="remove" value={day} />
      ))}
      {/* Un retrait devancé par un vote est dit ci-dessous : l'erreur du serveur n'y ajouterait rien. */}
      {state?.error?.code === 'DAY_HAS_VOTES' && changes.overtaken.length > 0 ? null : <FormAlert state={state} />}
      {changes.overtaken.length > 0 ? (
        <p
          role="alert"
          data-testid="retrait-devance"
          className="rounded-[10px] border border-[color-mix(in_oklab,var(--color-rust)_45%,transparent)] bg-[color-mix(in_oklab,var(--color-rust)_8%,transparent)] px-4 py-3 text-sm"
        >
          {overtakenMessage(changes.overtaken)}
        </p>
      ) : null}
      <DatePicker
        mode="multiple"
        months={2}
        label="Jours proposés"
        today={today}
        min={today}
        states={PROPOSED}
        value={marks}
        onChange={(next) => setDraft((previous) => draftFromMarks(next, saved, previous))}
        locked={locked}
        lockedLabel="déjà voté"
        withdrawn={changes.remove}
        withdrawnLabel="à retirer"
        badges={badges}
        retainedDay={retainedDay}
        markedMonths={markedMonths}
        initialDay={days.find((day) => day >= today) ?? null}
        summary={
          <p aria-live="polite" className="text-xs text-[var(--color-text-muted)]">
            {dirty ? (
              <>
                {[
                  changes.add.length > 0 ? `${dayCount(changes.add.length)} à ajouter` : null,
                  changes.remove.length > 0 ? `${dayCount(changes.remove.length)} à retirer` : null,
                ]
                  .filter(Boolean)
                  .join(' · ')}
                {' · '}
                <button
                  type="button"
                  onClick={() => setDraft(EMPTY_DRAFT)}
                  className="text-[var(--color-ember)] underline-offset-2 hover:underline"
                >
                  Annuler les changements
                </button>
              </>
            ) : (
              'Aucun changement'
            )}
          </p>
        }
      />
      <FieldError id="jours-erreur" message={fieldError(state, 'days')} />
      {changes.remaining === 0 ? (
        <p className="text-sm text-[var(--color-danger)]">Un sondage garde au moins un jour.</p>
      ) : null}
      <div>
        <SubmitButton className="btn-ghost" disabled={!dirty || changes.remaining === 0}>
          Enregistrer les jours
        </SubmitButton>
      </div>
      {state?.done && !dirty ? (
        <p role="status" className="text-sm text-[var(--color-jade)]">
          Jours enregistrés.
        </p>
      ) : null}
    </>
  );
}

function dayCount(n: number): string {
  return `${n} jour${n > 1 ? 's' : ''}`;
}

/** « Le lundi 12 octobre vient de recevoir un vote : il reste dans le sondage. » */
function overtakenMessage(days: readonly string[]): string {
  const names = days.map((day) => `le ${formatLongDay(day)}`);
  const list = names.length > 1 ? `${names.slice(0, -1).join(', ')} et ${names[names.length - 1]}` : names[0]!;
  const subject = list.charAt(0).toUpperCase() + list.slice(1);
  return names.length > 1
    ? `${subject} viennent de recevoir un vote : ils restent dans le sondage.`
    : `${subject} vient de recevoir un vote : il reste dans le sondage.`;
}

