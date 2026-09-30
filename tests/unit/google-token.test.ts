import { describe, expect, it } from 'vitest';
import {
  authorizationUrl,
  codeChallenge,
  googleRedirectUri,
  newHandshake,
  parseIdToken,
  readGoogleOAuth,
} from '@/server/auth/google';

/**
 * Le jeton d'identité Google (FR-003, research.md R5).
 *
 * Rien n'est adressé à Google : le jeton est FABRIQUÉ ici, comme le ferait le
 * fournisseur, et `parseIdToken` est éprouvé sur ce qu'il en fait. C'est le
 * seul point où le service décide de croire quelqu'un.
 */

const CLIENT_ID = 'dateplanner.apps.googleusercontent.com';

function idToken(claims: Record<string, unknown>): string {
  const part = (value: unknown) => Buffer.from(JSON.stringify(value), 'utf8').toString('base64url');
  return [
    part({ alg: 'RS256', typ: 'JWT' }),
    part({
      iss: 'https://accounts.google.com',
      aud: CLIENT_ID,
      sub: 'google-sub-1',
      exp: Math.floor(Date.now() / 1000) + 600,
      email: 'claire@example.test',
      email_verified: true,
      name: 'Claire Martin',
      ...claims,
    }),
    'signature-non-verifiee',
  ].join('.');
}

describe('configuration', () => {
  it('rend null tant qu’une des deux variables manque', () => {
    expect(readGoogleOAuth({})).toBeNull();
    expect(readGoogleOAuth({ GOOGLE_CLIENT_ID: 'x' })).toBeNull();
    expect(readGoogleOAuth({ GOOGLE_CLIENT_ID: 'x', GOOGLE_CLIENT_SECRET: 'y' })).toEqual({
      clientId: 'x',
      clientSecret: 'y',
    });
  });
});

describe('adresse de départ', () => {
  it('porte PKCE, le périmètre minimal et l’anti-rejeu, jamais le vérificateur', () => {
    const handshake = newHandshake();
    const url = new URL(
      authorizationUrl({
        clientId: CLIENT_ID,
        redirectUri: 'https://dateplanner.laserit.fr/api/connexion/google/retour',
        state: handshake.state,
        verifier: handshake.verifier,
      }),
    );
    expect(url.searchParams.get('scope')).toBe('openid email profile');
    expect(url.searchParams.get('state')).toBe(handshake.state);
    expect(url.searchParams.get('code_challenge_method')).toBe('S256');
    expect(url.searchParams.get('code_challenge')).toBe(codeChallenge(handshake.verifier));
    expect(url.toString()).not.toContain(handshake.verifier);
  });

  it('compose le retour sur l’adresse publique', () => {
    expect(googleRedirectUri('https://dateplanner.laserit.fr')).toBe(
      'https://dateplanner.laserit.fr/api/connexion/google/retour',
    );
  });
});

describe('parseIdToken', () => {
  it('rend l’identité quand tout est en règle', () => {
    expect(parseIdToken(idToken({}), CLIENT_ID)).toEqual({
      ok: true,
      identity: { googleId: 'google-sub-1', email: 'claire@example.test', displayName: 'Claire Martin' },
    });
  });

  it('REFUSE une adresse que Google n’a pas prouvée', () => {
    expect(parseIdToken(idToken({ email_verified: false }), CLIENT_ID)).toEqual({ ok: false, reason: 'EMAIL_UNPROVEN' });
    expect(parseIdToken(idToken({ email_verified: undefined }), CLIENT_ID)).toEqual({
      ok: false,
      reason: 'EMAIL_UNPROVEN',
    });
  });

  it('refuse un jeton émis pour une AUTRE application', () => {
    expect(parseIdToken(idToken({ aud: 'une-autre-app' }), CLIENT_ID)).toEqual({ ok: false, reason: 'AUDIENCE' });
  });

  it('refuse un autre émetteur, un jeton périmé, un jeton difforme', () => {
    expect(parseIdToken(idToken({ iss: 'https://exemple.test' }), CLIENT_ID)).toEqual({ ok: false, reason: 'ISSUER' });
    expect(parseIdToken(idToken({ exp: Math.floor(Date.now() / 1000) - 10 }), CLIENT_ID)).toEqual({
      ok: false,
      reason: 'EXPIRED',
    });
    expect(parseIdToken('pas-un-jeton', CLIENT_ID)).toEqual({ ok: false, reason: 'MALFORMED' });
    expect(parseIdToken(idToken({ sub: '' }), CLIENT_ID)).toEqual({ ok: false, reason: 'MALFORMED' });
  });

  it('accepte les deux écritures de l’émetteur et la chaîne « true »', () => {
    expect(parseIdToken(idToken({ iss: 'accounts.google.com' }), CLIENT_ID).ok).toBe(true);
    expect(parseIdToken(idToken({ email_verified: 'true' }), CLIENT_ID).ok).toBe(true);
  });

  it('normalise l’adresse en minuscules', () => {
    const verdict = parseIdToken(idToken({ email: 'Claire@Example.test' }), CLIENT_ID);
    expect(verdict.ok && verdict.identity.email).toBe('claire@example.test');
  });

  it('compose un nom d’affichage quand Google n’en donne pas', () => {
    const fromParts = parseIdToken(idToken({ name: undefined, given_name: 'Claire', family_name: 'Martin' }), CLIENT_ID);
    expect(fromParts.ok && fromParts.identity.displayName).toBe('Claire Martin');
    const nothing = parseIdToken(idToken({ name: undefined }), CLIENT_ID);
    expect(nothing.ok && nothing.identity.displayName).toBe('claire');
    const long = parseIdToken(idToken({ name: 'x'.repeat(80) }), CLIENT_ID);
    expect(long.ok && long.identity.displayName).toHaveLength(60);
  });
});
