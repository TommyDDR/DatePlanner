import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { GET as start } from '@/app/api/connexion/google/route';
import { GET as callback } from '@/app/api/connexion/google/retour/route';
import { GOOGLE_HANDSHAKE_COOKIE, openHandshake, sealHandshake } from '@/server/auth/google-handshake';
import { testCookies } from '../setup';
import { resetDatabase } from '../helpers/db';

/** Les deux routes de la connexion Google (contracts/http-api.md). */

beforeEach(async () => {
  await resetDatabase();
  testCookies.clear();
  vi.stubEnv('GOOGLE_CLIENT_ID', 'dateplanner.apps.googleusercontent.com');
  vi.stubEnv('GOOGLE_CLIENT_SECRET', 'secret-de-test');
});

afterEach(() => {
  vi.unstubAllEnvs();
});

/** La valeur d'un cookie posé par une réponse. */
function setCookie(response: Response, name: string): string | undefined {
  const header = response.headers.getSetCookie().find((cookie) => cookie.startsWith(`${name}=`));
  return header?.slice(name.length + 1).split(';')[0];
}

describe('départ', () => {
  it('renvoie chez Google avec PKCE et scelle la destination analysée', async () => {
    const response = await start(new Request('http://localhost/api/connexion/google?suite=%2Fnouveau'));
    expect(response.status).toBe(303);
    const location = new URL(response.headers.get('location')!);
    expect(location.origin).toBe('https://accounts.google.com');
    expect(location.searchParams.get('redirect_uri')).toMatch(/\/api\/connexion\/google\/retour$/);
    expect(location.searchParams.get('code_challenge_method')).toBe('S256');

    const sealed = decodeURIComponent(setCookie(response, GOOGLE_HANDSHAKE_COOKIE)!);
    expect(openHandshake(sealed)).toMatchObject({ next: '/nouveau', state: location.searchParams.get('state') });
  });

  it('écarte une destination hors du site', async () => {
    const response = await start(new Request('http://localhost/api/connexion/google?suite=%2F%5Cevil.test'));
    const sealed = decodeURIComponent(setCookie(response, GOOGLE_HANDSHAKE_COOKIE)!);
    expect(openHandshake(sealed)?.next).toBe('');
  });

  it('renvoie sur la connexion quand Google n’est pas configuré', async () => {
    vi.stubEnv('GOOGLE_CLIENT_ID', '');
    const response = await start(new Request('http://localhost/api/connexion/google'));
    expect(new URL(response.headers.get('location')!).search).toBe('?google=indisponible');
  });
});

describe('retour', () => {
  function callbackRequest(query: string, cookie?: string): NextRequest {
    return new NextRequest(`http://localhost/api/connexion/google/retour?${query}`, {
      headers: cookie ? { cookie: `${GOOGLE_HANDSHAKE_COOKIE}=${cookie}` } : {},
    });
  }

  it('dit « annulé » quand le visiteur refuse chez Google, et efface le cookie', async () => {
    const response = await callback(callbackRequest('error=access_denied', sealHandshake({ state: 's', verifier: 'v', next: '' })));
    expect(new URL(response.headers.get('location')!).search).toBe('?google=annule');
    expect(response.headers.getSetCookie().some((c) => c.startsWith(`${GOOGLE_HANDSHAKE_COOKIE}=;`))).toBe(true);
  });

  it('refuse un état qui ne retombe pas sur celui du cookie', async () => {
    const cookie = sealHandshake({ state: 'attendu', verifier: 'v', next: '' });
    const response = await callback(callbackRequest('code=abc&state=autre', cookie));
    expect(new URL(response.headers.get('location')!).search).toBe('?google=refuse');
  });

  it('refuse un retour sans cookie de poignée de main', async () => {
    const response = await callback(callbackRequest('code=abc&state=s'));
    expect(new URL(response.headers.get('location')!).search).toBe('?google=refuse');
  });
});
