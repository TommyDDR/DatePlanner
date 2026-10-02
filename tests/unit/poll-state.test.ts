import { describe, expect, it } from 'vitest';
import { applyTransition, type PollFrame, type PollState } from '@/lib/poll-state';

/** États d'un sondage (data-model.md, « Transitions d'état »). */

const DAYS = new Set(['2026-10-01', '2026-10-02', '2026-10-03']);
const SINGLE: PollFrame = { days: DAYS, multiple: false };
const MULTIPLE: PollFrame = { days: DAYS, multiple: true };
const OPEN: PollState = { status: 'OPEN', retainedDays: [] };
const CLOSED: PollState = { status: 'CLOSED', retainedDays: [] };

describe('close', () => {
  it('clôt sans date retenue, sans rien annoncer', () => {
    expect(applyTransition(OPEN, { kind: 'close' }, SINGLE)).toEqual({ ok: true, next: CLOSED, announce: null });
  });

  it('clôt avec une date retenue du sondage, et l’annonce', () => {
    expect(applyTransition(OPEN, { kind: 'close', retainedDays: ['2026-10-02'] }, SINGLE)).toEqual({
      ok: true,
      next: { status: 'CLOSED', retainedDays: ['2026-10-02'] },
      announce: ['2026-10-02'],
    });
  });

  it('refuse un jour étranger au sondage', () => {
    expect(applyTransition(OPEN, { kind: 'close', retainedDays: ['2026-10-09'] }, SINGLE)).toEqual({
      ok: false,
      error: 'NOT_A_POLL_DAY',
    });
  });

  it('refuse plusieurs dates à un sondage qui n’en retient qu’une', () => {
    expect(applyTransition(OPEN, { kind: 'close', retainedDays: ['2026-10-01', '2026-10-02'] }, SINGLE)).toEqual({
      ok: false,
      error: 'SINGLE_RETAINED_DAY',
    });
  });

  it('retient plusieurs dates, triées et sans doublon, si le sondage le permet', () => {
    const days = ['2026-10-03', '2026-10-01', '2026-10-03'];
    expect(applyTransition(OPEN, { kind: 'close', retainedDays: days }, MULTIPLE)).toEqual({
      ok: true,
      next: { status: 'CLOSED', retainedDays: ['2026-10-01', '2026-10-03'] },
      announce: ['2026-10-01', '2026-10-03'],
    });
  });

  it('refuse de clore un sondage déjà clos', () => {
    expect(applyTransition(CLOSED, { kind: 'close' }, SINGLE)).toEqual({ ok: false, error: 'INVALID_STATE' });
  });
});

describe('setRetainedDays', () => {
  it('n’existe que sur un sondage clos', () => {
    expect(applyTransition(OPEN, { kind: 'setRetainedDays', retainedDays: ['2026-10-01'] }, SINGLE)).toEqual({
      ok: false,
      error: 'INVALID_STATE',
    });
  });

  it('annonce une date nouvelle, pas une date inchangée ni une date retirée', () => {
    const withDay: PollState = { status: 'CLOSED', retainedDays: ['2026-10-01'] };
    expect(applyTransition(withDay, { kind: 'setRetainedDays', retainedDays: ['2026-10-02'] }, SINGLE)).toMatchObject({
      ok: true,
      announce: ['2026-10-02'],
    });
    expect(applyTransition(withDay, { kind: 'setRetainedDays', retainedDays: ['2026-10-01'] }, SINGLE)).toMatchObject({
      ok: true,
      announce: null,
    });
    expect(applyTransition(withDay, { kind: 'setRetainedDays', retainedDays: [] }, SINGLE)).toEqual({
      ok: true,
      next: CLOSED,
      announce: null,
    });
  });

  it('annonce toutes les dates restantes quand l’une s’ajoute ou se retire', () => {
    const withDays: PollState = { status: 'CLOSED', retainedDays: ['2026-10-01', '2026-10-02'] };
    const set = (retainedDays: string[]) => applyTransition(withDays, { kind: 'setRetainedDays', retainedDays }, MULTIPLE);
    expect(set(['2026-10-01', '2026-10-02', '2026-10-03'])).toMatchObject({
      announce: ['2026-10-01', '2026-10-02', '2026-10-03'],
    });
    expect(set(['2026-10-02'])).toMatchObject({ announce: ['2026-10-02'] });
    expect(set(['2026-10-02', '2026-10-01'])).toMatchObject({ ok: true, announce: null });
    expect(set([])).toMatchObject({ ok: true, announce: null });
  });
});

describe('reopen', () => {
  it('rouvre et efface les dates retenues', () => {
    const closed: PollState = { status: 'CLOSED', retainedDays: ['2026-10-01', '2026-10-02'] };
    expect(applyTransition(closed, { kind: 'reopen' }, MULTIPLE)).toEqual({ ok: true, next: OPEN, announce: null });
  });

  it('refuse de rouvrir un sondage ouvert', () => {
    expect(applyTransition(OPEN, { kind: 'reopen' }, SINGLE)).toEqual({ ok: false, error: 'INVALID_STATE' });
  });
});
