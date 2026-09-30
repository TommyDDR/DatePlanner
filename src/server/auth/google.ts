import { createHash, randomBytes } from 'node:crypto';
import { POLL_LIMITS } from '@/config/limits';

/**
 * Connexion par compte Google, à la main (FR-003, research.md R5).
 *
 * Pas de bibliothèque d'authentification : sessions, argon2 et jetons signés
 * sont écrits ici, et une couche qui pose ses propres tables et sa propre
 * notion de session doublerait `server/auth/session.ts`. Le protocole tient en
 * deux appels REST.
 *
 * Le flux est le CODE D'AUTORISATION avec PKCE. Le jeton d'identité n'arrive
 * jamais par le navigateur : celui-ci ne rapporte qu'un code à usage unique,
 * que le serveur échange lui-même contre l'identité, avec le secret client. Un
 * code intercepté ne vaut donc rien sans ce secret - et, PKCE aidant, sans le
 * vérificateur tiré pour CETTE tentative.
 *
 * Les identifiants vivent dans `.env`, jamais dans le dépôt. Ils n'ont PAS le
 * préfixe `NEXT_PUBLIC_` : un composant client qui importerait ce module par
 * mégarde lirait `null`, pas le secret.
 */

export const GOOGLE_ENV = {
  clientId: 'GOOGLE_CLIENT_ID',
  clientSecret: 'GOOGLE_CLIENT_SECRET',
} as const;

export type GoogleOAuth = { clientId: string; clientSecret: string };

type Env = Record<string, string | undefined>;

/**
 * `null` dès que l'un des deux manque : le bouton « Continuer avec Google »
 * n'est alors pas rendu du tout, et le mot de passe reste le chemin.
 */
export function readGoogleOAuth(env: Env = process.env): GoogleOAuth | null {
  const clientId = env[GOOGLE_ENV.clientId]?.trim() ?? '';
  const clientSecret = env[GOOGLE_ENV.clientSecret]?.trim() ?? '';
  if (clientId === '' || clientSecret === '') return null;
  return { clientId, clientSecret };
}

/* -------------------------------------------------------------------------- */
/* Points d'entrée du fournisseur                                              */
/* -------------------------------------------------------------------------- */

export const GOOGLE_AUTHORIZE_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
export const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';

/** Les deux écritures que Google admet pour l'émetteur de ses jetons. */
const GOOGLE_ISSUERS = ['https://accounts.google.com', 'accounts.google.com'];

/** Le chemin de retour : la route qui reçoit le code. */
export const GOOGLE_CALLBACK_PATH = '/api/connexion/google/retour';

/**
 * L'adresse de retour déclarée à Google.
 *
 * Composée sur `SITE_URL`, l'adresse PUBLIQUE du service, et jamais sur
 * l'origine que le serveur voit de la requête : derrière un proxy qui ne
 * transmet pas `Host`, cette origine est `localhost:3000`, et Google ramènerait
 * le visiteur sur sa propre machine. Google compare la chaîne au caractère
 * près avec ce qui est déclaré dans la console du projet : l'échange échoue
 * tant que les deux ne coïncident pas, et c'est `NEXT_PUBLIC_SITE_URL` qu'il
 * faut y déclarer. La fonction reste pure : l'origine lui est donnée.
 */
export function googleRedirectUri(origin: string): string {
  return new URL(GOOGLE_CALLBACK_PATH, origin).toString();
}

/* -------------------------------------------------------------------------- */
/* PKCE et anti-rejeu                                                          */
/* -------------------------------------------------------------------------- */

export type Handshake = {
  /** Anti-CSRF : ce que Google renverra, et qui doit retomber sur le cookie. */
  state: string;
  /** Le secret de CETTE tentative, gardé par le site, jamais envoyé à l'aller. */
  verifier: string;
};

export function newHandshake(): Handshake {
  return {
    state: randomBytes(24).toString('base64url'),
    verifier: randomBytes(32).toString('base64url'),
  };
}

/** L'empreinte du vérificateur, seule chose qui parte à l'aller (PKCE S256). */
export function codeChallenge(verifier: string): string {
  return createHash('sha256').update(verifier).digest('base64url');
}

/**
 * Où envoyer le visiteur.
 *
 * `prompt=select_account` plutôt que rien : sur un poste partagé, ou pour qui
 * a deux comptes Google, une connexion muette rattacherait la demande au compte
 * que le navigateur avait sous la main.
 */
export function authorizationUrl(input: {
  clientId: string;
  redirectUri: string;
  state: string;
  verifier: string;
}): string {
  const url = new URL(GOOGLE_AUTHORIZE_URL);
  url.searchParams.set('client_id', input.clientId);
  url.searchParams.set('redirect_uri', input.redirectUri);
  url.searchParams.set('response_type', 'code');
  // Rien de plus que l'identité : le site ne lit ni les contacts, ni l'agenda,
  // ni la boîte. Un périmètre plus large serait affiché au visiteur sur l'écran
  // de consentement, et il aurait raison de s'en méfier.
  url.searchParams.set('scope', 'openid email profile');
  url.searchParams.set('state', input.state);
  url.searchParams.set('code_challenge', codeChallenge(input.verifier));
  url.searchParams.set('code_challenge_method', 'S256');
  url.searchParams.set('prompt', 'select_account');
  return url.toString();
}

/* -------------------------------------------------------------------------- */
/* Le jeton d'identité                                                         */
/* -------------------------------------------------------------------------- */

export type GoogleIdentity = {
  /** Le « sub » : l'identifiant stable du compte Google. */
  googleId: string;
  email: string;
  /** Le nom qu'on verra sur les sondages ; le titulaire le change depuis son compte. */
  displayName: string;
};

