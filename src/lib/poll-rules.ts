import { POLL_LIMITS } from '@/config/limits';
import { isPast, isValidDay, type Day } from '@/lib/paris-day';

/**
 * Règles d'un sondage et d'une réponse - module PUR.
 *
 * Ce que le formulaire vérifie pour aider, le serveur le revérifie pour
 * décider (constitution II) : les deux appellent ces mêmes fonctions. Aucune
 * ne lève ; chacune rend la valeur normalisée ou le NOM de l'erreur, que la
 * validation traduit en français.
 */

export type RuleError =
  | 'required'
  | 'too_long'
  | 'invalid_email'
  | 'invalid_day'
  | 'past_day'
  | 'no_day'
  | 'too_many_days'
  | 'not_proposed';

export type RuleResult<T> = { ok: true; value: T } | { ok: false; error: RuleError };

const ok = <T>(value: T): RuleResult<T> => ({ ok: true, value });
const fail = <T>(error: RuleError): RuleResult<T> => ({ ok: false, error });

/** Longueur en caractères, pas en unités UTF-16 : un émoji compte pour un. */
function charCount(value: string): number {
  return Array.from(value).length;
}

/** Espaces de début et de fin retirés, suites d'espaces et retours ligne réduits à un espace. */
function singleLine(raw: string): string {
  return raw.replace(/\s+/g, ' ').trim();
}

function boundedLine(raw: string | null | undefined, max: number): RuleResult<string> {
  const value = singleLine(raw ?? '');
  if (value === '') return fail('required');
  if (charCount(value) > max) return fail('too_long');
  return ok(value);
}

/** Titre : obligatoire, 1 à 120 caractères après retrait des espaces. */
export function normalizeTitle(raw: string | null | undefined): RuleResult<string> {
  return boundedLine(raw, POLL_LIMITS.titleMax);
}

/** Pseudo : 1 à 50 caractères après retrait des espaces. */
export function normalizePseudonym(raw: string | null | undefined): RuleResult<string> {
  return boundedLine(raw, POLL_LIMITS.pseudonymMax);
}

/** Nom d'affichage : 1 à 60 caractères après retrait des espaces. */
export function normalizeDisplayName(raw: string | null | undefined): RuleResult<string> {
  return boundedLine(raw, POLL_LIMITS.displayNameMax);
}

/**
 * Description : facultative, jusqu'à 2 000 caractères. Les retours ligne sont
 * gardés (c'est un texte), les espaces de début et de fin retirés ; vide, elle
 * vaut `null`.
 */
export function normalizeDescription(raw: string | null | undefined): RuleResult<string | null> {
  const value = (raw ?? '').replace(/\r\n?/g, '\n').trim();
  if (value === '') return ok(null);
  if (charCount(value) > POLL_LIMITS.descriptionMax) return fail('too_long');
  return ok(value);
}

/** Adresse email : minuscules, sans espaces, 3 à 254 caractères, une arobase entourée. */
export function normalizeEmail(raw: string | null | undefined): RuleResult<string> {
  const value = (raw ?? '').trim().toLowerCase();
  if (value === '') return fail('required');
  if (value.length > POLL_LIMITS.emailMax) return fail('too_long');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) return fail('invalid_email');
  return ok(value);
}

/**
 * Jours proposés par le créateur, à la création comme à l'ajout (FR-008,
 * FR-010, FR-011, FR-027).
 *
 * `existing` porte les jours déjà proposés : ils sont ignorés s'ils reviennent
 * (doublons), et comptent dans le plafond. Rend les seuls jours NOUVEAUX,
 * triés. Sans jour existant, il en faut au moins un.
 */
export function validateProposedDays(
  days: readonly string[],
  today: Day,
  existing: ReadonlySet<Day> = new Set(),
): RuleResult<Day[]> {
  const fresh = new Set<Day>();
  for (const day of days) {
    if (!isValidDay(day)) return fail('invalid_day');
    if (isPast(day, today)) return fail('past_day');
    if (!existing.has(day)) fresh.add(day);
  }
  if (existing.size === 0 && fresh.size === 0) return fail('no_day');
  if (existing.size + fresh.size > POLL_LIMITS.maxDays) return fail('too_many_days');
  return ok([...fresh].sort());
}

/**
 * Jours choisis par un répondant (FR-015 à FR-017).
 *
 * Au moins un ; tous parmi les jours du sondage ; aucun passé. Le moindre jour
 * invalide refuse TOUTE la réponse : on n'enregistre pas une partie de ce que
 * la personne a voulu dire.
 */
export function validateResponseDays(
  days: readonly string[],
  pollDays: ReadonlySet<Day>,
  today: Day,
): RuleResult<Day[]> {
  const chosen = new Set<Day>();
  for (const day of days) {
    if (!isValidDay(day)) return fail('invalid_day');
    if (!pollDays.has(day)) return fail('not_proposed');
    if (isPast(day, today)) return fail('past_day');
    chosen.add(day);
  }
  if (chosen.size === 0) return fail('no_day');
  return ok([...chosen].sort());
}

/** Un sondage accepte encore des réponses : ouvert, et au moins un jour à venir. */
export function acceptsResponses(status: 'OPEN' | 'CLOSED', pollDays: Iterable<Day>, today: Day): boolean {
  if (status !== 'OPEN') return false;
  for (const day of pollDays) if (!isPast(day, today)) return true;
  return false;
}
