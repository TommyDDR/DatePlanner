import { describe, expect, it } from 'vitest';
import { draftChanges, draftFromMarks, draftMarks, EMPTY_DRAFT, lockedDays, type SavedDays } from '@/lib/days-draft';

/** Les jours d'un sondage modifiés depuis le calendrier du créateur (FR-027, décision 031). */

const saved = (overrides: Partial<SavedDays> = {}): SavedDays => ({
  days: ['2026-10-01', '2026-10-02', '2026-10-03'],
  voted: new Set(['2026-10-02']),
  retainedDay: null,
  ...overrides,
});

describe('lockedDays', () => {
  it('verrouille les jours votés et la date retenue', () => {
    expect(lockedDays(saved())).toEqual(['2026-10-02']);
    expect(lockedDays(saved({ retainedDay: '2026-10-03' }))).toEqual(['2026-10-02', '2026-10-03']);
  });
});

describe('draftMarks', () => {
  it('marque les jours libres gardés et les jours ajoutés, jamais un jour verrouillé', () => {
    expect(draftMarks(saved(), EMPTY_DRAFT)).toEqual({ '2026-10-01': 1, '2026-10-03': 1 });
    expect(draftMarks(saved(), { add: ['2026-10-09'], remove: ['2026-10-01'] })).toEqual({
      '2026-10-03': 1,
      '2026-10-09': 1,
    });
  });
});

describe('draftFromMarks', () => {
  it('tire des marques les jours à ajouter et ceux à retirer', () => {
    const draft = draftFromMarks({ '2026-10-03': 1, '2026-10-09': 1, '2026-10-07': 1 }, saved(), EMPTY_DRAFT);
    expect(draft).toEqual({ add: ['2026-10-07', '2026-10-09'], remove: ['2026-10-01'] });
  });

  it('rétablit un jour qu’on marque de nouveau', () => {
    const removed = draftFromMarks({ '2026-10-03': 1 }, saved(), EMPTY_DRAFT);
    expect(draftFromMarks({ '2026-10-01': 1, '2026-10-03': 1 }, saved(), removed)).toEqual(EMPTY_DRAFT);
  });

  it('garde noté un retrait devancé par un vote, pour qu’on en soit averti', () => {
    const before = draftFromMarks({ '2026-10-03': 1 }, saved(), EMPTY_DRAFT);
    const now = saved({ voted: new Set(['2026-10-01', '2026-10-02']) });
    expect(draftFromMarks({ '2026-10-03': 1, '2026-10-09': 1 }, now, before)).toEqual({
      add: ['2026-10-09'],
      remove: ['2026-10-01'],
    });
  });
});

describe('draftChanges', () => {
  it('envoie les ajouts et les retraits encore possibles', () => {
    expect(draftChanges(saved(), { add: ['2026-10-09'], remove: ['2026-10-01'] })).toEqual({
      add: ['2026-10-09'],
      remove: ['2026-10-01'],
      overtaken: [],
      remaining: 3,
    });
  });

  it('écarte le retrait d’un jour qui vient d’être voté, et le signale', () => {
    const now = saved({ voted: new Set(['2026-10-01', '2026-10-02']) });
    expect(draftChanges(now, { add: [], remove: ['2026-10-01', '2026-10-03'] })).toEqual({
      add: [],
      remove: ['2026-10-03'],
      overtaken: ['2026-10-01'],
      remaining: 2,
    });
  });

  it('écarte sans bruit le retrait d’un jour devenu date retenue', () => {
    const now = saved({ retainedDay: '2026-10-01' });
    expect(draftChanges(now, { add: [], remove: ['2026-10-01'] })).toMatchObject({ remove: [], overtaken: [] });
  });

  it('compte les jours qui resteraient', () => {
    const free = saved({ days: ['2026-10-01'], voted: new Set() });
    expect(draftChanges(free, { add: [], remove: ['2026-10-01'] }).remaining).toBe(0);
    expect(draftChanges(free, { add: ['2026-10-05'], remove: ['2026-10-01'] }).remaining).toBe(1);
  });
});
