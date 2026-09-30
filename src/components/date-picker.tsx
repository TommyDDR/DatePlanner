'use client';

import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react';
import {
  calendarWeeks,
  compareMonths,
  EMPTY_RANGE,
  cycleDay,
  cycleGroup,
  cycleRange,
  daysBetween,
  daysMarked,
  firstDayOf,
  initialMonth,
  inMonth,
  isMonthSelectable,
  isSelectable,
  isYearSelectable,
  keyTarget,
  lastDayOf,
  monthOf,
  monthRange,
  rangeClick,
  rangeShown,
  shiftMonth,
  weekdayColumn,
  yearPage,
  yearRange,
  type Day,
  type DayRange,
  type DayRules,
  type Marks,
  type Month,
} from '@/lib/date-picker';
import { voteCountLabel, votersSummary, type Voter } from '@/lib/availability';

/** Ce que porte un jour voté : son nombre de votes et ses votants (FR-020, FR-021). */
export type DayBadge = { count: number; voters: readonly Voter[] };

/**
 * Le calendrier du site : un jour, ou des jours MARQUÉS.
 *
 * Le champ `type="date"` du navigateur ne se met pas aux couleurs du site,
 * ne sait pas montrer les jours qu'on propose, et ne choisit qu'un jour à la
 * fois. Celui-ci se peint avec les jetons du thème - il suit donc le clair et
 * le sombre sans rien déclarer -, et ce qu'il décide vit dans
 * `lib/date-picker.ts`, hors du navigateur.
 *
 * En choix SIMPLE, un clic prend le jour. En choix MULTIPLE, chaque jour
 * parcourt un CYCLE d'états - neutre, puis chacun des `states`, puis neutre :
 * un seul état pour une sélection ordinaire, deux pour l'atelier (proposé,
 * interdit). Un clic avance le jour ; un glissé avance toute la plage depuis
 * l'état du premier jour ; un clic sur l'initiale d'un jour de la semaine ou
 * sur un numéro de semaine avance la colonne - telle qu'elle est affichée,
 * mois voisins compris - ou la rangée, depuis l'état le plus avancé qui s'y
 * trouve. L'aperçu du glissé se peint pendant le geste, et rien n'est
 * appliqué avant que le doigt ne se lève.
 *
 * Les jours `disabled` se voient barrés et ne se marquent jamais - ni au
 * clic, ni dans une plage, ni par un groupe. C'est un reflet : le serveur
 * refait le contrôle, un champ caché retouché ne choisit rien.
 *
 * Un jour mis en évidence (`highlighted`) qui passe au PREMIER état se peint
 * en jade : c'est le jour où les deux parties se rejoignent - le jour proposé
 * par l'atelier que le client choisit, le jour demandé par le client que
 * l'atelier propose. Il se lit d'un coup d'œil, avant de lire le bouton qui
 * dit « Confirmer ». `matchLabel` le nomme, dans la légende et pour le
 * lecteur d'écran.
 *
 * Un jour choisi HORS de ceux qui sont mis en évidence garde l'aplat
 * incandescent, et `chosenLabel` le nomme dans la légende : sans lui, le
 * choix simple peindrait une case dont rien ne dit ce qu'elle veut dire,
 * alors que les jours proposés, le jour où l'on se rejoint et les jours
 * interdits ont chacun leur ligne.
 *
 * En choix de PLAGE, le premier clic pose le début, le second la fin, et
 * les jours survolés entre les deux montrent ce que le second clic prendrait ;
 * un glissé d'un jour à l'autre pose la plage d'un seul geste.
 * « Tout le mois » et « Toute l'année » prennent un bloc d'un geste, ramené
 * aux bornes permises.
 *
 * Le titre se CLIQUE : « Septembre 2026 » ouvre la vue des douze mois de
 * l'année, et l'année celle de douze années. Choisir redescend d'un cran,
 * jusqu'aux jours ; Échap aussi. Aller chercher un jour de l'an dernier ne se
 * fait plus à coups de « mois précédent ».
 *
 * `today` est donné par le serveur, en jour parisien : calculé ici, il
 * divergerait à l'hydratation autour de minuit.
 */

const WEEKDAYS = [
  { short: 'L', long: 'lundis' },
  { short: 'M', long: 'mardis' },
  { short: 'M', long: 'mercredis' },
  { short: 'J', long: 'jeudis' },
  { short: 'V', long: 'vendredis' },
  { short: 'S', long: 'samedis' },
  { short: 'D', long: 'dimanches' },
] as const;

const MONTH_TITLE = new Intl.DateTimeFormat('fr-FR', { month: 'long', year: 'numeric', timeZone: 'UTC' });
const MONTH_NAME = new Intl.DateTimeFormat('fr-FR', { month: 'long', timeZone: 'UTC' });
const SHORT_DAY = new Intl.DateTimeFormat('fr-FR', {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
  timeZone: 'UTC',
});
const DAY_LABEL = new Intl.DateTimeFormat('fr-FR', {
  weekday: 'long',
  day: 'numeric',
  month: 'long',
  year: 'numeric',
  timeZone: 'UTC',
});

export function formatPickerDay(day: Day): string {
  return DAY_LABEL.format(new Date(`${day}T12:00:00Z`));
}

function shortDay(day: Day): string {
  return SHORT_DAY.format(new Date(`${day}T12:00:00Z`));
}

function monthName(month: number): string {
  const name = MONTH_NAME.format(new Date(Date.UTC(2000, month - 1, 1, 12)));
  return name.charAt(0).toUpperCase() + name.slice(1);
}

