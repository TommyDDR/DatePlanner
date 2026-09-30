import { describe, expect, it } from 'vitest';
import {
  addDays,
  calendarWeeks,
  clampRange,
  EMPTY_RANGE,
  isMonthSelectable,
  isYearSelectable,
  monthRange,
  rangeClick,
  rangeShown,
  yearPage,
  yearRange,
  cycleDay,
  cycleGroup,
  cycleRange,
  daysMarked,
  initialMonth,
  isoWeek,
  isSelectable,
  keyTarget,
  shiftMonth,
  weekdayColumn,
  weekdayIndex,
} from '@/lib/date-picker';

/**
 * Le calendrier du site : ce qu'une grille montre, ce qu'un clic, un glissé,
 * une colonne ou une semaine font de la sélection. Tout se décide dans le
 * module pur, ici, sans navigateur.
 */

const rules = { min: '2026-09-16', max: '2026-11-15', disabled: new Set(['2026-09-24']) };

describe('Grille d’un mois', () => {
  it('commence le lundi et compte six semaines entières', () => {
    const weeks = calendarWeeks({ year: 2026, month: 9 });
    expect(weeks).toHaveLength(6);
    // Le 1er septembre 2026 est un mardi : la grille part du lundi 31 août.
    expect(weeks[0]!.days[0]).toBe('2026-08-31');
    expect(weeks.every((week) => week.days.length === 7)).toBe(true);
    expect(weekdayIndex(weeks[0]!.days[0]!)).toBe(0);
  });

  it('numérote les semaines selon ISO 8601, y compris à cheval sur deux années', () => {
    expect(isoWeek('2026-09-16')).toBe(38);
    expect(isoWeek('2021-01-03')).toBe(53);
    expect(isoWeek('2026-12-31')).toBe(53);
    expect(isoWeek('2027-01-04')).toBe(1);
  });

  it('change de mois et d’année sans fuseau', () => {
    expect(shiftMonth({ year: 2026, month: 12 }, 1)).toEqual({ year: 2027, month: 1 });
    expect(shiftMonth({ year: 2026, month: 1 }, -1)).toEqual({ year: 2025, month: 12 });
    // Le passage à l'heure d'hiver ne décale aucun jour.
    expect(addDays('2026-10-24', 2)).toBe('2026-10-26');
  });
});

describe('Jours permis', () => {
  it('borne par min et max, et refuse les jours interdits', () => {
    expect(isSelectable('2026-09-15', rules)).toBe(false);
    expect(isSelectable('2026-09-16', rules)).toBe(true);
    expect(isSelectable('2026-09-24', rules)).toBe(false);
    expect(isSelectable('2026-11-16', rules)).toBe(false);
  });
});

/** Un choix ordinaire : un seul état. L'atelier : proposé (1), puis interdit (2). */
const ONE = 1;
const TWO = 2;

describe('Un clic sur un jour', () => {
  it('fait avancer le jour dans le cycle, puis le ramène au neutre', () => {
    let marks = cycleDay({}, '2026-09-22', TWO, rules);
    expect(marks).toEqual({ '2026-09-22': 1 });
    marks = cycleDay(marks, '2026-09-22', TWO, rules);
    expect(marks).toEqual({ '2026-09-22': 2 });
    expect(cycleDay(marks, '2026-09-22', TWO, rules)).toEqual({});
  });

  it('en choix ordinaire, bascule entre choisi et neutre', () => {
    expect(cycleDay(cycleDay({}, '2026-09-22', ONE, rules), '2026-09-22', ONE, rules)).toEqual({});
  });

  it('ne marque jamais un jour interdit', () => {
    expect(cycleDay({}, '2026-09-24', TWO, rules)).toEqual({});
  });
});

