import { describe, expect, it } from 'vitest';
import {
  closePollSchema,
  createPollSchema,
  fieldErrors,
  readForm,
  submitResponseSchema,
} from '@/lib/validation';

function form(entries: Array<[string, string]>): FormData {
  const data = new FormData();
  for (const [key, value] of entries) data.append(key, value);
  return data;
}

describe('readForm', () => {
  it('lit les listes et les champs simples', () => {
    const values = readForm(
      form([
        ['title', 'Dîner'],
        ['days', '2026-10-01'],
        ['days', '2026-10-02'],
      ]),
      ['days'],
    );
    expect(values).toEqual({ title: 'Dîner', days: ['2026-10-01', '2026-10-02'] });
  });

  it('donne une liste vide à une liste absente', () => {
    expect(readForm(form([]), ['days'])).toEqual({ days: [] });
  });
});

describe('createPollSchema', () => {
  it('normalise titre et description, lit les cases à cocher', () => {
    const parsed = createPollSchema.parse({
      title: '  Dîner  ',
      description: '   ',
      days: ['2026-10-01'],
      notifyOwner: 'on',
      multipleRetainedDays: 'on',
    });
    expect(parsed).toEqual({
      title: 'Dîner',
      description: null,
      days: ['2026-10-01'],
      requireAccount: false,
      notifyOwner: true,
      multipleRetainedDays: true,
    });
  });

  it('signale le titre manquant avec son message', () => {
    const result = createPollSchema.safeParse({ title: ' ', days: [] });
    expect(result.success).toBe(false);
    expect(fieldErrors(result.error!)).toMatchObject({ title: 'Donnez un titre au sondage.' });
  });

  it('refuse un jour mal écrit', () => {
    const result = createPollSchema.safeParse({ title: 'x', days: ['1/10/2026'] });
    expect(result.success).toBe(false);
  });
});

describe('dates retenues', () => {
  it('aucun champ vaut aucune date ; chaque champ, une date', () => {
    const none = readForm(form([['publicId', 'a'.repeat(22)]]), ['retainedDays']);
    expect(closePollSchema.parse(none).retainedDays).toEqual([]);
    const two = readForm(
      form([
        ['publicId', 'a'.repeat(22)],
        ['retainedDays', '2026-10-01'],
        ['retainedDays', '2026-10-03'],
      ]),
      ['retainedDays'],
    );
    expect(closePollSchema.parse(two).retainedDays).toEqual(['2026-10-01', '2026-10-03']);
  });

  it('refuse un jour mal écrit', () => {
    expect(closePollSchema.safeParse({ publicId: 'a'.repeat(22), retainedDays: [''] }).success).toBe(false);
  });
});

describe('submitResponseSchema', () => {
  it('refuse un identifiant de sondage mal formé', () => {
    expect(submitResponseSchema.safeParse({ publicId: '../etc', days: [] }).success).toBe(false);
  });
});
