import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { signLink, verifyLink } from '@/lib/signed-link';

/** Liens signés : désactivation du résumé en un clic (FR-041). */

beforeEach(() => {
  vi.stubEnv('APP_SECRET', 'un-secret-de-test-assez-long-0123456789');
});

afterEach(() => {
  vi.unstubAllEnvs();
});

const POLL = '0b1f7c2e-8a55-4c61-9d0e-3f5a2b7c9d11';

describe('liens signés', () => {
  it('rendent le sujet d’une signature valable', () => {
    expect(verifyLink('owner-digest', signLink('owner-digest', POLL))).toBe(POLL);
  });

  it('refusent une signature altérée, un autre sujet ou un autre objet', () => {
    const token = signLink('owner-digest', POLL);
    const [subject, signature] = token.split('.') as [string, string];
    expect(verifyLink('owner-digest', `${subject}.${signature.slice(0, -1)}x`)).toBeNull();
    expect(verifyLink('owner-digest', `${subject.replace('0b1f', '0b1e')}.${signature}`)).toBeNull();
    expect(verifyLink('autre-objet', token)).toBeNull();
    expect(verifyLink('owner-digest', 'n-importe-quoi')).toBeNull();
    expect(verifyLink('owner-digest', '')).toBeNull();
  });

  it('dépendent du secret du service', () => {
    const token = signLink('owner-digest', POLL);
    vi.stubEnv('APP_SECRET', 'un-autre-secret-tout-aussi-long-987654');
    expect(verifyLink('owner-digest', token)).toBeNull();
  });
});
