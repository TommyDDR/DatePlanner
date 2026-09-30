/**
 * Ce que décide le calendrier - module PUR.
 *
 * Le composant (`components/date-picker.tsx`) ne fait que peindre et écouter :
 * quels jours une grille de mois montre, ce qu'un jour permet, ce qu'un clic
 * sur un en-tête de colonne ou un numéro de semaine ajoute ou retire, ce
 * qu'un glissé applique. Tout cela se teste ici, hors du navigateur.
 *
 * Un jour est une chaîne `AAAA-MM-JJ`, la forme d'un champ `type="date"` et de
 * `parisDay` : aucun fuseau n'entre dans le calcul, l'arithmétique se fait sur
 * minuit UTC du jour, où il n'y a ni heure d'été ni heure d'hiver.
 */

export type Day = string;

const DAY_MS = 86_400_000;

function toUtc(day: Day): number {
  return Date.UTC(Number(day.slice(0, 4)), Number(day.slice(5, 7)) - 1, Number(day.slice(8, 10)));
}

function fromUtc(ms: number): Day {
  return new Date(ms).toISOString().slice(0, 10);
}

export function addDays(day: Day, count: number): Day {
  return fromUtc(toUtc(day) + count * DAY_MS);
}

/** 0 pour lundi … 6 pour dimanche : la semaine française commence le lundi. */
export function weekdayIndex(day: Day): number {
  return (new Date(toUtc(day)).getUTCDay() + 6) % 7;
}

/** Numéro de semaine ISO 8601 : la semaine qui contient le premier jeudi de l'année est la 1. */
export function isoWeek(day: Day): number {
  const thursday = addDays(day, 3 - weekdayIndex(day));
  const firstJanuary = `${thursday.slice(0, 4)}-01-01`;
  return Math.floor((toUtc(thursday) - toUtc(firstJanuary)) / DAY_MS / 7) + 1;
}

/** Un mois, par son premier jour. */
export type Month = { year: number; month: number };

export function monthOf(day: Day): Month {
  return { year: Number(day.slice(0, 4)), month: Number(day.slice(5, 7)) };
}

export function shiftMonth({ year, month }: Month, count: number): Month {
  const index = year * 12 + (month - 1) + count;
  return { year: Math.floor(index / 12), month: (index % 12) + 1 };
}

export function firstDayOf({ year, month }: Month): Day {
  return `${year}-${String(month).padStart(2, '0')}-01`;
}

export function compareMonths(a: Month, b: Month): number {
  return a.year * 12 + a.month - (b.year * 12 + b.month);
}

export function inMonth(day: Day, month: Month): boolean {
  return compareMonths(monthOf(day), month) === 0;
}

export type CalendarWeek = { week: number; days: Day[] };

/**
 * Les semaines d'un mois, du lundi au dimanche, jours des mois voisins
 * compris : une grille aux rangées entières se lit comme un calendrier mural,
 * et les jours d'à côté restent atteignables sans changer de page. Toujours
 * six rangées - la grille ne change pas de hauteur d'un mois à l'autre, et le
 * bouton « mois suivant » ne se dérobe pas sous le doigt.
 */
export function calendarWeeks(month: Month): CalendarWeek[] {
  const first = firstDayOf(month);
  const start = addDays(first, -weekdayIndex(first));
  return Array.from({ length: 6 }, (_, row) => {
    const days = Array.from({ length: 7 }, (_, column) => addDays(start, row * 7 + column));
    return { week: isoWeek(days[0]!), days };
  });
}

export type DayRules = {
  /** Premier jour sélectionnable, inclus. */
  min?: Day | null;
  /** Dernier jour sélectionnable, inclus. */
  max?: Day | null;
  /** Jours interdits : ils se voient, ils ne se choisissent pas. */
  disabled?: ReadonlySet<Day>;
};

export function isSelectable(day: Day, rules: DayRules): boolean {
  if (rules.min && day < rules.min) return false;
  if (rules.max && day > rules.max) return false;
  return !rules.disabled?.has(day);
}

/** Les jours de `from` à `to`, dans l'ordre du calendrier quel que soit le sens du glissé. */
export function daysBetween(from: Day, to: Day): Day[] {
  const [start, end] = from <= to ? [from, to] : [to, from];
  const out: Day[] = [];
  for (let day = start; day <= end; day = addDays(day, 1)) out.push(day);
  return out;
}

