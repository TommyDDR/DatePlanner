import type { NextRequest, NextResponse } from 'next/server';
import { SITE_URL } from '@/config/identity';
import { GOOGLE_SIGNIN_PARAM, type GoogleSigninNotice } from '@/lib/google-signin-notice';
import { exchangeCode, googleRedirectUri, readGoogleOAuth, type IdTokenVerdict } from '@/server/auth/google';
import { GOOGLE_HANDSHAKE_COOKIE, openHandshake, sameState } from '@/server/auth/google-handshake';
import { loginWithGoogle } from '@/server/auth/service';
import { redirectWithin } from '@/server/http/redirect';
import { clientIp } from '@/server/ratelimit';

/**
 * Le retour de Google (contracts/http-api.md).
 *
 * Ce que l'URL porte ne décide de RIEN : elle n'apporte qu'un code à usage
 * unique, que le serveur échange lui-même contre l'identité. Le `state` reçu
 * est confronté à celui du cookie signé : sans cette comparaison, un tiers
 * ferait ouvrir SA session dans le navigateur du visiteur.
 *
 * Le cookie de poignée de main est effacé dans TOUS les cas : un vérificateur
 * qui traîne est un vérificateur rejouable.
 */
export const dynamic = 'force-dynamic';

function done(path: string): NextResponse {
  const response = redirectWithin(path);
  response.cookies.delete(GOOGLE_HANDSHAKE_COOKIE);
  return response;
}

function backToLogin(reason: GoogleSigninNotice): NextResponse {
  return done(`/connexion?${GOOGLE_SIGNIN_PARAM}=${reason}`);
}

export async function GET(request: NextRequest): Promise<Response> {
  const url = new URL(request.url);
  const handshake = openHandshake(request.cookies.get(GOOGLE_HANDSHAKE_COOKIE)?.value);

  // Le refus du visiteur sur l'écran de Google arrive ici comme une erreur.
  if (url.searchParams.get('error')) return backToLogin('annule');

  const code = url.searchParams.get('code') ?? '';
  const state = url.searchParams.get('state') ?? '';
  if (handshake === null || code === '' || state === '' || !sameState(handshake.state, state)) {
    return backToLogin('refuse');
  }

  const oauth = readGoogleOAuth();
  if (oauth === null) return backToLogin('indisponible');

  let verdict: IdTokenVerdict;
  try {
    // La MÊME adresse de retour qu'à l'aller : Google la recompare.
    verdict = await exchangeCode({ oauth, code, verifier: handshake.verifier, redirectUri: googleRedirectUri(SITE_URL) });
  } catch (error) {
    // Rien de ce que Google renvoie ne part dans une page.
    console.error('[google] échange du code impossible', error);
    return backToLogin('indisponible');
  }
  if (!verdict.ok) return backToLogin(verdict.reason === 'EMAIL_UNPROVEN' ? 'adresse-non-verifiee' : 'refuse');

  const signin = await loginWithGoogle(verdict.identity, clientIp(request.headers));
  if (!signin.ok) return backToLogin(signin.error.code === 'RATE_LIMITED' ? 'indisponible' : 'refuse');

  return done(handshake.next !== '' ? handshake.next : '/mes-sondages');
}
