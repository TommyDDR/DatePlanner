import { NextResponse, type NextRequest } from 'next/server';
import { SESSION } from '@/config/limits';
import { contentSecurityPolicy, freshNonce } from '@/lib/csp';
import { sessionCookieOptions, sessionExpiryFrom } from '@/lib/session-cookie';
import { isPublicId } from '@/lib/public-id';

/**
 * Politique de sécurité des pages, avec un nonce par requête.
 *
 * Le nonce voyage deux fois : dans l'en-tête de la RÉPONSE, que le navigateur
 * applique, et dans ceux de la REQUÊTE transmise au rendu - Next y lit la
 * politique pour noncer ses propres scripts, et le layout racine lit `x-nonce`
 * pour le script du thème (`CspNonceProvider`).
 *
 * `/api` n'y passe pas : sa politique, sans nonce, est posée par
 * `next.config.ts`. Les fichiers statiques non plus.
 */
export function proxy(request: NextRequest) {
  const nonce = freshNonce();
  const policy = contentSecurityPolicy({
    nonce,
    isProduction: process.env.NODE_ENV === 'production',
  });

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set('x-nonce', nonce);
  requestHeaders.set('Content-Security-Policy', policy);

  const response = isMalformedPollPath(request.nextUrl.pathname)
    ? NextResponse.rewrite(new URL(UNROUTED_PATH, request.url), { request: { headers: requestHeaders } })
    : NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set('Content-Security-Policy', policy);
  extendSessionCookie(request, response);
  return response;
}

/**
 * Un chemin qu'aucune route ne sert : Next tient pour privé tout dossier de
 * `app/` dont le nom commence par `_`.
 */
const UNROUTED_PATH = '/_introuvable';

const POLL_PAGE = /^\/s\/([^/]+)\/?$/;

/**
 * Un lien de sondage mal formé reçoit la 404 ordinaire du site, décidée ICI,
 * sans base et avant le rendu : un `notFound()` levé pendant le rendu part
 * sous la coquille d'erreur de Next, blanche sans JavaScript. Un identifiant
 * bien formé mais inconnu, lui, est tranché par la page.
 */
function isMalformedPollPath(pathname: string): boolean {
  const segment = POLL_PAGE.exec(pathname)?.[1];
  return segment !== undefined && !isPublicId(segment);
}

/**
 * Reporte l'échéance du cookie de session à chaque navigation.
 *
 * Posée à la connexion et jamais reposée, sa date d'expiration ferait
 * l'oublier du navigateur trente jours plus tard, même pour quelqu'un venu la
 * veille, alors que la session doit expirer après trente jours d'INACTIVITÉ.
 * La ligne en base glisse de son côté (`getSessionUser`), et c'est elle qui
 * fait foi : un cookie prolongé pour une session morte ne rouvre rien.
 *
 * Seulement sur une lecture (`GET`) : une Server Action (`POST`) peut poser ou
 * effacer ce même cookie - connexion, déconnexion -, et deux `Set-Cookie`
 * contraires dans une même réponse rendraient la déconnexion incertaine.
 */
function extendSessionCookie(request: NextRequest, response: NextResponse): void {
  if (request.method !== 'GET') return;
  const token = request.cookies.get(SESSION.cookieName)?.value;
  if (!token) return;
  response.cookies.set(SESSION.cookieName, token, sessionCookieOptions(sessionExpiryFrom(new Date())));
}

export const config = {
  matcher: ['/((?!api/|_next/static|_next/image|.*\\.(?:png|jpg|jpeg|webp|svg|ico|txt|xml|webmanifest)$).*)'],
};