function monthTitle(month: Month): string {
  const title = MONTH_TITLE.format(new Date(Date.UTC(month.year, month.month - 1, 1, 12)));
  return title.charAt(0).toUpperCase() + title.slice(1);
}

/** Un état du cycle : comment il se dit, se peint, et sous quel nom il part avec le formulaire. */
export type MarkState = {
  /** Au singulier, pour un jour : « proposé ». */
  label: string;
  /** Au pluriel, pour le décompte : « proposés ». */
  plural: string;
  /** `fill` : l'aplat incandescent ; `blocked` : le hachuré rouille d'un jour fermé. */
  tone: 'fill' | 'blocked';
  /** Nom des champs cachés, un par jour dans cet état. */
  name?: string;
};

const DEFAULT_STATES: readonly MarkState[] = [{ label: 'choisi', plural: 'choisis', tone: 'fill' }];

type View = 'days' | 'months' | 'years';

export type DatePickerProps = {
  mode: 'single' | 'multiple' | 'range';
  /** Jour parisien du serveur. */
  today: Day;
  /** Les états du cycle, dans l'ordre où un clic les parcourt. Choix multiple seulement. */
  states?: readonly MarkState[];
  /** Nom des champs cachés du premier état, quand `states` ne le donne pas. */
  name?: string;
  /** Marques contrôlées : jour vers rang de son état (1 = premier état). */
  value?: Marks;
  defaultValue?: Marks;
  onChange?: (marks: Marks) => void;
  /** Choix de plage : la plage contrôlée. */
  range?: DayRange;
  defaultRange?: DayRange;
  onRangeChange?: (range: DayRange) => void;
  /** Choix de plage : le nom des deux champs cachés, posés une fois la plage fermée. */
  rangeNames?: { start: string; end: string };
  min?: Day | null;
  max?: Day | null;
  /** Jours montrés et interdits. */
  disabled?: readonly Day[];
  /** Jours mis en évidence - un repère visuel, rien de plus. */
  highlighted?: readonly Day[];
  /**
   * Ce que désigne le jour marqué au premier état quand il n'est pas un jour
   * mis en évidence, pour la légende : en choix simple, l'aplat incandescent
   * n'a sinon aucun nom. Sans lui, rien n'est écrit.
   */
  chosenLabel?: string;
  /** Ce que désignent les jours mis en évidence, pour la légende. */
  highlightLabel?: string;
  /** Ce que désigne un jour mis en évidence ET marqué au premier état : le jour où l'on se rejoint. */
  matchLabel?: string;
  /** Ce que désignent les jours interdits, pour la légende. */
  disabledLabel?: string;
  /** Le nom de la grille pour un lecteur d'écran. */
  label: string;
  /**
   * L'`id` du calendrier, pour qu'un lien y pose le focus (`NextStepLink`) :
   * il va au jour tabulable, que le clavier déplace.
   */
  id?: string;
  /**
   * Pastilles de votes : pour chaque jour voté, le nombre de votes et les
   * votants, montrés dans une infobulle au survol et au focus clavier.
   */
  badges?: Readonly<Record<Day, DayBadge>>;
  /** La date retenue d'un sondage clos : un aplat jade. */
  retainedDay?: Day | null;
  /**
   * Consultation : aucun jour ne se choisit - ni clic, ni glissé, ni groupe -,
   * mais la navigation, le clavier et les infobulles restent.
   */
  readOnly?: boolean;
  /**
   * Mois (`AAAA-MM`) qui portent des jours à voir : signalés au-dessus de la
   * grille, et joignables d'un clic, quand il y en a plusieurs.
   */
  markedMonths?: readonly string[];
  /** Le jour sur lequel s'ouvre le calendrier, quand ni un choix ni `highlighted` ne le disent. */
  initialDay?: Day | null;
};

const EMPTY: Marks = {};

