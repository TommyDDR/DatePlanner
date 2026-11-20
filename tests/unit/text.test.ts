import { describe, expect, it } from 'vitest';
import { participantCountLabel } from '@/lib/text';

/** Libellé du compteur de participants (spécification 002, FR-004). */

describe('participantCountLabel', () => {
  it('dit que personne n’a répondu à zéro', () => {
    expect(participantCountLabel(0)).toBe('Personne n’a encore répondu');
  });

  it('accorde au singulier puis au pluriel', () => {
    expect(participantCountLabel(1)).toBe('1 participant');
    expect(participantCountLabel(3)).toBe('3 participants');
  });

  it('donne le nombre exact, sans abréviation ni séparateur', () => {
    expect(participantCountLabel(1234)).toBe('1234 participants');
  });
});
