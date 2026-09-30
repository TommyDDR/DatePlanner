/**
 * Résultat d'une action serveur (contracts/server-actions.md).
 *
 * `NOT_FOUND` couvre à la fois l'absent et le refusé : ils sont
 * indiscernables pour qui les reçoit (FR-028, constitution I).
 */

export type ActionError =
  | { code: 'VALIDATION'; fields: Record<string, string> }
  | { code: 'NOT_FOUND' }
  | { code: 'RATE_LIMITED'; retryAfterSeconds: number }
  | { code: 'POLL_CLOSED' }
  | { code: 'ACCOUNT_REQUIRED' }
  | { code: 'DAY_HAS_VOTES'; day: string }
  | { code: 'LAST_DAY' }
  | { code: 'AUTH_FAILED' }
  | { code: 'REAUTH_REQUIRED' };

export type ActionResult<T = null> = { ok: true; data: T } | { ok: false; error: ActionError };

export function ok<T>(data: T): ActionResult<T>;
export function ok(): ActionResult<null>;
export function ok<T>(data?: T): ActionResult<T | null> {
  return { ok: true, data: data ?? null };
}

export function fail(error: ActionError): { ok: false; error: ActionError } {
  return { ok: false, error };
}

/** Erreur de validation sur un seul champ, ou sur le formulaire entier (`_form`). */
export function invalid(field: string, message: string): { ok: false; error: ActionError } {
  return fail({ code: 'VALIDATION', fields: { [field]: message } });
}

/** Le texte à montrer pour une erreur qui n'est pas propre à un champ. */
export function errorMessage(error: ActionError): string {
  switch (error.code) {
    case 'VALIDATION':
      return error.fields._form ?? 'Certains champs sont à corriger.';
    case 'NOT_FOUND':
      return 'Introuvable.';
    case 'RATE_LIMITED': {
      const minutes = Math.max(1, Math.ceil(error.retryAfterSeconds / 60));
      return `Trop de tentatives. Réessayez dans ${minutes} minute${minutes > 1 ? 's' : ''}.`;
    }
    case 'POLL_CLOSED':
      return 'Ce sondage vient d’être clos : il n’accepte plus de réponse.';
    case 'ACCOUNT_REQUIRED':
      return 'Connectez-vous pour répondre à ce sondage.';
    case 'DAY_HAS_VOTES':
      return 'Ce jour a déjà reçu des votes : il ne peut plus être retiré.';
    case 'LAST_DAY':
      return 'Un sondage garde au moins un jour.';
    case 'AUTH_FAILED':
      return 'Adresse email ou mot de passe incorrect.';
    case 'REAUTH_REQUIRED':
      return 'Reconnectez-vous pour confirmer cette action.';
  }
}