export function DatePicker({
  mode,
  today,
  states: givenStates,
  name,
  value,
  defaultValue,
  onChange,
  range,
  defaultRange,
  onRangeChange,
  rangeNames,
  min = null,
  max = null,
  disabled = [],
  highlighted = [],
  chosenLabel,
  highlightLabel,
  matchLabel,
  disabledLabel,
  label,
  id,
  badges,
  retainedDay = null,
  readOnly = false,
  markedMonths = [],
  initialDay = null,
}: DatePickerProps) {
  const multiple = mode === 'multiple';
  /** Les en-têtes de colonne et de semaine ne font avancer un groupe que si l'on peut choisir. */
  const groupable = multiple && !readOnly;
  const tooltipBase = `${id ?? label.replace(/\W+/g, '-')}-votants`;
  const isRange = mode === 'range';
  const states = multiple ? (givenStates ?? DEFAULT_STATES) : DEFAULT_STATES;
  const count = states.length;
  const [inner, setInner] = useState<Marks>(() => defaultValue ?? EMPTY);
  const [innerRange, setInnerRange] = useState<DayRange>(() => defaultRange ?? EMPTY_RANGE);
  const currentRange = range ?? innerRange;
  const [hover, setHover] = useState<Day | null>(null);
  const [drag, setDrag] = useState<{ anchor: Day; over: Day } | null>(null);
  // Un glissé en cours peint la plage qu'il poserait au relâcher ; sinon la
  // plage choisie, ouverte jusqu'au jour survolé.
  const painted = !isRange
    ? null
    : drag && drag.anchor !== drag.over
      ? rangeShown({ start: drag.anchor, end: null }, drag.over)
      : rangeShown(currentRange, hover);
  // En plage, les deux bouts se peignent comme un jour choisi ; l'entre-deux
  // a sa propre teinte (`between`).
  const paintedStart = painted?.start;
  const paintedEnd = painted?.end;
  const rangeMarks = useMemo<Marks>(
    () => (paintedStart && paintedEnd ? { [paintedStart]: 1, [paintedEnd]: 1 } : EMPTY),
    [paintedStart, paintedEnd],
  );
  const marks: Marks = isRange ? rangeMarks : (value ?? inner);
  const disabledSet = useMemo(() => new Set(disabled), [disabled]);
  const highlightedSet = useMemo(() => new Set(highlighted), [highlighted]);
  const rules: DayRules = useMemo(() => ({ min, max, disabled: disabledSet }), [min, max, disabledSet]);

  const [month, setMonth] = useState<Month>(() =>
    initialDay && Object.keys(marks).length === 0
      ? monthOf(initialDay)
      : initialMonth({ selected: Object.keys(marks), highlighted, min, today }),
  );
  const [focusDay, setFocusDay] = useState<Day>(
    () =>
      Object.keys(marks).sort()[0] ?? initialDay ?? highlighted[0] ?? (min && min > today ? min : today),
  );
  const [view, setView] = useState<View>('days');
  const keyboardMove = useRef(false);
  const viewMove = useRef(false);
  const pointerHandled = useRef(false);
  const gridRef = useRef<HTMLDivElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);

  const weeks = useMemo(() => calendarWeeks(month), [month]);
  const minMonth = min ? monthOf(min) : null;
  const maxMonth = max ? monthOf(max) : null;
  const years = yearPage(month.year);
  const canPrevious =
    view === 'days'
      ? !minMonth || compareMonths(month, minMonth) > 0
      : isYearSelectable((view === 'months' ? month.year : years[0]!) - 1, min, max);
  const canNext =
    view === 'days'
      ? !maxMonth || compareMonths(month, maxMonth) < 0
      : isYearSelectable((view === 'months' ? month.year : years[11]!) + 1, min, max);

  // Le jour qui porte le focus doit être dans la grille : un changement de
  // mois par les flèches du titre le ramène au premier du mois.
  const visibleFocus = weeks.some((week) => week.days.includes(focusDay))
    ? focusDay
    : weeks.flatMap((week) => week.days).find((day) => inMonth(day, month))!;

  useEffect(() => {
    if (!keyboardMove.current) return;
    keyboardMove.current = false;
    gridRef.current?.querySelector<HTMLButtonElement>(`[data-day="${focusDay}"]`)?.focus();
  }, [focusDay, month]);

  // Changer de vue emporte le focus : sur le mois ou l'année affichés, ou
  // sur le jour tabulable en revenant aux jours.
  useEffect(() => {
    if (!viewMove.current) return;
    viewMove.current = false;
    const selector = view === 'days' ? '[data-day][tabindex="0"]' : '[data-view-current]';
    rootRef.current?.querySelector<HTMLButtonElement>(selector)?.focus();
  }, [view, month]);

  function commit(next: Marks) {
    if (value === undefined) setInner(next);
    onChange?.(next);
  }

  function commitRange(next: DayRange) {
    if (range === undefined) setInnerRange(next);
    onRangeChange?.(next);
  }

  function choose(day: Day) {
    if (readOnly || !isSelectable(day, rules)) return;
    if (isRange) {
      commitRange(rangeClick(currentRange, day, rules));
      setHover(null);
      return;
    }
    commit(multiple ? cycleDay(marks, day, count, rules) : { [day]: 1 });
  }

  /** « Tout le mois », « Toute l'année » : la plage d'un geste, puis retour aux jours. */
  function chooseBlock(block: DayRange | null) {
    if (!block?.start) return;
    commitRange(block);
    setHover(null);
    setFocusDay(block.start);
    if (view !== 'days') switchView('days', monthOf(block.start));
  }

  function switchView(next: View, at?: Month) {
    viewMove.current = true;
    if (at) setMonth(at);
    setView(next);
  }

  function onRootKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key !== 'Escape' || view === 'days') return;
    // Échap remonte d'un cran et s'arrête là : sur la fiche, il ramènerait
    // sinon à la liste.
    event.preventDefault();
    event.stopPropagation();
    switchView(view === 'years' ? 'months' : 'days');
  }

  // Pendant un glissé, la grille montre ce que le geste APPLIQUERAIT.
  const shown = useMemo(
    () => (drag && !isRange ? cycleRange(marks, drag.anchor, drag.over, count, rules) : marks),
    [drag, isRange, marks, count, rules],
  );
  // En plage, l'entre-deux teinté dit déjà ce que le glissé prend.
  const inDrag = useMemo(
    () =>
      drag && !isRange && drag.anchor !== drag.over ? new Set(daysBetween(drag.anchor, drag.over)) : null,
    [drag, isRange],
  );

  function dayAt(x: number, y: number): Day | null {
    const element = document.elementFromPoint(x, y);
    const cell = element instanceof Element ? element.closest<HTMLElement>('[data-day]') : null;
    return cell && gridRef.current?.contains(cell) ? (cell.dataset.day ?? null) : null;
  }

  function onPointerDown(event: PointerEvent<HTMLDivElement>) {
    if (readOnly || !(multiple || isRange) || event.button !== 0) return;
    const day = dayAt(event.clientX, event.clientY);
    if (!day || (isRange && !isSelectable(day, rules))) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    setDrag({ anchor: day, over: day });
    setFocusDay(day);
  }

  function onPointerMove(event: PointerEvent<HTMLDivElement>) {
    const day = dayAt(event.clientX, event.clientY);
    if (isRange) {
      // Une plage ne s'étend pas sur un jour qu'on ne peut pas choisir.
      if (!day || !isSelectable(day, rules)) return;
      if (drag) {
        if (day !== drag.over) setDrag({ ...drag, over: day });
      } else if (currentRange.start !== null && currentRange.end === null && day !== hover) {
        setHover(day);
      }
      return;
    }
    if (!drag) return;
    if (day && day !== drag.over) setDrag({ ...drag, over: day });
  }

  function onPointerUp() {
    if (!drag) return;
    // Le pointeur est capturé par la grille : le clic qui suit tombe sur
    // elle, ou sur le bouton selon le navigateur. Le drapeau ne vit que le
    // temps de ce clic éventuel.
    pointerHandled.current = true;
    window.setTimeout(() => {
      pointerHandled.current = false;
    }, 0);
    if (drag.anchor === drag.over) choose(drag.anchor);
    else if (isRange) {
      // Glisser d'un jour à l'autre pose la plage d'un geste, sans passer
      // par le premier clic.
      const dragged = rangeShown({ start: drag.anchor, end: null }, drag.over)!;
      commitRange({ start: dragged.start, end: dragged.end });
      setHover(null);
    } else commit(cycleRange(marks, drag.anchor, drag.over, count, rules));
    setDrag(null);
  }

  function onDayClick(day: Day) {
    // Le geste au pointeur a déjà été appliqué au relâcher ; le clic qui le
    // suit ne doit pas le défaire. Clavier et lecteur d'écran n'ont que lui.
    if (pointerHandled.current) {
      pointerHandled.current = false;
      return;
    }
    choose(day);
    setFocusDay(day);
  }

  function onKeyDown(event: KeyboardEvent<HTMLButtonElement>, day: Day) {
    const target = keyTarget(day, event.key, event.shiftKey);
    if (target === null) return;
    event.preventDefault();
    keyboardMove.current = true;
    setFocusDay(target);
    if (isRange && currentRange.start !== null && currentRange.end === null) setHover(target);
    if (!inMonth(target, month)) setMonth(monthOf(target));
  }

  /** Les flèches du titre : un mois, une année ou douze années, selon la vue. */
  function goMonth(step: number) {
    const months = view === 'days' ? step : view === 'months' ? step * 12 : step * 144;
    setMonth((current) => shiftMonth(current, months));
  }

  const counts = states.map((_, index) => daysMarked(marks, index + 1).length);
  const total = counts.reduce((sum, n) => sum + n, 0);
  const chosen = daysMarked(marks, 1)[0];
  const anyMatched = highlighted.some((day) => shown[day] === 1);

  return (
    <div
      id={id}
      ref={rootRef}
      onKeyDown={onRootKeyDown}
      className="date-picker select-none rounded-[12px] border border-[var(--color-rule)] bg-[var(--color-ink-soft)] p-3"
    >
      <div className="flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={() => goMonth(-1)}
          disabled={!canPrevious}
          aria-label={NAV_LABELS[view].previous}
          className={NAV_BUTTON}
        >
          <Chevron direction="left" />
        </button>
        <div aria-live="polite">
          {view === 'years' ? (
            <p className="px-3 py-1.5 text-sm font-semibold tracking-tight tabular-nums">
              {years[0]} - {years[11]}
            </p>
          ) : (
            <button
              type="button"
              onClick={() => switchView(view === 'days' ? 'months' : 'years')}
              aria-label={
                view === 'days'
                  ? `${monthTitle(month)}, choisir un autre mois`
                  : `${month.year}, choisir une autre année`
              }
              className="group inline-flex items-center gap-1 rounded-full px-3 py-1.5 text-sm font-semibold tracking-tight tabular-nums transition-colors hover:bg-[var(--color-ink-raised)] hover:text-[var(--color-ember)]"
            >
              {view === 'days' ? monthTitle(month) : month.year}
              <Caret />
            </button>
          )}
        </div>
        <button
          type="button"
          onClick={() => goMonth(1)}
          disabled={!canNext}
          aria-label={NAV_LABELS[view].next}
          className={NAV_BUTTON}
        >
          <Chevron direction="right" />
        </button>
      </div>

      {markedMonths.length > 1 && view === 'days' ? (
        <nav aria-label="Mois concernés" className="mt-2 flex flex-wrap items-center gap-1.5">
          {markedMonths.map((key) => {
            const target: Month = { year: Number(key.slice(0, 4)), month: Number(key.slice(5, 7)) };
            const current = compareMonths(target, month) === 0;
            return (
              <button
                key={key}
                type="button"
                onClick={() => setMonth(target)}
                aria-current={current ? 'true' : undefined}
                data-marked-month={key}
                className={`rounded-full px-2.5 py-1 text-xs capitalize transition-colors ${
                  current
                    ? 'bg-[var(--color-ember)] text-[var(--color-on-ember)]'
                    : 'border border-[var(--color-rule-strong)] text-[var(--color-text-muted)] hover:border-[var(--color-ember)] hover:text-[var(--color-ember)]'
                }`}
              >
                {monthTitle(target)}
              </button>
            );
          })}
        </nav>
      ) : null}

      {view === 'months' ? (
        <div role="group" aria-label={`Mois de ${month.year}`} className={BLOCK_GRID}>
          {Array.from({ length: 12 }, (_, index) => {
            const target: Month = { year: month.year, month: index + 1 };
            const first = firstDayOf(target);
            const last = lastDayOf(target);
            return (
              <BlockButton
                key={index}
                label={monthName(index + 1)}
                ariaLabel={`${monthName(index + 1)} ${target.year}`}
                current={index + 1 === month.month}
                containsToday={inMonth(today, target)}
                inRange={Boolean(painted && painted.start <= last && painted.end >= first)}
                enabled={isMonthSelectable(target, min, max)}
                onClick={() => switchView('days', target)}
              />
            );
          })}
        </div>
      ) : null}

      {view === 'years' ? (
        <div role="group" aria-label={`Années ${years[0]} à ${years[11]}`} className={BLOCK_GRID}>
          {years.map((year) => (
            <BlockButton
              key={year}
              label={String(year)}
              ariaLabel={String(year)}
              current={year === month.year}
              containsToday={today.startsWith(`${year}-`)}
              inRange={Boolean(painted && painted.start <= `${year}-12-31` && painted.end >= `${year}-01-01`)}
              enabled={isYearSelectable(year, min, max)}
              onClick={() => switchView('months', { year, month: month.month })}
            />
          ))}
        </div>
      ) : null}

      {view === 'days' ? (
      <div
        ref={gridRef}
        role="grid"
        aria-label={`${label}, ${monthTitle(month)}`}
        aria-multiselectable={groupable || undefined}
        aria-readonly={readOnly || undefined}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={() => setDrag(null)}
        onPointerLeave={isRange ? () => setHover(null) : undefined}
        className={`mt-2 grid grid-cols-[1.75rem_repeat(7,minmax(0,1fr))] gap-y-1 ${groupable || isRange ? 'touch-none' : ''}`}
      >
        <div role="row" className="contents">
          <span role="columnheader" className="label-tech grid place-items-center !text-[0.6rem]">
            <span aria-hidden="true">S</span>
            <span className="sr-only">Semaine</span>
          </span>
          {WEEKDAYS.map((weekday, index) =>
            groupable ? (
              <span key={index} role="columnheader" className="grid place-items-center">
                <button
                  type="button"
                  onClick={() => commit(cycleGroup(marks, weekdayColumn(month, index), count, rules))}
                  aria-label={`Faire avancer tous les ${weekday.long} affichés`}
                  title={`Tous les ${weekday.long} affichés`}
                  className="grid size-8 place-items-center rounded-full font-mono text-[0.7rem] uppercase text-[var(--color-text-muted)] transition-colors hover:bg-[var(--color-ink-raised)] hover:text-[var(--color-ember)]"
                >
                  {weekday.short}
                </button>
              </span>
            ) : (
              <span
                key={index}
                role="columnheader"
                aria-label={weekday.long}
                className="grid h-8 place-items-center font-mono text-[0.7rem] uppercase text-[var(--color-text-faint)]"
              >
                {weekday.short}
              </span>
            ),
          )}
        </div>

        {weeks.map((week) => (
          <div key={week.days[0]} role="row" className="contents">
            <span role="rowheader" className="grid place-items-center">
              {groupable ? (
                <button
                  type="button"
                  onClick={() => commit(cycleGroup(marks, week.days, count, rules))}
                  aria-label={`Faire avancer la semaine ${week.week}`}
                  title={`Toute la semaine ${week.week}`}
                  className="grid h-8 w-7 place-items-center rounded-full font-mono text-[0.6rem] text-[var(--color-text-faint)] transition-colors hover:bg-[var(--color-ink-raised)] hover:text-[var(--color-ember)]"
                >
                  {week.week}
                </button>
              ) : (
                <span className="font-mono text-[0.6rem] text-[var(--color-text-faint)]">{week.week}</span>
              )}
            </span>
            {week.days.map((day, column) => {
              const selectable = isSelectable(day, rules);
              const forbidden = disabledSet.has(day);
              const rank = shown[day] ?? 0;
              const state = rank > 0 ? states[rank - 1]! : null;
              const isHighlighted = highlightedSet.has(day);
              const matched = isHighlighted && rank === 1 && state?.tone === 'fill';
              const previewed = Boolean(inDrag?.has(day) && selectable);
              const between = Boolean(painted && day > painted.start && day < painted.end);
              const retained = day === retainedDay;
              const badge = badges?.[day];
              const tooltipId = badge ? `${tooltipBase}-${day}` : undefined;
              const labelParts = [
                formatPickerDay(day),
                painted ? rangeLabel(day, painted) : null,
                state && multiple && !matched ? state.label : null,
                matched && matchLabel ? matchLabel : isHighlighted && highlightLabel ? highlightLabel : null,
                forbidden && disabledLabel ? disabledLabel : null,
                retained ? 'date retenue' : null,
                badge ? voteCountLabel(badge.count) : null,
              ].filter(Boolean);
              return (
                <span
                  key={day}
                  role="gridcell"
                  aria-selected={rank > 0 || between}
                  className="group relative grid place-items-center p-px"
                >
                  <button
                    type="button"
                    data-day={day}
                    data-mark={state ? state.tone : undefined}
                    data-match={matched ? '' : undefined}
                    data-retained={retained ? '' : undefined}
                    data-votes={badge ? badge.count : undefined}
                    tabIndex={day === visibleFocus ? 0 : -1}
                    aria-disabled={(!selectable && !readOnly) || undefined}
                    aria-label={labelParts.join(' - ')}
                    aria-describedby={tooltipId}
                    aria-current={day === today ? 'date' : undefined}
                    onClick={() => onDayClick(day)}
                    onKeyDown={(event) => onKeyDown(event, day)}
                    className={dayClass({
                      selectable,
                      forbidden,
                      tone: state?.tone ?? null,
                      isHighlighted,
                      matched,
                      outside: !inMonth(day, month),
                      today: day === today,
                      previewed,
                      between,
                      retained,
                      readOnly,
                    })}
                  >
                    <span
                      className={
                        forbidden || state?.tone === 'blocked'
                          ? 'line-through decoration-[var(--color-rust)] decoration-2'
                          : ''
                      }
                    >
                      {Number(day.slice(8, 10))}
                    </span>
                    {isHighlighted ? (
                      <span
                        aria-hidden="true"
                        className={`absolute bottom-1 left-1/2 size-1 -translate-x-1/2 rounded-full ${
                          matched
                            ? 'bg-[var(--color-on-jade)]'
                            : state?.tone === 'fill'
                              ? 'bg-[var(--color-on-ember)]'
                              : 'bg-[var(--color-ember)]'
                        }`}
                      />
                    ) : null}
                    {badge ? (
                      <span
                        key={badge.count}
                        aria-hidden="true"
                        className="badge-pop absolute -right-1 -top-1 grid h-[1.15rem] min-w-[1.15rem] place-items-center rounded-full bg-[var(--color-vote)] px-1 font-mono text-[0.65rem] font-semibold text-[var(--color-on-vote)] ring-2 ring-[var(--color-ink-soft)]"
                      >
                        {badge.count}
                      </span>
                    ) : null}
                  </button>
                  {badge ? <VotersTooltip id={tooltipId!} day={day} badge={badge} column={column} /> : null}
                </span>
              );
            })}
          </div>
        ))}
      </div>
      ) : null}

      {isRange && rangeNames && currentRange.start && currentRange.end ? (
        <>
          <input type="hidden" name={rangeNames.start} value={currentRange.start} />
          <input type="hidden" name={rangeNames.end} value={currentRange.end} />
        </>
      ) : null}

      {!isRange && !readOnly && states.map((state, index) => {
        const field = state.name ?? (index === 0 ? name : undefined);
        if (!field) return null;
        return daysMarked(marks, index + 1).map((day) => (
          <input key={`${field}-${day}`} type="hidden" name={field} value={day} />
        ));
      })}

      <div className="mt-3 flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-t border-[var(--color-rule)] pt-3">
        <div className="flex flex-wrap gap-x-4 gap-y-1">
          {multiple && count > 1
            ? states.map((state) => (
                <span key={state.label} className="label-tech inline-flex items-center gap-1.5">
                  <Swatch tone={state.tone} />
                  {state.label}
                </span>
              ))
            : null}
          {chosenLabel && !multiple && chosen !== undefined && !anyMatched ? (
            <span className="label-tech inline-flex items-center gap-1.5">
              <Swatch tone="fill" />
              {chosenLabel}
            </span>
          ) : null}
          {highlightLabel && highlighted.length > 0 ? (
            <span className="label-tech inline-flex items-center gap-1.5">
              <span aria-hidden="true" className="size-3 rounded-[4px] border-[1.5px] border-[var(--color-ember)]" />
              {highlightLabel}
            </span>
          ) : null}
          {matchLabel && anyMatched ? (
            <span className="label-tech inline-flex items-center gap-1.5">
              <span aria-hidden="true" className="size-3 rounded-[4px] bg-[var(--color-jade)]" />
              {matchLabel}
            </span>
          ) : null}
          {disabledLabel && disabled.length > 0 ? (
            <span className="label-tech inline-flex items-center gap-1.5">
              <span aria-hidden="true" className="text-[var(--color-rust)] line-through decoration-2">
                00
              </span>
              {disabledLabel}
            </span>
          ) : null}
        </div>
        {isRange ? (
          <RangeFooter
            range={currentRange}
            action={
              view === 'days'
                ? { label: 'Tout le mois', block: monthRange(month, rules) }
                : view === 'months'
                  ? { label: `Toute l’année ${month.year}`, block: yearRange(month.year, rules) }
                  : null
            }
            onBlock={chooseBlock}
            onClear={() => {
              commitRange(EMPTY_RANGE);
              setHover(null);
            }}
          />
        ) : readOnly ? (
          badges ? (
            <span className="label-tech inline-flex items-center gap-1.5">
              <span aria-hidden="true" className="grid size-4 place-items-center rounded-full bg-[var(--color-vote)] font-mono text-[0.6rem] text-[var(--color-on-vote)]">
                n
              </span>
              votes du jour
            </span>
          ) : null
        ) : (
        <p aria-live="polite" className="text-xs text-[var(--color-text-muted)]">
          {multiple ? (
            total === 0 ? (
              'Aucun jour marqué'
            ) : (
              <>
                {states
                  .map((state, index) => {
                    const n = counts[index]!;
                    return n > 0 ? `${n} jour${n > 1 ? 's' : ''} ${n > 1 ? state.plural : state.label}` : null;
                  })
                  .filter(Boolean)
                  .join(' · ')}
                {' · '}
                <button
                  type="button"
                  onClick={() => commit(EMPTY)}
                  className="text-[var(--color-ember)] underline-offset-2 hover:underline"
                >
                  Tout effacer
                </button>
              </>
            )
          ) : chosen ? (
            <>
              Choisi : <span className="font-medium text-[var(--color-text)]">{formatPickerDay(chosen)}</span>
            </>
          ) : (
            'Aucun jour choisi'
          )}
        </p>
        )}
      </div>
    </div>
  );
}

