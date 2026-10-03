import { ADMIN_LISTS } from '@/config/limits';
import { isValidDay, type Day } from '@/lib/paris-day';

/**
 * Paramètres des listes de l'administration (décision 042) - module PUR.
 *
 * Ils voyagent dans l'adresse : une liste filtrée se recharge, se partage et
 * se parcourt sans JavaScript. Une valeur inconnue ou mal formée ne lève
 * rien, elle retombe sur sa valeur par défaut ; l'adresse rendue n'écrit que
 * celles qui s'en écartent.
 */

/** Les paramètres d'une page, ou les champs d'un formulaire lus par `readForm`. */
type SearchParams = Record<string, unknown>;

function first(value: unknown): string | undefined {
  const one: unknown = Array.isArray(value) ? value[0] : value;
  return typeof one === 'string' ? one : undefined;
}

function oneOf<T extends string>(value: string | undefined, allowed: readonly T[], fallback: T): T {
  return (allowed as readonly string[]).includes(value ?? '') ? (value as T) : fallback;
}

function readSearch(value: string | undefined): string {
  return (value ?? '').trim().slice(0, ADMIN_LISTS.searchMax);
}

function readPage(value: string | undefined): number {
  const page = Number(value);
  return Number.isSafeInteger(page) && page >= 1 ? page : 1;
}

function readDay(value: string | undefined): Day | null {
  const day = value?.trim() ?? '';
  return isValidDay(day) ? day : null;
}

/** Le nombre de pages d'une liste : une au moins, même vide. */
export function pageCount(total: number): number {
  return Math.max(1, Math.ceil(total / ADMIN_LISTS.pageSize));
}

/** Une page au-delà de la dernière montre la dernière : une suppression peut avoir raccourci la liste. */
export function clampPage(page: number, total: number): number {
  return Math.min(page, pageCount(total));
}

function href(path: string, values: Record<string, string | number | null>, defaults: Record<string, string | number | null>): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(values)) {
    if (value === null || value === '' || value === defaults[key]) continue;
    params.set(key, String(value));
  }
  const query = params.toString();
  return query === '' ? path : `${path}?${query}`;
}

/* -------------------------------------------------------------------------- */
/* Utilisateurs                                                                */
/* -------------------------------------------------------------------------- */

export const USERS_PATH = '/admin/utilisateurs';

/** `q` : un morceau du nom ou de l'adresse. */
export type UserListQuery = { q: string; page: number };

const USER_LIST_DEFAULTS: UserListQuery = { q: '', page: 1 };

export function parseUserListQuery(params: SearchParams): UserListQuery {
  return { q: readSearch(first(params.q)), page: readPage(first(params.page)) };
}

/** `supprime` : la liste dit qu'un compte vient d'être supprimé. */
export function userListHref(query: UserListQuery, notice?: 'supprime'): string {
  return href(USERS_PATH, { ...query, ...(notice ? { [notice]: '1' } : {}) }, USER_LIST_DEFAULTS);
}

/* -------------------------------------------------------------------------- */
/* Sondages                                                                    */
/* -------------------------------------------------------------------------- */

export const POLLS_PATH = '/admin/sondages';

export const POLL_STATES = ['tous', 'ouverts', 'clos'] as const;
export const PERIOD_FIELDS = ['creation', 'cloture', 'jours'] as const;
export const POLL_SORTS = ['creation', 'cloture', 'activite', 'titre', 'repondants'] as const;
export const SORT_ORDERS = ['desc', 'asc'] as const;

export type PollStateFilter = (typeof POLL_STATES)[number];
export type PeriodField = (typeof PERIOD_FIELDS)[number];
export type PollSort = (typeof POLL_SORTS)[number];
export type SortOrder = (typeof SORT_ORDERS)[number];

export const POLL_STATE_LABELS: Record<PollStateFilter, string> = {
  tous: 'Tous',
  ouverts: 'En cours',
  clos: 'Clos',
};

export const PERIOD_FIELD_LABELS: Record<PeriodField, string> = {
  creation: 'Date de création',
  cloture: 'Date de clôture',
  jours: 'Jours proposés',
};

export const POLL_SORT_LABELS: Record<PollSort, string> = {
  creation: 'Date de création',
  cloture: 'Date de clôture',
  activite: 'Dernière activité',
  titre: 'Titre',
  repondants: 'Nombre de répondants',
};

export const SORT_ORDER_LABELS: Record<SortOrder, string> = {
  desc: 'Décroissant',
  asc: 'Croissant',
};

/**
 * `q` : un morceau du titre, du nom ou de l'adresse du créateur ; `etat` ;
 * `du` et `au`, jours compris, portant sur `periode` ; `tri` et `sens`.
 */
export type PollListQuery = {
  q: string;
  etat: PollStateFilter;
  periode: PeriodField;
  du: Day | null;
  au: Day | null;
  tri: PollSort;
  sens: SortOrder;
  page: number;
};

export const POLL_LIST_DEFAULTS: PollListQuery = {
  q: '',
  etat: 'tous',
  periode: 'creation',
  du: null,
  au: null,
  tri: 'creation',
  sens: 'desc',
  page: 1,
};

export function parsePollListQuery(params: SearchParams): PollListQuery {
  let du = readDay(first(params.du));
  let au = readDay(first(params.au));
  // Une période saisie à l'envers est lue à l'endroit.
  if (du !== null && au !== null && du > au) [du, au] = [au, du];
  return {
    q: readSearch(first(params.q)),
    etat: oneOf(first(params.etat), POLL_STATES, POLL_LIST_DEFAULTS.etat),
    periode: oneOf(first(params.periode), PERIOD_FIELDS, POLL_LIST_DEFAULTS.periode),
    du,
    au,
    tri: oneOf(first(params.tri), POLL_SORTS, POLL_LIST_DEFAULTS.tri),
    sens: oneOf(first(params.sens), SORT_ORDERS, POLL_LIST_DEFAULTS.sens),
    page: readPage(first(params.page)),
  };
}

export function pollListHref(query: PollListQuery): string {
  return href(POLLS_PATH, query, POLL_LIST_DEFAULTS);
}

/** Des filtres posés : la liste vide le dit autrement qu'une base vide. */
export function isFiltered(query: PollListQuery): boolean {
  return query.q !== '' || query.etat !== 'tous' || query.du !== null || query.au !== null;
}

/* -------------------------------------------------------------------------- */
/* Écrans                                                                      */
/* -------------------------------------------------------------------------- */

/** Les écrans de l'administration, dans l'ordre de ses menus. */
export const ADMIN_SCREENS = [
  { key: 'utilisateurs', href: USERS_PATH, label: 'Utilisateurs' },
  { key: 'sondages', href: POLLS_PATH, label: 'Tous les sondages' },
] as const;

export type AdminScreen = (typeof ADMIN_SCREENS)[number]['key'];
