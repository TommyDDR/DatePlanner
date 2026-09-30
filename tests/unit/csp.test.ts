import { describe, expect, it } from 'vitest';
import { contentSecurityPolicy, freshNonce } from '@/lib/csp';

/** Politique de sécurité à nonce (constitution I). */

function directive(policy: string, name: string): string {
  return policy.split('; ').find((entry) => entry.startsWith(name)) ?? '';
}

describe('politique de sécurité du contenu', () => {
  it('n’admet un script en ligne que sous le nonce de la requête', () => {
    const policy = contentSecurityPolicy({ nonce: 'abc123', isProduction: true });
    expect(directive(policy, 'script-src')).toContain("'nonce-abc123'");
    expect(directive(policy, 'script-src')).not.toContain("'unsafe-inline'");
    expect(directive(policy, 'script-src')).not.toContain("'unsafe-eval'");
    expect(policy).toContain('upgrade-insecure-requests');
  });

  it('sans nonce, n’admet aucun script en ligne', () => {
    const policy = contentSecurityPolicy({ nonce: null, isProduction: false });
    expect(directive(policy, 'script-src')).not.toContain("'nonce-");
    expect(directive(policy, 'script-src')).not.toContain("'unsafe-inline'");
    expect(policy).not.toContain('upgrade-insecure-requests');
  });

  it('ne laisse un formulaire poster que sur le site', () => {
    const policy = contentSecurityPolicy({ nonce: 'n', isProduction: true });
    expect(directive(policy, 'form-action')).toBe("form-action 'self'");
    expect(directive(policy, 'connect-src')).toBe("connect-src 'self'");
  });

  it('tire un nonce neuf à chaque appel', () => {
    const nonces = new Set(Array.from({ length: 50 }, freshNonce));
    expect(nonces.size).toBe(50);
    for (const nonce of nonces) expect(nonce).toMatch(/^[A-Za-z0-9+/]{22}==$/);
  });
});