const NAV_BUTTON =
  'grid size-9 place-items-center rounded-full text-[var(--color-text-muted)] transition-colors hover:bg-[var(--color-ink-raised)] hover:text-[var(--color-ember)] disabled:pointer-events-none disabled:opacity-30';

const NAV_LABELS: Record<View, { previous: string; next: string }> = {
  days: { previous: 'Mois précédent', next: 'Mois suivant' },
  months: { previous: 'Année précédente', next: 'Année suivante' },
  years: { previous: 'Années précédentes', next: 'Années suivantes' },
};

/**
 * La grille des mois et celle des années : quatre rangées de trois, à peu
 * près la hauteur des six semaines qu'elles remplacent - le calendrier ne
 * saute pas quand on change de vue.
 */
const BLOCK_GRID = 'mt-2 grid min-h-[17rem] grid-cols-3 grid-rows-4 gap-1.5';

/** L'entre-deux d'une plage : l'incandescent, à peine posé. */
const RANGE_TINT = 'bg-[color-mix(in_oklab,var(--color-ember)_16%,transparent)]';

function rangeLabel(day: Day, painted: { start: Day; end: Day }): string | null {
  if (day === painted.start && day === painted.end) return 'période d’un jour';
  if (day === painted.start) return 'début de la période';
  if (day === painted.end) return 'fin de la période';
  return day > painted.start && day < painted.end ? 'dans la période' : null;
}

