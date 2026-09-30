import { describe, expect, it } from 'vitest';
import { buildAvailability, byPopularity, mostVotedDays, voteCountLabel, votersSummary } from '@/lib/availability';

/** Synthèse des votes (FR-020, FR-021). */

describe('buildAvailability', () => {
  it('compte les votes par jour et nomme les votants, jours triés', () => {
    const result = buildAvailability([
      { day: '2026-10-05', name: 'Zoé', account: false },
      { day: '2026-10-03', name: 'léa', account: true },
      { day: '2026-10-05', name: 'Émile', account: true },
      { day: '2026-10-05', name: 'Aurélien', account: false },
    ]);
    expect(result.map((d) => [d.day, d.count])).toEqual([
      ['2026-10-03', 1],
      ['2026-10-05', 3],
    ]);
    // Ordre alphabétique français : accents et casse ne déplacent pas un nom.
    expect(result[1]!.voters.map((v) => v.name)).toEqual(['Aurélien', 'Émile', 'Zoé']);
    expect(result[0]!.voters[0]).toEqual({ name: 'léa', account: true });
  });

  it('ne rend aucun jour sans vote', () => {
    expect(buildAvailability([])).toEqual([]);
  });

  it('garde deux homonymes', () => {
    const [day] = buildAvailability([
      { day: '2026-10-03', name: 'Léa', account: false },
      { day: '2026-10-03', name: 'Léa', account: false },
    ]);
    expect(day!.count).toBe(2);
    expect(day!.voters).toHaveLength(2);
  });
});

const synthesis = (counts: Record<string, number>) =>
  Object.entries(counts).map(([day, count]) => ({ day, count, voters: [] }));

describe('byPopularity', () => {
  it('range du plus voté au moins voté, le plus proche d’abord à égalité', () => {
    const days = byPopularity(synthesis({ '2026-10-01': 1, '2026-10-09': 3, '2026-10-04': 3, '2026-10-02': 2 }));
    expect(days.map((d) => d.day)).toEqual(['2026-10-04', '2026-10-09', '2026-10-02', '2026-10-01']);
  });

  it('laisse la synthèse d’origine dans l’ordre du calendrier', () => {
    const availability = synthesis({ '2026-10-01': 1, '2026-10-02': 2 });
    byPopularity(availability);
    expect(availability.map((d) => d.day)).toEqual(['2026-10-01', '2026-10-02']);
  });
});

describe('mostVotedDays', () => {
  it('rend les jours qui réunissent le plus de votants, tous à égalité', () => {
    expect(mostVotedDays(synthesis({ '2026-10-09': 3, '2026-10-01': 1, '2026-10-04': 3 }))).toEqual([
      '2026-10-04',
      '2026-10-09',
    ]);
  });

  it('ne rend rien tant que personne n’a voté', () => {
    expect(mostVotedDays([])).toEqual([]);
    expect(mostVotedDays(synthesis({ '2026-10-01': 0 }))).toEqual([]);
  });
});

describe('votersSummary', () => {
  const voters = Array.from({ length: 23 }, (_, i) => ({ name: `P${String(i).padStart(2, '0')}`, account: false }));

  it('montre tout le monde jusqu’à vingt', () => {
    expect(votersSummary(voters.slice(0, 20))).toEqual({ shown: voters.slice(0, 20), others: 0 });
  });

  it('résume au-delà : « et N autres »', () => {
    const summary = votersSummary(voters);
    expect(summary.shown).toHaveLength(20);
    expect(summary.others).toBe(3);
  });
});

describe('voteCountLabel', () => {
  it('accorde le nom au nombre', () => {
    expect(voteCountLabel(1)).toBe('1 vote');
    expect(voteCountLabel(4)).toBe('4 votes');
  });
});