/**
 * Les MARQUES d'un calendrier : pour chaque jour marqué, le rang de son état
 * dans le cycle - 1 pour le premier état, 2 pour le second… Un jour absent est
 * NEUTRE (rang 0). Un choix multiple ordinaire n'a qu'un état (« choisi ») ;
 * le calendrier de l'atelier en a deux (« proposé », puis « interdit »).
 *
 * Chaque geste fait AVANCER dans le cycle - neutre, premier état, second
 * état, neutre -, et ce qui change d'un geste à l'autre est seulement le
 * point de départ :
 * - un jour : son propre état ;
 * - un glissé : l'état du PREMIER jour, appliqué à toute la plage ;
 * - un groupe (colonne, semaine) : l'état le plus AVANCÉ présent dans le
 *   groupe. Avec un seul état, c'est la règle « un jour choisi dans le
 *   groupe, et le groupe est retiré ; aucun, et il est ajouté ».
 *
 * Seuls comptent les jours sélectionnables : un jour interdit n'entre jamais,
 * et ne décide pas du départ d'un groupe.
 */
export type Marks = Readonly<Record<Day, number>>;

/** L'état qui suit, dans un cycle de `count` états marqués plus le neutre. */
export function nextMark(rank: number, count: number): number {
  return (rank + 1) % (count + 1);
}

function setAll(marks: Marks, days: readonly Day[], rank: number): Record<Day, number> {
  const out: Record<Day, number> = { ...marks };
  for (const day of days) {
    if (rank === 0) delete out[day];
    else out[day] = rank;
  }
  return out;
}

/** Un clic sur un jour. */
export function cycleDay(marks: Marks, day: Day, count: number, rules: DayRules): Record<Day, number> {
  if (!isSelectable(day, rules)) return { ...marks };
  return setAll(marks, [day], nextMark(marks[day] ?? 0, count));
}

/** Un glissé de `anchor` à `over` : l'état qui suit celui du premier jour, sur toute la plage. */
export function cycleRange(
  marks: Marks,
  anchor: Day,
  over: Day,
  count: number,
  rules: DayRules,
): Record<Day, number> {
  const target = nextMark(marks[anchor] ?? 0, count);
  const days = daysBetween(anchor, over).filter((day) => isSelectable(day, rules));
  return setAll(marks, days, target);
}

/** Un clic sur une colonne ou une semaine : l'état qui suit le plus avancé du groupe. */
export function cycleGroup(
  marks: Marks,
  group: readonly Day[],
  count: number,
  rules: DayRules,
): Record<Day, number> {
  const eligible = group.filter((day) => isSelectable(day, rules));
  const furthest = Math.max(0, ...eligible.map((day) => marks[day] ?? 0));
  return setAll(marks, eligible, nextMark(furthest, count));
}

/** Les jours portant ce rang, dans l'ordre du calendrier. */
export function daysMarked(marks: Marks, rank: number): Day[] {
  return Object.keys(marks)
    .filter((day) => marks[day] === rank)
    .sort();
}

/**
 * Les jours d'une colonne (lundi = 0) tels que la grille les MONTRE, mois
 * voisins compris : un clic sur une initiale prend ce qu'on a sous les yeux.
 */
export function weekdayColumn(month: Month, weekday: number): Day[] {
  return calendarWeeks(month).map((week) => week.days[weekday]!);
}

/**
 * Combien de mois montrer côte à côte pour lire ces jours : un seul s'ils
 * tiennent dans un mois, deux sinon - au-delà, les flèches font défiler.
 */
export function monthsToShow(days: readonly Day[]): 1 | 2 {
  return new Set(days.map((day) => day.slice(0, 7))).size > 1 ? 2 : 1;
}

/**
 * Le premier mois d'une fenêtre de `count` mois qui doit montrer `month`.
 *
 * La fenêtre recule d'autant qu'il faut pour ne pas finir au-delà de `last` -
 * deux mois dont le second serait vide alors que le précédent a des jours à
 * montrer -, sans remonter avant `first`. `month` reste toujours visible.
 */
export function windowStart(
  month: Month,
  count: number,
  bounds: { first?: Month | null; last?: Month | null } = {},
): Month {
  let start = month;
  if (bounds.last && compareMonths(bounds.last, shiftMonth(month, count - 1)) < 0) {
    const latest = shiftMonth(bounds.last, -(count - 1));
    const earliest = shiftMonth(month, -(count - 1));
    start = compareMonths(latest, earliest) > 0 ? latest : earliest;
  }
  if (bounds.first && compareMonths(start, bounds.first) < 0) start = bounds.first;
  return start;
}

/**
 * Le mois qu'ouvre le calendrier : celui du premier jour choisi, sinon du
 * premier jour mis en évidence, sinon du premier jour permis, sinon
 * d'aujourd'hui. Ouvrir sur un mois vide quand les jours proposés sont le mois
 * suivant ferait chercher ce qu'on vient de recevoir.
 */