function BlockButton({
  label,
  ariaLabel,
  current,
  containsToday,
  inRange,
  enabled,
  onClick,
}: {
  label: string;
  ariaLabel: string;
  /** Le mois ou l'année affichés : c'est là que le focus arrive. */
  current: boolean;
  containsToday: boolean;
  inRange: boolean;
  enabled: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!enabled}
      aria-label={ariaLabel}
      aria-current={current ? 'true' : undefined}
      data-view-current={current ? '' : undefined}
      className={[
        'rounded-[10px] text-sm tabular-nums outline-none transition-[background-color,color,box-shadow] duration-150 motion-reduce:transition-none focus-visible:ring-2 focus-visible:ring-[var(--color-ember)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--color-ink-soft)] disabled:cursor-not-allowed disabled:opacity-35',
        current
          ? 'font-semibold text-[var(--color-ember)] shadow-[inset_0_0_0_1.5px_var(--color-ember)]'
          : 'cursor-pointer text-[var(--color-text)] enabled:hover:bg-[var(--color-ink-raised)] enabled:hover:text-[var(--color-ember)]',
        inRange ? RANGE_TINT : '',
        containsToday ? 'underline decoration-[var(--color-ember)] decoration-2 underline-offset-4' : '',
      ].join(' ')}
    >
      {label}
    </button>
  );
}

