import { describe, expect, it } from 'vitest';
import {
  GOOGLE_HANDSHAKE_COOKIE,
  handshakeCookieOptions,
  openHandshake,
  sameState,
  sealHandshake,
} from '@/server/auth/google-handshake';

/** Le cookie signé qui traverse l'aller-retour chez Google. */

describe('poignée de main', () => {
  it('se relit telle qu’elle a été scellée', () => {
    const payload = { state: 'etat', verifier: 'verif', next: '/s/abcdefghijklmnopqrstuv' };
    expect(openHandshake(sealHandshake(payload))).toEqual(payload);
  });

  it('refuse un contenu retouché ou mal formé', () => {
    const sealed = sealHandshake({ state: 'etat', verifier: 'verif', next: '' });
    const [body, signature] = sealed.split('.') as [string, string];
    const forged = Buffer.from(JSON.stringify({ state: 'autre', verifier: 'verif', next: '' }), 'utf8').toString(
      'base64url',
    );
    expect(openHandshake(`${forged}.${signature}`)).toBeNull();
    expect(openHandshake(`${body}.signature-inventee`)).toBeNull();
    expect(openHandshake(undefined)).toBeNull();
    expect(openHandshake('sans-point')).toBeNull();
  });

  it('porte le nom et les attributs attendus', () => {
    expect(GOOGLE_HANDSHAKE_COOKIE).toBe('dp_google');
    expect(handshakeCookieOptions()).toMatchObject({ httpOnly: true, sameSite: 'lax', path: '/', maxAge: 600 });
  });

  it('compare les états sans révéler où ils divergent', () => {
    expect(sameState('abcdef', 'abcdef')).toBe(true);
    expect(sameState('abcdef', 'abcdeg')).toBe(false);
    expect(sameState('abcdef', 'abcde')).toBe(false);
  });
});