export function initialMonth(input: {
  selected: readonly Day[];
  highlighted: readonly Day[];
  min?: Day | null;
  today: Day;
}): Month {
  const firstSelected = [...input.selected].sort()[0];
  const firstHighlighted = [...input.highlighted]
    .filter((day) => !input.min || day >= input.min)
    .sort()[0];
  const floor = input.min && input.min > input.today ? input.min : input.today;
  return monthOf(firstSelected ?? firstHighlighted ?? floor);
}

/**
 * Le jour où mène une touche du clavier, depuis `day`. `null` pour une touche
 * que la grille ne prend pas - elle reste au navigateur.
 */
export function keyTarget(day: Day, key: string, shift = false): Day | null {
  switch (key) {
    case 'ArrowLeft':
      return addDays(day, -1);
    case 'ArrowRight':
      return addDays(day, 1);
    case 'ArrowUp':
      return addDays(day, -7);
    case 'ArrowDown':
      return addDays(day, 7);
    case 'Home':
      return addDays(day, -weekdayIndex(day));
    case 'End':
      return addDays(day, 6 - weekdayIndex(day));
    case 'PageUp':
    case 'PageDown': {
      // Même quantième, un mois (une année avec Maj) plus tôt ou plus tard,
      // ramené au dernier jour quand le mois d'arrivée est plus court.
      const step = (key === 'PageUp' ? -1 : 1) * (shift ? 12 : 1);
      const target = shiftMonth(monthOf(day), step);
      const last = addDays(firstDayOf(shiftMonth(target, 1)), -1);
      const wanted = `${firstDayOf(target).slice(0, 8)}${day.slice(8, 10)}`;
      return wanted > last || !/^\d{4}-\d{2}-\d{2}$/.test(wanted) ? last : wanted;
    }
    default:
      return null;
  }
}

/**
 * Une PLAGE de jours : son premier jour, puis son dernier. `end` reste nul
 * tant que le second clic n'est pas venu - la plage est alors ouverte.
 */
export type DayRange = { start: Day | null; end: Day | null };

export const EMPTY_RANGE: DayRange = { start: null, end: null };

/**
 * Un clic en choix de plage : le premier pose le début, le second ferme la
 * plage - dans l'ordre du calendrier, quel que soit le sens où l'on a cliqué -,
 * un troisième repart d'un nouveau début. Un même jour cliqué deux fois fait
 * une plage d'un jour.
 */
export function rangeClick(range: DayRange, day: Day, rules: DayRules): DayRange {
  if (!isSelectable(day, rules)) return range;
  if (range.start === null || range.end !== null) return { start: day, end: null };
  return day < range.start ? { start: day, end: range.start } : { start: range.start, end: day };
}

/**
 * La plage telle qu'elle se PEINT : fermée, elle-même ; ouverte, du début au
 * jour survolé, pour montrer ce que le second clic prendrait.
 */
export function rangeShown(range: DayRange, hover: Day | null): { start: Day; end: Day } | null {
  if (range.start === null) return null;
  const end = range.end ?? hover ?? range.start;
  return end < range.start ? { start: end, end: range.start } : { start: range.start, end };
}

export function lastDayOf(month: Month): Day {
  return addDays(firstDayOf(shiftMonth(month, 1)), -1);
}

/**
 * Une plage d'un bloc - un mois, une année -, ramenée aux jours permis. `null`
 * quand rien n'y est permis : un bouton « toute l'année » ne choisit pas une
 * année entièrement hors des bornes.
 */
export function clampRange(start: Day, end: Day, rules: DayRules): DayRange | null {
  const from = rules.min && start < rules.min ? rules.min : start;
  const to = rules.max && end > rules.max ? rules.max : end;
  return from <= to ? { start: from, end: to } : null;
}

export function monthRange(month: Month, rules: DayRules): DayRange | null {
  return clampRange(firstDayOf(month), lastDayOf(month), rules);
}

export function yearRange(year: number, rules: DayRules): DayRange | null {
  return clampRange(`${year}-01-01`, `${year}-12-31`, rules);
}

/** Un mois se choisit dans la vue des mois s'il porte au moins un jour permis. */
export function isMonthSelectable(month: Month, min?: Day | null, max?: Day | null): boolean {
  if (min && compareMonths(month, monthOf(min)) < 0) return false;
  if (max && compareMonths(month, monthOf(max)) > 0) return false;
  return true;
}

export function isYearSelectable(year: number, min?: Day | null, max?: Day | null): boolean {
  if (min && year < Number(min.slice(0, 4))) return false;
  if (max && year > Number(max.slice(0, 4))) return false;
  return true;
}

/**
 * Les douze années de la vue des années qui contient `year` : des pages
 * FIXES, alignées sur un multiple de douze, pour qu'une année revienne
 * toujours à la même place quand on feuillette.
 */
export function yearPage(year: number): number[] {
  const first = Math.floor(year / 12) * 12;
  return Array.from({ length: 12 }, (_, index) => first + index);
}