function RangeFooter({
  range,
  action,
  onBlock,
  onClear,
}: {
  range: DayRange;
  action: { label: string; block: DayRange | null } | null;
  onBlock: (block: DayRange | null) => void;
  onClear: () => void;
}) {
  const strong = (day: Day) => <span className="font-medium text-[var(--color-text)]">{shortDay(day)}</span>;
  return (
    <>
      <p aria-live="polite" className="text-xs text-[var(--color-text-muted)]">
        {range.start === null ? (
          'Aucune période choisie'
        ) : range.end === null ? (
          <>Du {strong(range.start)} : choisissez le dernier jour</>
        ) : range.start === range.end ? (
          <>Le {strong(range.start)}</>
        ) : (
          <>
            Du {strong(range.start)} au {strong(range.end)}
          </>
        )}
      </p>
      <p className="flex gap-3 text-xs">
        {action ? (
          <button
            type="button"
            onClick={() => onBlock(action.block)}
            disabled={!action.block}
            className="text-[var(--color-ember)] underline-offset-2 hover:underline disabled:opacity-40"
          >
            {action.label}
          </button>
        ) : null}
        {range.start !== null ? (
          <button
            type="button"
            onClick={onClear}
            className="text-[var(--color-text-muted)] underline-offset-2 hover:text-[var(--color-ember)] hover:underline"
          >
            Effacer
          </button>
        ) : null}
      </p>
    </>
  );
}

