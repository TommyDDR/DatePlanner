import { describe, expect, it } from 'vitest';
import {
  addMonths,
  dateFromDay,
  dayFromDate,
  formatLongDay,
  isPast,
  isValidDay,
  todayInParis,
} from '@/lib/paris-day';

describe('todayInParis', () => {
  it("prend le jour de Paris, pas celui d'UTC, juste après minuit", () => {
    // 22 h 30 UTC le 14 = 0 h 30 le 15 à Paris (heure d'été, UTC+2).
    expect(todayInParis(new Date('2026-07-14T22:30:00Z'))).toBe('2026-07-15');
  });

  it("tient compte de l'heure d'hiver", () => {
    // 23 h 30 UTC le 14 janvier = 0 h 30 le 15 à Paris (UTC+1).
    expect(todayInParis(new Date('2026-01-14T23:30:00Z'))).toBe('2026-01-15');
    expect(todayInParis(new Date('2026-01-14T22:30:00Z'))).toBe('2026-01-14');
  });

  it("traverse le passage à l'heure d'été sans perdre de jour", () => {
    // Nuit du 28 au 29 mars 2026 : 2 h devient 3 h.
    expect(todayInParis(new Date('2026-03-28T23:30:00Z'))).toBe('2026-03-29');
    expect(todayInParis(new Date('2026-03-29T01:30:00Z'))).toBe('2026-03-29');
  });
});

describe('isPast', () => {
  it("ne tient pour passé qu'un jour strictement antérieur", () => {
    expect(isPast('2026-09-29', '2026-09-30')).toBe(true);
    expect(isPast('2026-09-30', '2026-09-30')).toBe(false);
    expect(isPast('2026-10-01', '2026-09-30')).toBe(false);
  });
});

describe('isValidDay', () => {
  it('accepte un jour qui existe', () => {
    expect(isValidDay('2028-02-29')).toBe(true);
  });

  it('refuse un jour qui n’existe pas ou mal écrit', () => {
    expect(isValidDay('2026-02-29')).toBe(false);
    expect(isValidDay('2026-13-01')).toBe(false);
    expect(isValidDay('2026-9-30')).toBe(false);
    expect(isValidDay('30/09/2026')).toBe(false);
  });
});

describe('conversions', () => {
  it('fait l’aller-retour avec une colonne DATE', () => {
    expect(dayFromDate(dateFromDay('2026-10-14'))).toBe('2026-10-14');
  });

  it('écrit un jour en toutes lettres', () => {
    expect(formatLongDay('2026-10-14')).toBe('mercredi 14 octobre 2026');
  });
});

describe('addMonths', () => {
  it('recule ou avance de mois entiers', () => {
    expect(addMonths('2026-09-30', -12)).toBe('2025-09-30');
    expect(addMonths('2026-01-15', 1)).toBe('2026-02-15');
    expect(addMonths('2026-12-15', 1)).toBe('2027-01-15');
  });

  it('ramène au dernier jour d’un mois plus court', () => {
    expect(addMonths('2026-03-31', -1)).toBe('2026-02-28');
    expect(addMonths('2028-02-29', -12)).toBe('2027-02-28');
  });
});
