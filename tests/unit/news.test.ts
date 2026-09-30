import { describe, expect, it } from 'vitest';
import { hasNews } from '@/lib/news';

/** « Du nouveau » : la version courante contre la version vue (FR-044). */

describe('hasNews', () => {
  const version = new Date('2026-09-30T12:00:00.000Z');

  it('signale un sondage jamais vu', () => {
    expect(hasNews(version, null)).toBe(true);
  });

  it('signale une version vue plus ancienne, d’une milliseconde même', () => {
    expect(hasNews(version, new Date('2026-09-30T11:59:59.999Z'))).toBe(true);
  });

  it('se tait sur la version courante', () => {
    expect(hasNews(version, new Date(version))).toBe(false);
  });
});