const BLOCKED_HATCH =
  'bg-[repeating-linear-gradient(135deg,transparent_0_5px,color-mix(in_oklab,var(--color-rust)_30%,transparent)_5px_7px)]';

function Swatch({ tone }: { tone: MarkState['tone'] }) {
  return (
    <span
      aria-hidden="true"
      className={`size-3 rounded-[4px] ${
        tone === 'fill' ? 'bg-[var(--color-ember)]' : `border-[1.5px] border-[var(--color-rust)] ${BLOCKED_HATCH}`
      }`}
    />
  );
}

function dayClass(state: {
  selectable: boolean;
  forbidden: boolean;
  tone: MarkState['tone'] | null;
  isHighlighted: boolean;
  /** Mis en évidence ET au premier état : le jour où l'on se rejoint, en jade. */
  matched: boolean;
  outside: boolean;
  today: boolean;
  previewed: boolean;
  /** Entre les deux bouts d'une plage. */
  between?: boolean;
  /** La date retenue d'un sondage clos : l'aplat jade, quoi qu'il arrive. */
  retained?: boolean;
  /** Consultation : ni curseur de choix, ni survol de choix. */
  readOnly?: boolean;
}): string {
  const parts = [
    'relative grid aspect-square w-full max-w-11 place-items-center rounded-[10px] text-sm tabular-nums outline-none transition-[background-color,color,box-shadow] duration-150 motion-reduce:transition-none focus-visible:ring-2 focus-visible:ring-[var(--color-ember)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--color-ink-soft)]',
  ];

  if (state.retained) {
    parts.push(
      `${state.readOnly ? 'cursor-default' : 'cursor-pointer'} bg-[var(--color-retained)] font-semibold text-[var(--color-on-retained)] shadow-[0_0_14px_-4px_var(--color-jade)]`,
    );
    if (state.today) parts.push('underline decoration-2 underline-offset-4');
    return parts.join(' ');
  }

  if (state.readOnly) {
    parts.push('cursor-default text-[var(--color-text)]');
    if (state.outside) parts.push('opacity-45');
    if (state.isHighlighted) parts.push('shadow-[inset_0_0_0_1.5px_var(--color-ember)] font-medium');
    else if (!state.outside) parts.push('text-[var(--color-text-muted)]');
    if (state.today) parts.push('underline decoration-[var(--color-ember)] decoration-2 underline-offset-4');
    return parts.join(' ');
  }

  if (!state.selectable) {
    parts.push('cursor-not-allowed text-[var(--color-text-faint)]');
    if (!state.forbidden) parts.push('opacity-50');
  } else if (state.matched) {
    parts.push(
      'cursor-pointer bg-[var(--color-jade)] font-semibold text-[var(--color-on-jade)] shadow-[0_0_14px_-4px_var(--color-jade)]',
    );
  } else if (state.tone === 'fill') {
    parts.push(
      'cursor-pointer bg-[var(--color-ember)] font-semibold text-[var(--color-on-ember)] shadow-[0_0_14px_-4px_var(--color-incandescent-halo)]',
    );
  } else if (state.tone === 'blocked') {
    parts.push(
      `cursor-pointer font-semibold text-[var(--color-rust)] shadow-[inset_0_0_0_1.5px_var(--color-rust)] ${BLOCKED_HATCH}`,
    );
  } else {
    parts.push(
      'cursor-pointer text-[var(--color-text)] hover:bg-[var(--color-ink-raised)] hover:text-[var(--color-ember)]',
    );
  }

  if (state.between && state.tone === null && state.selectable) parts.push(RANGE_TINT);
  if (state.outside && state.tone === null && !state.between) parts.push('opacity-45');
  if (state.isHighlighted && state.tone === null && state.selectable) {
    parts.push('shadow-[inset_0_0_0_1.5px_var(--color-ember)] font-medium');
  }
  if (state.today && state.tone === null) {
    parts.push('underline decoration-[var(--color-ember)] decoration-2 underline-offset-4');
  }
  if (state.previewed) parts.push('ring-1 ring-[var(--color-incandescent)]');
  return parts.join(' ');
}

