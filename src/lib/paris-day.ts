/**
 * Jours du calendrier, à Paris (research.md R17) - module PUR.
 *
 * Un jour proposé est une chaîne `AAAA-MM-JJ`, sans heure ni fuseau.
 * « Aujourd'hui » s'entend à l'heure de Paris : comparé à une date lue en UTC,
 * un sondage créé à 0 h 30 refuserait le jour même comme déjà passé. Le module
 * ne lit pas l'horloge, on la lui passe.
 */

export type Day = string;

/** `en-CA` écrit la date en `AAAA-MM-JJ` : la forme même d'un jour. */
const PARIS_DAY = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Europe/Paris',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

/** Le jour parisien de cet instant. */
export function todayInParis(now: Date): Day {
  return PARIS_DAY.format(now);
}

/** Un jour est passé s'il est strictement antérieur à aujourd'hui (Paris). */
export function isPast(day: Day, today: Day): boolean {
  return day < today;
}

/** Vrai pour une chaîne `AAAA-MM-JJ` qui désigne un jour qui existe. */
export function isValidDay(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

/** Le jour d'une colonne `DATE` lue par Prisma (minuit UTC). */
export function dayFromDate(date: Date): Day {
  return date.toISOString().slice(0, 10);
}

/** La valeur à écrire dans une colonne `DATE` pour ce jour. */
export function dateFromDay(day: Day): Date {
  return new Date(`${day}T00:00:00.000Z`);
}

/**
 * Le même quantième `months` mois plus tôt ou plus tard, ramené au dernier
 * jour du mois quand il n'y existe pas : un an avant le 29 février 2028 est
 * le 28 février 2027.
 */
export function addMonths(day: Day, months: number): Day {
  const [year, month, date] = day.split('-').map(Number) as [number, number, number];
  const target = new Date(Date.UTC(year, month - 1 + months, 1));
  const lastDate = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  target.setUTCDate(Math.min(date, lastDate));
  return dayFromDate(target);
}

const LONG_DAY = new Intl.DateTimeFormat('fr-FR', {
  weekday: 'long',
  day: 'numeric',
  month: 'long',
  year: 'numeric',
  timeZone: 'UTC',
});

const SHORT_DAY = new Intl.DateTimeFormat('fr-FR', {
  weekday: 'short',
  day: 'numeric',
  month: 'short',
  timeZone: 'UTC',
});

/** « mardi 14 octobre 2026 » : pages et emails l'écrivent de la même façon. */
export function formatLongDay(day: Day): string {
  return LONG_DAY.format(dateFromDay(day));
}

/** « mar. 14 oct. » : listes compactes. */
export function formatShortDay(day: Day): string {
  return SHORT_DAY.format(dateFromDay(day));
}
