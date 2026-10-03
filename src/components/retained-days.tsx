import { formatLongDay, type Day } from '@/lib/paris-day';
import { plural } from '@/lib/text';

/** Les dates retenues nommées sur une ligne ; au-delà, leur nombre. */
const RETAINED_SHOWN = 3;

/** Les dates retenues d'un sondage d'une liste, en jade (décision 039). */
export function RetainedDays({ days }: { days: readonly Day[] }) {
  return (
    <>
      {days.slice(0, RETAINED_SHOWN).map((day) => (
        <span
          key={day}
          className="rounded-full bg-[var(--color-retained)] px-2.5 py-0.5 text-[var(--color-on-retained)] first-letter:uppercase"
        >
          {formatLongDay(day)}
        </span>
      ))}
      {days.length > RETAINED_SHOWN ? (
        <span className="text-[var(--color-text-muted)]">
          et {plural(days.length - RETAINED_SHOWN, 'autre date', 'autres dates')}
        </span>
      ) : null}
    </>
  );
}
