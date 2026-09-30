import { NextResponse } from 'next/server';
import { SITE_URL } from '@/config/identity';
import { GOOGLE_SIGNIN_PARAM } from '@/lib/google-signin-notice';
import { safeInternalPath } from '@/lib/safe-redirect';
import { authorizationUrl, googleRedirectUri, newHandshake, readGoogleOAuth } from '@/server/auth/google';
import { GOOGLE_HANDSHAKE_COOKIE, handshakeCookieOptions, sealHandshake } from '@/server/auth/google-handshake';
import { getSessionUser } from '@/server/auth/session';
import { redirectWithin } from '@/server/http/redirect';

/**
 * Le départ vers Google (contracts/http-api.md).
 *
 * Une route, pas une Server Action : ce qui doit se produire est une
 * NAVIGATION vers un autre site. Le bouton de la page de connexion est donc un
 * lien ordinaire. La route tire la poignée de main, la scelle dans un cookie
 * de dix minutes, et renvoie sur l'écran de consentement.
 */
export const dynamic = 'force-dynamic';

export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url);

  // Déjà connecté : rien à demander à Google.
  if (await getSessionUser()) return redirectWithin('/mes-sondages');

  const oauth = readGoogleOAuth();
  if (oauth === null) return redirectWithin(`/connexion?${GOOGLE_SIGNIN_PARAM}=indisponible`);

  // La destination est ANALYSÉE ici, à l'aller, puis voyage dans le cookie
  // signé : un `suite` recomposé au retour rouvrirait le tremplin de hameçonnage.
  const next = safeInternalPath(url.searchParams.get('suite') ?? '', '');
  const handshake = newHandshake();

  const response = NextResponse.redirect(
    authorizationUrl({
      clientId: oauth.clientId,
      redirectUri: googleRedirectUri(SITE_URL),
      state: handshake.state,
      verifier: handshake.verifier,
    }),
    303,
  );
  // Posé SUR la réponse : c'est la redirection elle-même qui doit le porter.
  response.cookies.set(GOOGLE_HANDSHAKE_COOKIE, sealHandshake({ ...handshake, next }), handshakeCookieOptions());
  return response;
}
