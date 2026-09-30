/**
 * Ce que la page de connexion dit quand la connexion Google n'aboutit pas - module PUR.
 *
 * Le motif voyage par l'URL sous forme de NOM pris dans cette table
 * (contracts/http-api.md), jamais en toutes lettres : un message écrit dans
 * l'URL serait un chemin d'écriture sur une page où le visiteur est en
 * confiance, ouvert à qui compose le lien. Un nom inconnu est JETÉ.
 */

export const GOOGLE_SIGNIN_PARAM = 'google';

/** « Continuer avec » : le même geste ouvre une session existante ou crée le compte. */
export const SIGN_IN_WITH_GOOGLE = 'Continuer avec Google';

export const GOOGLE_SIGNIN_NOTICES = {
  /** Le visiteur a annulé sur l'écran de Google : ce n'est pas une panne. */
  annule: 'Connexion Google annulée. Vous pouvez aussi vous connecter avec votre mot de passe.',
  /** Poignée de main expirée ou rejouée, compte déjà lié à une autre identité, jeton refusé. */
  refuse: 'La connexion Google n’a pas abouti. Réessayez, ou utilisez votre mot de passe.',
  /** Google n'a pas prouvé l'adresse : aucun rattachement. */
  'adresse-non-verifiee':
    'Google n’a pas confirmé cette adresse email. Utilisez votre mot de passe, ou confirmez l’adresse chez Google.',
  /** Pas d'identifiants Google, Google injoignable, ou trop de tentatives. */
  indisponible: 'La connexion Google n’est pas disponible pour le moment. Utilisez votre mot de passe.',
} as const;

export type GoogleSigninNotice = keyof typeof GOOGLE_SIGNIN_NOTICES;

/** Le message du nom reçu, s'il est de la table ; sinon rien. */
export function googleSigninNotice(value: unknown): string | null {
  if (typeof value !== 'string' || !Object.hasOwn(GOOGLE_SIGNIN_NOTICES, value)) return null;
  return GOOGLE_SIGNIN_NOTICES[value as GoogleSigninNotice];
}
