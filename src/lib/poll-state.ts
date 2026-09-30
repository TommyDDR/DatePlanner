import type { Day } from '@/lib/paris-day';

/**
 * États d'un sondage - module PUR (data-model.md, FR-026).
 *
 *            close(date?)                       setRetainedDay(date | null)
 *   OPEN ─────────────────▶ CLOSED ◀──────────────────────────────┐
 *    ▲                        │  └─────────────────────────────────┘
 *    └────── reopen() ────────┘   (rouvrir efface la date retenue)
 *
 * `announce` dit quelle date annoncer aux répondants connectés (FR-042) : une
 * date retenue désignée ou CHANGÉE. Une date inchangée ou retirée ne s'annonce
 * pas.
 */

export type PollState = { status: 'OPEN' | 'CLOSED'; retainedDay: Day | null };

export type Transition =
  | { kind: 'close'; retainedDay?: Day | null }
  | { kind: 'setRetainedDay'; retainedDay: Day | null }
  | { kind: 'reopen' };

export type TransitionResult =
  | { ok: true; next: PollState; announce: Day | null }
  | { ok: false; error: 'INVALID_STATE' | 'NOT_A_POLL_DAY' };

export function applyTransition(
  state: PollState,
  transition: Transition,
  pollDays: ReadonlySet<Day>,
): TransitionResult {
  switch (transition.kind) {
    case 'close': {
      if (state.status !== 'OPEN') return { ok: false, error: 'INVALID_STATE' };
      const day = transition.retainedDay ?? null;
      if (day !== null && !pollDays.has(day)) return { ok: false, error: 'NOT_A_POLL_DAY' };
      return { ok: true, next: { status: 'CLOSED', retainedDay: day }, announce: day };
    }
    case 'setRetainedDay': {
      if (state.status !== 'CLOSED') return { ok: false, error: 'INVALID_STATE' };
      const day = transition.retainedDay;
      if (day !== null && !pollDays.has(day)) return { ok: false, error: 'NOT_A_POLL_DAY' };
      const announce = day !== null && day !== state.retainedDay ? day : null;
      return { ok: true, next: { status: 'CLOSED', retainedDay: day }, announce };
    }
    case 'reopen': {
      if (state.status !== 'CLOSED') return { ok: false, error: 'INVALID_STATE' };
      return { ok: true, next: { status: 'OPEN', retainedDay: null }, announce: null };
    }
  }
}
