import { byPopularity, voteCountLabel, type DayAvailability } from '@/lib/availability';
import { formatLongDay } from '@/lib/paris-day';

/**
 * « Qui est disponible ? » (FR-021, research.md R9).
 *
 * Toujours visible sous le calendrier : c'est elle qui sert l'écran tactile,
 * où le toucher d'un jour reste réservé à la sélection, et les lecteurs
 * d'écran, qui y lisent tout d'un trait. Les jours y vont du plus voté au
 * moins voté, le plus proche d'abord à égalité : la réponse à « quel jour ? »
 * est en haut. La date retenue y est mise en tête de sa ligne.
 */
export function AvailabilityList({
  availability,
  retainedDay,
}: {
  availability: readonly DayAvailability[];
  retainedDay: string | null;
}) {
  if (availability.length === 0) {
    return <p className="text-sm text-[var(--color-text-muted)]">Personne n’a encore répondu.</p>;
  }
  const best = Math.max(...availability.map((day) => day.count));

  return (
    <ul className="flex flex-col divide-y divide-[var(--color-rule)]" data-testid="disponibilites">
      {byPopularity(availability).map(({ day, count, voters }) => (
        <li key={day} className="flex flex-col gap-1.5 py-3 sm:flex-row sm:items-baseline sm:gap-4">
          <p className="flex shrink-0 items-center gap-2 sm:w-64">
            <span
              className={`grid h-6 min-w-6 place-items-center rounded-full px-1.5 font-mono text-xs font-semibold ${
                day === retainedDay
                  ? 'bg-[var(--color-retained)] text-[var(--color-on-retained)]'
                  : 'bg-[var(--color-vote)] text-[var(--color-on-vote)]'
              }`}
              aria-hidden="true"
            >
              {count}
            </span>
            <span className="font-medium first-letter:uppercase">{formatLongDay(day)}</span>
            <span className="sr-only">: {voteCountLabel(count)}</span>
            {day === retainedDay ? <span className="label-tech !text-[var(--color-jade)]">date retenue</span> : null}
            {count === best && day !== retainedDay && availability.length > 1 ? (
              <span className="label-tech">le plus choisi</span>
            ) : null}
          </p>
          <p className="text-sm text-[var(--color-text-muted)]">
            {voters.map((voter, index) => (
              <span key={`${voter.name}-${index}`}>
                {index > 0 ? ', ' : null}
                {voter.name}
                {voter.account ? <span className="sr-only"> (avec un compte)</span> : null}
                {voter.account ? (
                  <span aria-hidden="true" title="Réponse avec un compte" className="ml-0.5 text-[var(--color-jade)]">
                    ✓
                  </span>
                ) : null}
              </span>
            ))}
          </p>
        </li>
      ))}
    </ul>
  );
}
