import type { Day } from '@/lib/paris-day';

/**
 * États d'un sondage - module PUR (data-model.md, FR-026).
 *
 *            close(dates?)                      setRetainedDays(dates)
 *   OPEN ─────────────────▶ CLOSED ◀──────────────────────────────┐
 *    ▲                        │  └─────────────────────────────────┘
 *    └────── reopen() ────────┘   (rouvrir efface les dates retenues)
 *
 * Un sondage retient au plus une date, ou plusieurs s'il le permet
 * (`multiple`, décision 039). Les dates retenues sont rendues triées, sans
 * doublon.
 *
 * `announce` dit quelles dates annoncer aux répondants connectés (FR-042) :
 * toutes les dates retenues, quand elles ont changé et qu'il en reste. Des
 * dates inchangées, ou toutes retirées, ne s'annoncent pas.
 */

export type PollState = { status: 'OPEN' | 'CLOSED'; retainedDays: readonly Day[] };

export type Transition =
  | { kind: 'close'; retainedDays?: readonly Day[] }
  | { kind: 'setRetainedDays'; retainedDays: readonly Day[] }
  | { kind: 'reopen' };

/** Ce que la transition doit savoir du sondage : ses jours, et s'il retient plusieurs dates. */
export type PollFrame = { days: ReadonlySet<Day>; multiple: boolean };

export type TransitionResult =
  | { ok: true; next: PollState; announce: Day[] | null }
  | { ok: false; error: 'INVALID_STATE' | 'NOT_A_POLL_DAY' | 'SINGLE_RETAINED_DAY' };

export function applyTransition(state: PollState, transition: Transition, frame: PollFrame): TransitionResult {
  switch (transition.kind) {
    case 'close':
    case 'setRetainedDays': {
      if (state.status !== (transition.kind === 'close' ? 'OPEN' : 'CLOSED')) return { ok: false, error: 'INVALID_STATE' };
      const days = [...new Set(transition.retainedDays ?? [])].sort();
      if (days.some((day) => !frame.days.has(day))) return { ok: false, error: 'NOT_A_POLL_DAY' };
      if (days.length > 1 && !frame.multiple) return { ok: false, error: 'SINGLE_RETAINED_DAY' };
      const changed = days.join(',') !== [...state.retainedDays].sort().join(',');
      return { ok: true, next: { status: 'CLOSED', retainedDays: days }, announce: changed && days.length > 0 ? days : null };
    }
    case 'reopen': {
      if (state.status !== 'CLOSED') return { ok: false, error: 'INVALID_STATE' };
      return { ok: true, next: { status: 'OPEN', retainedDays: [] }, announce: null };
    }
  }
}
