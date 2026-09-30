import { describe, expect, it } from 'vitest';
import { applyTransition, type PollState } from '@/lib/poll-state';

/** États d'un sondage (data-model.md, « Transitions d'état »). */

const DAYS = new Set(['2026-10-01', '2026-10-02']);
const OPEN: PollState = { status: 'OPEN', retainedDay: null };
const CLOSED: PollState = { status: 'CLOSED', retainedDay: null };

describe('close', () => {
  it('clôt sans date retenue, sans rien annoncer', () => {
    expect(applyTransition(OPEN, { kind: 'close' }, DAYS)).toEqual({ ok: true, next: CLOSED, announce: null });
  });

  it('clôt avec une date retenue du sondage, et l’annonce', () => {
    expect(applyTransition(OPEN, { kind: 'close', retainedDay: '2026-10-02' }, DAYS)).toEqual({
      ok: true,
      next: { status: 'CLOSED', retainedDay: '2026-10-02' },
      announce: '2026-10-02',
    });
  });

  it('refuse un jour étranger au sondage', () => {
    expect(applyTransition(OPEN, { kind: 'close', retainedDay: '2026-10-09' }, DAYS)).toEqual({
      ok: false,
      error: 'NOT_A_POLL_DAY',
    });
  });

  it('refuse de clore un sondage déjà clos', () => {
    expect(applyTransition(CLOSED, { kind: 'close' }, DAYS)).toEqual({ ok: false, error: 'INVALID_STATE' });
  });
});

describe('setRetainedDay', () => {
  it('n’existe que sur un sondage clos', () => {
    expect(applyTransition(OPEN, { kind: 'setRetainedDay', retainedDay: '2026-10-01' }, DAYS)).toEqual({
      ok: false,
      error: 'INVALID_STATE',
    });
  });

  it('annonce une date nouvelle, pas une date inchangée ni une date retirée', () => {
    const withDay: PollState = { status: 'CLOSED', retainedDay: '2026-10-01' };
    expect(applyTransition(withDay, { kind: 'setRetainedDay', retainedDay: '2026-10-02' }, DAYS)).toMatchObject({
      ok: true,
      announce: '2026-10-02',
    });
    expect(applyTransition(withDay, { kind: 'setRetainedDay', retainedDay: '2026-10-01' }, DAYS)).toMatchObject({
      ok: true,
      announce: null,
    });
    expect(applyTransition(withDay, { kind: 'setRetainedDay', retainedDay: null }, DAYS)).toEqual({
      ok: true,
      next: CLOSED,
      announce: null,
    });
  });
});

describe('reopen', () => {
  it('rouvre et efface la date retenue', () => {
    expect(applyTransition({ status: 'CLOSED', retainedDay: '2026-10-01' }, { kind: 'reopen' }, DAYS)).toEqual({
      ok: true,
      next: OPEN,
      announce: null,
    });
  });

  it('refuse de rouvrir un sondage ouvert', () => {
    expect(applyTransition(OPEN, { kind: 'reopen' }, DAYS)).toEqual({ ok: false, error: 'INVALID_STATE' });
  });
});
