import type { ActionError } from '@/lib/action-result';

/**
 * État rendu par une action de formulaire : l'erreur, et les valeurs saisies
 * (jamais un secret) pour que le formulaire les garde après un refus.
 */
export type FormState = {
  error?: ActionError;
  values?: Record<string, unknown>;
  /** L'action a abouti sans quitter la page (lien envoyé, réglage enregistré). */
  done?: boolean;
} | null;

/** Le champ leurre : rempli, c'est un robot. Hors de vue et hors du clavier. */
export const HONEYPOT_FIELD = 'site_web';

export function isBot(form: FormData): boolean {
  const value = form.get(HONEYPOT_FIELD);
  return typeof value === 'string' && value !== '';
}

/** Le message d'un champ en erreur, s'il y en a un. */
export function fieldError(state: FormState, field: string): string | undefined {
  return state?.error?.code === 'VALIDATION' ? state.error.fields[field] : undefined;
}

/** Une valeur saisie à rendre au champ, en texte. */
export function keptText(state: FormState, field: string): string | undefined {
  const value = state?.values?.[field];
  return typeof value === 'string' ? value : undefined;
}
