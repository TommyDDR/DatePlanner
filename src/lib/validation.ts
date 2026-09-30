import { z } from 'zod';
import { PASSWORD, POLL_LIMITS } from '@/config/limits';
import { passwordRulesMessage } from '@/lib/password-rules';
import { PUBLIC_ID_PATTERN } from '@/lib/public-id';
import {
  normalizeDescription,
  normalizeDisplayName,
  normalizeEmail,
  normalizePseudonym,
  normalizeTitle,
  type RuleError,
  type RuleResult,
} from '@/lib/poll-rules';

/**
 * Schémas des entrées de chaque action serveur (contracts/server-actions.md).
 *
 * Partagés par le formulaire et par le serveur : le formulaire s'en sert pour
 * aider, le serveur pour décider. Les règles de fond (jours passés, plafond,
 * jours proposés) dépendent du jour courant et de la base : elles sont
 * appliquées par le serveur avec `poll-rules`, ces schémas ne vérifient ici
 * que la forme.
 */

export { PUBLIC_ID_PATTERN };
export const DAY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/** Messages des erreurs de `poll-rules`, en français. */
export const RULE_MESSAGES: Record<RuleError, string> = {
  required: 'Ce champ est obligatoire.',
  too_long: 'Ce texte est trop long.',
  invalid_email: 'Adresse email invalide.',
  invalid_day: 'Un des jours est invalide.',
  past_day: 'Un jour déjà passé ne peut pas être choisi.',
  no_day: 'Choisissez au moins un jour.',
  too_many_days: `Un sondage propose au plus ${POLL_LIMITS.maxDays} jours.`,
  not_proposed: 'Un des jours choisis ne fait pas partie du sondage.',
};

/** Une règle de `poll-rules` branchée dans Zod, avec des messages propres au champ. */
function rule<T>(
  normalize: (raw: string) => RuleResult<T>,
  messages: Partial<Record<RuleError, string>> = {},
) {
  return z.string().transform((raw, ctx) => {
    const result = normalize(raw);
    if (result.ok) return result.value;
    ctx.addIssue({ code: 'custom', message: messages[result.error] ?? RULE_MESSAGES[result.error], input: raw });
    return z.NEVER;
  });
}

/** Une case à cocher : présente (`on`) ou absente. */
const checkbox = z.preprocess((value) => value === 'on' || value === 'true' || value === true, z.boolean());

export const publicIdSchema = z.string().regex(PUBLIC_ID_PATTERN, 'Sondage introuvable.');
export const daySchema = z.string().regex(DAY_PATTERN, RULE_MESSAGES.invalid_day);
/** Une liste de jours, bornée pour qu'une requête fabriquée ne pèse rien. */
const daysSchema = z.array(daySchema).max(POLL_LIMITS.maxDays * 2, RULE_MESSAGES.too_many_days);

const emailSchema = rule(normalizeEmail, { required: 'Indiquez votre adresse email.' });
const displayNameSchema = rule(normalizeDisplayName, {
  required: 'Indiquez votre nom.',
  too_long: `Au plus ${POLL_LIMITS.displayNameMax} caractères.`,
});
const nextSchema = z.string().max(2000).optional();

/** Un mot de passe CHOISI : longueur, puis les quatre familles (FR-002). */
const newPasswordSchema = z
  .string()
  .min(PASSWORD.min, `Au moins ${PASSWORD.min} caractères.`)
  .max(PASSWORD.max, `Au plus ${PASSWORD.max} caractères.`)
  .superRefine((password, ctx) => {
    const message = passwordRulesMessage(password);
    if (message) ctx.addIssue({ code: 'custom', message, input: password });
  });

/* -------------------------------------------------------------------------- */
/* Comptes                                                                     */
/* -------------------------------------------------------------------------- */

export const registerSchema = z.object({
  email: emailSchema,
  displayName: displayNameSchema,
  password: newPasswordSchema,
  next: nextSchema,
});

/** La connexion accepte le mot de passe qui existe, sans règle de composition. */
export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, 'Indiquez votre mot de passe.').max(PASSWORD.max),
  next: nextSchema,
});

export const requestPasswordResetSchema = z.object({ email: emailSchema });