describe('Glissé d’un jour à un autre', () => {
  it('applique à toute la plage l’état qui suit celui du premier jour, jours interdits exclus', () => {
    expect(cycleRange({}, '2026-09-22', '2026-09-25', TWO, rules)).toEqual({
      '2026-09-22': 1,
      '2026-09-23': 1,
      '2026-09-25': 1,
    });
    // Premier jour proposé : la plage passe en interdit, quel que soit l'état des autres.
    const marks = { '2026-09-22': 1, '2026-09-23': 2 };
    expect(cycleRange(marks, '2026-09-22', '2026-09-23', TWO, rules)).toEqual({
      '2026-09-22': 2,
      '2026-09-23': 2,
    });
  });

  it('ramène la plage au neutre quand le premier jour était au bout du cycle', () => {
    const marks = { '2026-09-21': 1, '2026-09-22': 2, '2026-09-23': 1, '2026-09-28': 1 };
    expect(cycleRange(marks, '2026-09-22', '2026-09-28', TWO, rules)).toEqual({ '2026-09-21': 1 });
  });

  it('marche à rebours : le premier jour est celui où le geste commence', () => {
    const marks = { '2026-09-25': 1 };
    expect(cycleRange(marks, '2026-09-25', '2026-09-22', TWO, rules)).toEqual({
      '2026-09-22': 2,
      '2026-09-23': 2,
      '2026-09-25': 2,
    });
  });
});

describe('Colonne et semaine', () => {
  const september = { year: 2026, month: 9 };

  it('une colonne prend tous les jours AFFICHÉS, mois voisins compris', () => {
    expect(weekdayColumn(september, 0)).toEqual([
      '2026-08-31',
      '2026-09-07',
      '2026-09-14',
      '2026-09-21',
      '2026-09-28',
      '2026-10-05',
    ]);
  });

  it('avance la colonne depuis l’état le plus avancé qu’elle contient', () => {
    const column = weekdayColumn(september, 0);
    // Aucun jour marqué : tous proposés (le 31 août, le 7 et le 14 sont avant `min`).
    expect(cycleGroup({}, column, TWO, rules)).toEqual({
      '2026-09-21': 1,
      '2026-09-28': 1,
      '2026-10-05': 1,
    });
    // Un jour proposé : tous interdits.
    expect(cycleGroup({ '2026-09-28': 1 }, column, TWO, rules)).toEqual({
      '2026-09-21': 2,
      '2026-09-28': 2,
      '2026-10-05': 2,
    });
    // Un jour interdit : tous au neutre.
    expect(cycleGroup({ '2026-09-28': 2, '2026-10-05': 1 }, column, TWO, rules)).toEqual({});
  });

  it('en choix ordinaire, retire le groupe dès qu’un jour est choisi, l’ajoute sinon', () => {
    const week = calendarWeeks(september).find((row) => row.days.includes('2026-09-24'))!;
    expect(daysMarked(cycleGroup({}, week.days, ONE, rules), 1)).toEqual([
      '2026-09-21',
      '2026-09-22',
      '2026-09-23',
      '2026-09-25',
      '2026-09-26',
      '2026-09-27',
    ]);
    expect(cycleGroup({ '2026-09-23': 1, '2026-10-01': 1 }, week.days, ONE, rules)).toEqual({
      '2026-10-01': 1,
    });
  });

  it('un jour interdit ne décide pas du départ d’un groupe', () => {
    const week = calendarWeeks(september).find((row) => row.days.includes('2026-09-24'))!;
    expect(cycleGroup({ '2026-09-24': 2 }, week.days, TWO, rules)['2026-09-21']).toBe(1);
  });
});

describe('Ouverture et clavier', () => {
  it('ouvre sur le choix, sinon sur les jours mis en évidence, sinon sur le premier jour permis', () => {
    const today = '2026-09-16';
    expect(initialMonth({ selected: ['2026-10-02'], highlighted: [], today })).toEqual({ year: 2026, month: 10 });
    expect(initialMonth({ selected: [], highlighted: ['2026-11-03'], today })).toEqual({ year: 2026, month: 11 });
    expect(initialMonth({ selected: [], highlighted: [], min: '2026-12-01', today })).toEqual({
      year: 2026,
      month: 12,
    });
  });

  it('déplace le jour au clavier, et ramène un quantième trop grand au dernier jour du mois', () => {
    expect(keyTarget('2026-09-16', 'ArrowDown')).toBe('2026-09-23');
    expect(keyTarget('2026-09-16', 'Home')).toBe('2026-09-14');
    expect(keyTarget('2026-09-16', 'End')).toBe('2026-09-20');
    expect(keyTarget('2026-01-31', 'PageDown')).toBe('2026-02-28');
    expect(keyTarget('2026-09-16', 'PageUp', true)).toBe('2025-09-16');
    expect(keyTarget('2026-09-16', 'a')).toBeNull();
  });
});

