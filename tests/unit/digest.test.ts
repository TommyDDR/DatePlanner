import { describe, expect, it } from 'vitest';
import { digestSince, nextDigestAt } from '@/lib/digest';

/** Résumé des nouvelles réponses (FR-041, research.md R10). */

const MINUTE = 60_000;
const now = new Date('2026-09-30T12:00:00Z');

describe('nextDigestAt', () => {
  it('attend quinze minutes après la première nouvelle réponse', () => {
    expect(nextDigestAt(now, null).getTime() - now.getTime()).toBe(15 * MINUTE);
  });

  it('respecte trente minutes depuis le dernier résumé', () => {
    const lastSent = new Date(now.getTime() - 5 * MINUTE);
    expect(nextDigestAt(now, lastSent).getTime()).toBe(lastSent.getTime() + 30 * MINUTE);
  });

  it('ne garde que les quinze minutes quand le dernier résumé est ancien', () => {
    const lastSent = new Date(now.getTime() - 3 * 3600_000);
    expect(nextDigestAt(now, lastSent).getTime() - now.getTime()).toBe(15 * MINUTE);
  });

  it('regroupe cinq réponses en dix minutes dans un seul envoi', () => {
    // La première programme l'envoi ; les quatre suivantes tombent avant lui.
    const sendAt = nextDigestAt(now, null);
    const arrivals = [0, 2, 5, 7, 10].map((m) => new Date(now.getTime() + m * MINUTE));
    expect(arrivals.every((at) => at < sendAt)).toBe(true);
  });
});

describe('digestSince', () => {
  const cursor = new Date('2026-09-30T11:00:00Z');
  const at = (minutes: number) => new Date(cursor.getTime() + minutes * MINUTE);

  it('ne garde que les réponses créées après le curseur, et avance le curseur', () => {
    const digest = digestSince(
      [
        { name: 'Avant', account: false, createdAt: at(-1) },
        { name: 'Léa', account: false, createdAt: at(3) },
        { name: 'Noé', account: true, createdAt: at(8) },
      ],
      cursor,
    );
    expect(digest).toEqual({
      newcomers: [
        { name: 'Léa', account: false },
        { name: 'Noé', account: true },
      ],
      cursor: at(8),
    });
  });

  it('rend null quand rien n’est nouveau (réponses retirées entre-temps)', () => {
    expect(digestSince([{ name: 'Avant', account: false, createdAt: at(-1) }], cursor)).toBeNull();
    expect(digestSince([], cursor)).toBeNull();
  });
});