/**
 * Les votants d'un jour, au survol et au focus clavier (FR-021).
 *
 * Toujours dans le document - le bouton du jour le désigne par
 * `aria-describedby`, un lecteur d'écran le lit donc sans survol -, et
 * affiché seulement au survol ou au focus : `display: none` au repos, pour
 * qu'une bulle cachée n'élargisse jamais la page sur un téléphone. Elle est
 * calée à gauche sur les premières colonnes et à droite sur les dernières,
 * pour ne pas déborder de l'écran.
 */
function VotersTooltip({ id, day, badge, column }: { id: string; day: Day; badge: DayBadge; column: number }) {
  const { shown, others } = votersSummary(badge.voters);
  const align = column <= 1 ? 'left-0' : column >= 5 ? 'right-0' : 'left-1/2 -translate-x-1/2';
  return (
    <div
      id={id}
      role="tooltip"
      className={`pointer-events-none absolute bottom-full z-30 mb-1.5 hidden w-max max-w-[15rem] rounded-[10px] border border-[var(--color-rule-strong)] bg-[var(--color-ink-raised)] p-3 text-left text-xs shadow-[0_12px_32px_-12px_rgb(0_0_0/0.45)] group-focus-within:block group-hover:block ${align}`}
    >
      <p className="mb-1.5 font-semibold text-[var(--color-text)]">
        {shortDay(day)} · {voteCountLabel(badge.count)}
      </p>
      <ul className="flex flex-col gap-0.5 text-[var(--color-text-muted)]">
        {shown.map((voter, index) => (
          <li key={`${voter.name}-${index}`} className="flex items-center gap-1.5">
            <span className="truncate">{voter.name}</span>
            {voter.account ? (
              <span className="label-tech !text-[0.55rem] !tracking-[0.08em] text-[var(--color-jade)]">compte</span>
            ) : null}
          </li>
        ))}
      </ul>
      {others > 0 ? (
        <p className="mt-1 text-[var(--color-text-faint)]">
          et {others} autre{others > 1 ? 's' : ''}
        </p>
      ) : null}
    </div>
  );
}

function Caret() {
  return (
    <svg
      viewBox="0 0 16 16"
      aria-hidden="true"
      className="size-3 text-[var(--color-text-faint)] transition-colors group-hover:text-[var(--color-ember)]"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
    >
      <path d="M4 6l4 4 4-4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function Chevron({ direction }: { direction: 'left' | 'right' }) {
  return (
    <svg viewBox="0 0 16 16" aria-hidden="true" className="size-4" fill="none" stroke="currentColor" strokeWidth="1.6">
      <path d={direction === 'left' ? 'M10 3 5 8l5 5' : 'M6 3l5 5-5 5'} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