export const resetPasswordSchema = z.object({
  token: z.string().min(20).max(200),
  password: newPasswordSchema,
});

export const updateDisplayNameSchema = z.object({ displayName: displayNameSchema });

export const deleteAccountSchema = z.object({
  password: z.string().max(PASSWORD.max).optional(),
});

/* -------------------------------------------------------------------------- */
/* Sondages                                                                    */
/* -------------------------------------------------------------------------- */

const titleSchema = rule(normalizeTitle, {
  required: 'Donnez un titre au sondage.',
  too_long: `Au plus ${POLL_LIMITS.titleMax} caractères.`,
});
const descriptionSchema = z
  .string()
  .optional()
  .pipe(
    z.string().optional().transform((raw, ctx) => {
      const result = normalizeDescription(raw);
      if (result.ok) return result.value;
      ctx.addIssue({ code: 'custom', message: `Au plus ${POLL_LIMITS.descriptionMax} caractères.`, input: raw });
      return z.NEVER;
    }),
  );

export const createPollSchema = z.object({
  title: titleSchema,
  description: descriptionSchema,
  days: daysSchema,
  requireAccount: checkbox,
  notifyOwner: checkbox,
});

export const updatePollDetailsSchema = z.object({
  publicId: publicIdSchema,
  title: titleSchema,
  description: descriptionSchema,
});

/** Les jours à ajouter et ceux à retirer, envoyés ensemble par le calendrier du créateur. */
export const changePollDaysSchema = z.object({ publicId: publicIdSchema, add: daysSchema, remove: daysSchema });

export const setPollOptionsSchema = z.object({
  publicId: publicIdSchema,
  requireAccount: checkbox.optional(),
  notifyOwner: checkbox.optional(),
});

/** Un jour facultatif : un champ vide vaut « aucun ». */
const optionalDay = z.preprocess((value) => (value === '' ? undefined : value), daySchema.optional());

export const closePollSchema = z.object({ publicId: publicIdSchema, retainedDay: optionalDay });

export const setRetainedDaySchema = z.object({
  publicId: publicIdSchema,
  retainedDay: z.preprocess((value) => (value === '' || value === undefined ? null : value), daySchema.nullable()),
});

export const pollOnlySchema = z.object({ publicId: publicIdSchema });

export const deleteResponseSchema = z.object({
  publicId: publicIdSchema,
  responseId: z.uuid('Réponse introuvable.'),
});

/* -------------------------------------------------------------------------- */
/* Réponses                                                                    */
/* -------------------------------------------------------------------------- */

export const submitResponseSchema = z.object({
  publicId: publicIdSchema,
  days: daysSchema,
  // Exigé sans session, refusé avec : le serveur tranche selon la session.
  pseudonym: z.string().max(500).optional(),
});

export const pseudonymSchema = rule(normalizePseudonym, {
  required: 'Indiquez votre nom ou un pseudo.',
  too_long: `Au plus ${POLL_LIMITS.pseudonymMax} caractères.`,
});

/* -------------------------------------------------------------------------- */
/* Notifications                                                               */
/* -------------------------------------------------------------------------- */

export const disableOwnerDigestSchema = z.object({ token: z.string().min(10).max(500) });

/* -------------------------------------------------------------------------- */
/* Lecture d'un formulaire                                                     */
/* -------------------------------------------------------------------------- */

/**
 * Les champs d'un `FormData` en objet simple. Les clés de `arrays` sont lues
 * en listes (`getAll`) ; les autres gardent leur première valeur. Un champ
 * fichier n'a rien à faire ici : il est ignoré.
 */
export function readForm(form: FormData, arrays: readonly string[] = []): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const key of new Set(form.keys())) {
    if (arrays.includes(key)) {
      out[key] = form.getAll(key).filter((value): value is string => typeof value === 'string');
    } else {
      const value = form.get(key);
      if (typeof value === 'string') out[key] = value;
    }
  }
  for (const key of arrays) out[key] ??= [];
  return out;
}

/** Le premier message de chaque champ en erreur. */
export function fieldErrors(error: z.ZodError): Record<string, string> {
  const fields: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path.length > 0 ? String(issue.path[0]) : '_form';
    fields[key] ??= issue.message;
  }
  return fields;
}
