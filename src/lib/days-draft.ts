import type { Day, Marks } from '@/lib/date-picker';

/**
 * Les jours d'un sondage tels que le créateur les modifie - module PUR.
 *
 * Le calendrier du créateur montre le sondage tel qu'il SERA : les jours
 * gardés et ceux qu'on ajoute. Le brouillon, lui, ne retient que l'écart avec
 * le sondage enregistré - les jours à ajouter, ceux à retirer -, et c'est cet
 * écart qui part au serveur, d'un seul envoi.
 *
 * Un jour VERROUILLÉ ne se retire pas : il a reçu un vote (décision 022), ou
 * c'est la date retenue. Un vote peut arriver pendant que le créateur prépare
 * ses changements : le retrait qu'il avait noté pour ce jour ne part plus, et
 * reste inscrit au brouillon pour qu'on l'en avertisse.
 */

export type DaysDraft = { add: readonly Day[]; remove: readonly Day[] };

export const EMPTY_DRAFT: DaysDraft = { add: [], remove: [] };

/** Ce que le calendrier doit savoir du sondage enregistré. */
export type SavedDays = {
  /** Les jours du sondage, `AAAA-MM-JJ`. */
  days: readonly Day[];
  /** Les jours qui portent au moins un vote. */
  voted: ReadonlySet<Day>;
  retainedDay: Day | null;
};

/** Les jours qui ne se retirent pas : votés, ou date retenue. */
export function lockedDays({ days, voted, retainedDay }: SavedDays): Day[] {
  return days.filter((day) => voted.has(day) || day === retainedDay);
}

/** Les marques du calendrier : les jours libres qu'on garde, et ceux qu'on ajoute. */
export function draftMarks(saved: SavedDays, draft: DaysDraft): Marks {
  const locked = new Set(lockedDays(saved));
  const removed = new Set(draft.remove);
  const marks: Record<Day, number> = {};
  for (const day of saved.days) if (!locked.has(day) && !removed.has(day)) marks[day] = 1;
  for (const day of draft.add) marks[day] = 1;
  return marks;
}

/**
 * Le brouillon que dessinent ces marques : un jour marqué hors du sondage
 * est à ajouter, un jour libre du sondage qui ne l'est plus est à retirer.
 * Un retrait devancé par un vote reste noté (voir `overtaken`).
 */
export function draftFromMarks(marks: Marks, saved: SavedDays, previous: DaysDraft): DaysDraft {
  const inPoll = new Set(saved.days);
  const locked = new Set(lockedDays(saved));
  const add = Object.keys(marks)
    .filter((day) => marks[day] && !inPoll.has(day))
    .sort();
  const remove = new Set(saved.days.filter((day) => !locked.has(day) && !marks[day]));
  for (const day of previous.remove) if (saved.voted.has(day)) remove.add(day);
  return { add, remove: [...remove].sort() };
}

/**
 * Ce que le brouillon demande, confronté au sondage tel qu'il est
 * maintenant : `remove` ne garde que les jours encore libres ; `overtaken`
 * dit ceux dont le retrait n'est plus possible parce qu'ils ont reçu un vote ;
 * `remaining`, combien de jours aurait le sondage.
 */
export function draftChanges(saved: SavedDays, draft: DaysDraft) {
  const inPoll = new Set(saved.days);
  const locked = new Set(lockedDays(saved));
  const add = draft.add.filter((day) => !inPoll.has(day));
  const remove = draft.remove.filter((day) => inPoll.has(day) && !locked.has(day));
  const overtaken = draft.remove.filter((day) => saved.voted.has(day));
  return { add, remove, overtaken, remaining: saved.days.length - remove.length + add.length };
}
