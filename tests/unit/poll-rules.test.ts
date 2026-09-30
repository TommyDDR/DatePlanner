import { describe, expect, it } from 'vitest';
import {
  acceptsResponses,
  normalizeDescription,
  normalizeDisplayName,
  normalizeEmail,
  normalizePseudonym,
  normalizeTitle,
  validateProposedDays,
  validateResponseDays,
} from '@/lib/poll-rules';

const TODAY = '2026-09-30';

describe('normalizeTitle', () => {
  it('retire les espaces et réduit les suites', () => {
    expect(normalizeTitle('  Dîner   de\nrentrée  ')).toEqual({ ok: true, value: 'Dîner de rentrée' });
  });

  it('exige un titre', () => {
    expect(normalizeTitle('   ')).toEqual({ ok: false, error: 'required' });
    expect(normalizeTitle(null)).toEqual({ ok: false, error: 'required' });
  });

  it('borne à 120 caractères, émojis comptés pour un', () => {
    expect(normalizeTitle('a'.repeat(120)).ok).toBe(true);
    expect(normalizeTitle('a'.repeat(121))).toEqual({ ok: false, error: 'too_long' });
    expect(normalizeTitle('🎉'.repeat(120)).ok).toBe(true);
  });
});

describe('normalizePseudonym et normalizeDisplayName', () => {
  it('refuse un pseudo fait d’espaces', () => {
    expect(normalizePseudonym(' \t ')).toEqual({ ok: false, error: 'required' });
  });

  it('borne le pseudo à 50 et le nom à 60', () => {
    expect(normalizePseudonym('a'.repeat(50)).ok).toBe(true);
    expect(normalizePseudonym('a'.repeat(51)).ok).toBe(false);
    expect(normalizeDisplayName('a'.repeat(60)).ok).toBe(true);
    expect(normalizeDisplayName('a'.repeat(61)).ok).toBe(false);
  });

  it('garde le balisage tel quel : il sera échappé à l’affichage', () => {
    expect(normalizePseudonym('<b>Léa</b>')).toEqual({ ok: true, value: '<b>Léa</b>' });
  });
});

describe('normalizeDescription', () => {
  it('vaut null quand elle est vide', () => {
    expect(normalizeDescription('  \n ')).toEqual({ ok: true, value: null });
  });

  it('garde les retours ligne', () => {
    expect(normalizeDescription(' ligne 1\r\nligne 2 ')).toEqual({ ok: true, value: 'ligne 1\nligne 2' });
  });

  it('borne à 2 000 caractères', () => {
    expect(normalizeDescription('a'.repeat(2000)).ok).toBe(true);
    expect(normalizeDescription('a'.repeat(2001))).toEqual({ ok: false, error: 'too_long' });
  });
});

describe('normalizeEmail', () => {
  it('met en minuscules et retire les espaces', () => {
    expect(normalizeEmail('  Camille@Exemple.FR ')).toEqual({ ok: true, value: 'camille@exemple.fr' });
  });

  it('refuse une adresse mal formée', () => {
    expect(normalizeEmail('camille')).toEqual({ ok: false, error: 'invalid_email' });
    expect(normalizeEmail('')).toEqual({ ok: false, error: 'required' });
  });
});

describe('validateProposedDays', () => {
  it('retire les doublons et trie', () => {
    expect(validateProposedDays(['2026-10-03', '2026-10-01', '2026-10-03'], TODAY)).toEqual({
      ok: true,
      value: ['2026-10-01', '2026-10-03'],
    });
  });

  it('accepte aujourd’hui, refuse la veille', () => {
    expect(validateProposedDays([TODAY], TODAY).ok).toBe(true);
    expect(validateProposedDays(['2026-09-29'], TODAY)).toEqual({ ok: false, error: 'past_day' });
  });

  it('exige au moins un jour à la création', () => {
    expect(validateProposedDays([], TODAY)).toEqual({ ok: false, error: 'no_day' });
  });

  it('refuse un jour mal formé', () => {
    expect(validateProposedDays(['2026-02-30'], TODAY)).toEqual({ ok: false, error: 'invalid_day' });
  });

  it('plafonne à 366 jours, existants compris', () => {
    const days = Array.from({ length: 367 }, (_, i) => {
      const date = new Date(Date.UTC(2026, 9, 1 + i));
      return date.toISOString().slice(0, 10);
    });
    expect(validateProposedDays(days.slice(0, 366), TODAY).ok).toBe(true);
    expect(validateProposedDays(days, TODAY)).toEqual({ ok: false, error: 'too_many_days' });
    expect(validateProposedDays(days.slice(366), TODAY, new Set(days.slice(0, 366)))).toEqual({
      ok: false,
      error: 'too_many_days',
    });
  });

  it('ignore à l’ajout les jours déjà proposés, sans exiger de nouveauté', () => {
    const existing = new Set(['2026-10-01']);
    expect(validateProposedDays(['2026-10-01', '2026-10-02'], TODAY, existing)).toEqual({
      ok: true,
      value: ['2026-10-02'],
    });
    expect(validateProposedDays(['2026-10-01'], TODAY, existing)).toEqual({ ok: true, value: [] });
  });
});

describe('validateResponseDays', () => {
  const pollDays = new Set(['2026-09-29', '2026-10-01', '2026-10-02']);

  it('accepte des jours proposés à venir', () => {
    expect(validateResponseDays(['2026-10-02', '2026-10-01'], pollDays, TODAY)).toEqual({
      ok: true,
      value: ['2026-10-01', '2026-10-02'],
    });
  });

  it('refuse toute la réponse pour un seul jour non proposé', () => {
    expect(validateResponseDays(['2026-10-01', '2026-10-05'], pollDays, TODAY)).toEqual({
      ok: false,
      error: 'not_proposed',
    });
  });

  it('refuse un jour proposé mais passé', () => {
    expect(validateResponseDays(['2026-09-29'], pollDays, TODAY)).toEqual({ ok: false, error: 'past_day' });
  });

  it('exige au moins un jour', () => {
    expect(validateResponseDays([], pollDays, TODAY)).toEqual({ ok: false, error: 'no_day' });
  });
});

describe('acceptsResponses', () => {
  it('refuse un sondage clos', () => {
    expect(acceptsResponses('CLOSED', ['2026-10-01'], TODAY)).toBe(false);
  });

  it('refuse un sondage dont tous les jours sont passés', () => {
    expect(acceptsResponses('OPEN', ['2026-09-28', '2026-09-29'], TODAY)).toBe(false);
    expect(acceptsResponses('OPEN', ['2026-09-29', TODAY], TODAY)).toBe(true);
  });
});
