/**
 * Une durée en mots, telle que les pages légales l'annoncent - module PUR.
 *
 * Toutes les durées de la politique de confidentialité passent par ici : lues
 * dans la configuration, jamais recopiées, et écrites d'une seule façon.
 */

const UNITS = {
  minute: ['une minute', 'minutes'],
  heure: ['une heure', 'heures'],
  jour: ['un jour', 'jours'],
  mois: ['un mois', 'mois'],
  an: ['un an', 'ans'],
} as const;

export type DurationUnit = keyof typeof UNITS;

/** « un an », « 3 ans », « 12 mois », « 30 jours ». */
export function duration(count: number, unit: DurationUnit): string {
  const [one, many] = UNITS[unit];
  return count === 1 ? one : `${count} ${many}`;
}

/** Durée d'un mois moyen, en secondes. */
const MONTH_SECONDS = (365.25 / 12) * 86_400;

/**
 * Une durée de cookie ou de lien, en secondes, dans l'unité la plus grande
 * qui la dit sans reste : « une heure », « 30 jours », « 10 minutes ».
 * Au-delà de l'an, elle se compte en mois : un cookie de 396 jours dure
 * « 13 mois ».
 */
export function secondsInWords(seconds: number): string {
  if (seconds >= 365 * 86_400) return duration(Math.round(seconds / MONTH_SECONDS), 'mois');
  if (seconds % 86_400 === 0) return duration(seconds / 86_400, 'jour');
  if (seconds % 3600 === 0) return duration(seconds / 3600, 'heure');
  return duration(Math.round(seconds / 60), 'minute');
}