describe('Choix de plage', () => {
  const rules = { max: '2026-09-23' };

  it('pose le début, ferme la plage dans l’ordre du calendrier, puis repart', () => {
    const opened = rangeClick(EMPTY_RANGE, '2026-06-10', rules);
    expect(opened).toEqual({ start: '2026-06-10', end: null });
    expect(rangeClick(opened, '2026-06-03', rules)).toEqual({ start: '2026-06-03', end: '2026-06-10' });
    const closed = rangeClick(opened, '2026-08-12', rules);
    expect(closed).toEqual({ start: '2026-06-10', end: '2026-08-12' });
    expect(rangeClick(closed, '2026-07-01', rules)).toEqual({ start: '2026-07-01', end: null });
    expect(rangeClick(opened, '2026-06-10', rules)).toEqual({ start: '2026-06-10', end: '2026-06-10' });
  });

  it('ignore un jour hors des bornes', () => {
    expect(rangeClick(EMPTY_RANGE, '2026-10-01', rules)).toBe(EMPTY_RANGE);
  });

  it('peint une plage ouverte jusqu’au jour survolé, dans les deux sens', () => {
    const opened = { start: '2026-06-10', end: null };
    expect(rangeShown(EMPTY_RANGE, '2026-06-12')).toBeNull();
    expect(rangeShown(opened, null)).toEqual({ start: '2026-06-10', end: '2026-06-10' });
    expect(rangeShown(opened, '2026-06-02')).toEqual({ start: '2026-06-02', end: '2026-06-10' });
    expect(rangeShown({ start: '2026-06-10', end: '2026-06-20' }, '2026-07-01')).toEqual({
      start: '2026-06-10',
      end: '2026-06-20',
    });
  });

  it('prend un mois ou une année d’un geste, ramenés aux bornes', () => {
    expect(monthRange({ year: 2026, month: 2 }, {})).toEqual({ start: '2026-02-01', end: '2026-02-28' });
    expect(yearRange(2025, rules)).toEqual({ start: '2025-01-01', end: '2025-12-31' });
    expect(yearRange(2026, rules)).toEqual({ start: '2026-01-01', end: '2026-09-23' });
    expect(yearRange(2027, rules)).toBeNull();
    expect(clampRange('2026-01-01', '2026-12-31', { min: '2026-03-15' })).toEqual({
      start: '2026-03-15',
      end: '2026-12-31',
    });
  });
});

describe('Vues des mois et des années', () => {
  it('feuillette les années par pages fixes de douze', () => {
    expect(yearPage(2026)).toEqual([2016, 2017, 2018, 2019, 2020, 2021, 2022, 2023, 2024, 2025, 2026, 2027]);
    expect(yearPage(2016)[0]).toBe(2016);
    expect(yearPage(2028)[0]).toBe(2028);
  });

  it('ne rend choisissables que les mois et années qui portent un jour permis', () => {
    expect(isMonthSelectable({ year: 2026, month: 9 }, null, '2026-09-23')).toBe(true);
    expect(isMonthSelectable({ year: 2026, month: 10 }, null, '2026-09-23')).toBe(false);
    expect(isMonthSelectable({ year: 2026, month: 2 }, '2026-03-01', null)).toBe(false);
    expect(isYearSelectable(2026, null, '2026-09-23')).toBe(true);
    expect(isYearSelectable(2027, null, '2026-09-23')).toBe(false);
    expect(isYearSelectable(2025, '2026-01-01', null)).toBe(false);
  });
});