export type IdTokenReason = 'MALFORMED' | 'ISSUER' | 'AUDIENCE' | 'EXPIRED' | 'EMAIL_UNPROVEN';

export type IdTokenVerdict =
  | { ok: true; identity: GoogleIdentity }
  | { ok: false; reason: IdTokenReason };

type IdTokenClaims = {
  iss?: unknown;
  aud?: unknown;
  sub?: unknown;
  exp?: unknown;
  email?: unknown;
  email_verified?: unknown;
  given_name?: unknown;
  family_name?: unknown;
  name?: unknown;
};

/**
 * Relecture du jeton d'identité.
 *
 * LA SIGNATURE N'EST PAS VÉRIFIÉE ICI, ET C'EST VOLONTAIRE : le jeton n'est
 * pas arrivé par le navigateur, il vient d'être obtenu par un appel TLS direct
 * au point d'entrée de Google, authentifié par le secret client. C'est le cas
 * que la spécification OpenID Connect (section 3.1.3.7) dispense explicitement
 * de validation cryptographique. Aller chercher les clés publiques ajouterait
 * un appel réseau, un cache à faire vieillir et un chemin d'échec, sans rien
 * fermer de plus. En revanche, si le jeton devait un jour arriver AUTREMENT -
 * un flux implicite, un jeton posté par le navigateur -, cette dispense
 * tomberait et la signature deviendrait obligatoire.
 *
 * Ce qui est vérifié : l'émetteur, l'audience - le jeton doit être émis POUR ce
 * site, sans quoi celui obtenu par une autre application ouvrirait les comptes
 * d'ici -, l'échéance, et surtout l'adresse PROUVÉE.
 *
 * `email_verified` est la clause qui tient tout le reste : c'est elle qui
 * autorise à rattacher une identité Google à un compte existant qui porte la
 * même adresse. Sans elle, il suffirait de déclarer l'adresse de quelqu'un
 * d'autre sur un domaine qu'on administre pour se voir ouvrir son dossier.
 */
export function parseIdToken(
  idToken: string,
  clientId: string,
  now: number = Date.now(),
): IdTokenVerdict {
  const parts = idToken.split('.');
  if (parts.length !== 3) return { ok: false, reason: 'MALFORMED' };

  let claims: IdTokenClaims;
  try {
    claims = JSON.parse(Buffer.from(parts[1] as string, 'base64url').toString('utf8'));
  } catch {
    return { ok: false, reason: 'MALFORMED' };
  }

  const sub = typeof claims.sub === 'string' ? claims.sub.trim() : '';
  const email = typeof claims.email === 'string' ? claims.email.trim().toLowerCase() : '';
  if (sub === '' || email === '') return { ok: false, reason: 'MALFORMED' };

  if (typeof claims.iss !== 'string' || !GOOGLE_ISSUERS.includes(claims.iss)) {
    return { ok: false, reason: 'ISSUER' };
  }
  if (claims.aud !== clientId) return { ok: false, reason: 'AUDIENCE' };

  const exp = typeof claims.exp === 'number' ? claims.exp : 0;
  if (exp * 1000 <= now) return { ok: false, reason: 'EXPIRED' };

  // Google rend parfois la chaîne « true » plutôt que le booléen.
  const proven = claims.email_verified === true || claims.email_verified === 'true';
  if (!proven) return { ok: false, reason: 'EMAIL_UNPROVEN' };

  return { ok: true, identity: { googleId: sub, email, displayName: displayNameOf(claims, email) } };
}

/**
 * Le nom d'affichage, tel qu'on peut le tirer du jeton : le nom complet, sinon
 * prénom et nom, sinon la partie locale de l'adresse. Borné à la longueur
 * qu'un nom d'affichage admet ; le titulaire le corrige depuis son compte.
 */
function displayNameOf(claims: IdTokenClaims, email: string): string {
  const text = (value: unknown) => (typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : '');
  const name =
    text(claims.name) ||
    [text(claims.given_name), text(claims.family_name)].filter(Boolean).join(' ') ||
    (email.split('@')[0] as string);
  return Array.from(name).slice(0, POLL_LIMITS.displayNameMax).join('');
}

/* -------------------------------------------------------------------------- */
/* L'échange                                                                   */
/* -------------------------------------------------------------------------- */

/**
 * Le code contre l'identité.
 *
 * Lève quand Google ne répond pas ou répond mal : la route de retour renvoie
 * alors le visiteur sur la page de connexion avec un motif, et le mot de passe
 * reste ouvert. Le jeton rendu est relu par `parseIdToken`, dont le verdict est
 * rendu tel quel : un jeton refusé n'est pas une panne, c'est un refus.
 */
export async function exchangeCode(input: {
  oauth: GoogleOAuth;
  code: string;
  verifier: string;
  redirectUri: string;
  fetchImpl?: typeof fetch;
}): Promise<IdTokenVerdict> {
  const body = new URLSearchParams({
    client_id: input.oauth.clientId,
    client_secret: input.oauth.clientSecret,
    code: input.code,
    code_verifier: input.verifier,
    grant_type: 'authorization_code',
    redirect_uri: input.redirectUri,
  });

  const response = await (input.fetchImpl ?? fetch)(GOOGLE_TOKEN_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded', accept: 'application/json' },
    body: body.toString(),
    // Le jeton ne doit atterrir dans aucun cache intermédiaire.
    cache: 'no-store',
  });

  if (!response.ok) {
    throw new Error(`Google a refusé l’échange du code (HTTP ${response.status}).`);
  }

  const payload = (await response.json()) as { id_token?: unknown };
  if (typeof payload.id_token !== 'string') {
    throw new Error('Réponse de Google sans jeton d’identité.');
  }

  return parseIdToken(payload.id_token, input.oauth.clientId);
}
