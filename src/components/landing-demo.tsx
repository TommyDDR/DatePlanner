/**
 * La démonstration de l'accueil (FR-032, research.md R13) : un sondage de
 * dates qui se remplit, en SVG et CSS, sans bibliothèque ni script.
 *
 * La grille d'un mois se trace comme un trait de découpe - la tête du laser
 * court sur le bord -, les jours proposés s'allument, les pastilles de votes
 * apparaissent et l'une d'elles compte jusqu'à passer en tête - elle se dore -,
 * puis la date retenue s'illumine en jade. Rendue au serveur, décorative
 * (`aria-hidden`) : ce qu'elle montre est dit en toutes lettres dans la
 * légende voisine.
 */

const COLS = 7;
const ROWS = 5;
const CELL_W = 54;
const CELL_H = 46;
const LEFT = 16;
const TOP = 70;
const WIDTH = COLS * CELL_W;
const HEIGHT = ROWS * CELL_H;

/** Octobre 2026 commence un jeudi : colonne 3 (lundi = 0). */
const FIRST_COLUMN = 3;
const DAYS_IN_MONTH = 31;

type Cell = { day: number; col: number; row: number };

function cellOf(day: number): Cell {
  const index = FIRST_COLUMN + day - 1;
  return { day, col: index % COLS, row: Math.floor(index / COLS) };
}

/** Les jours proposés, leurs votes, et le moment où ils s'allument. */
const PROPOSED: Array<{ day: number; votes: number; delay: number }> = [
  { day: 9, votes: 2, delay: 1.5 },
  { day: 10, votes: 4, delay: 1.62 },
  { day: 16, votes: 5, delay: 1.74 },
  { day: 17, votes: 3, delay: 1.86 },
  { day: 23, votes: 1, delay: 1.98 },
];

/** Le jour retenu : celui qui a le plus de votes, et qui compte 4 puis 5. */
const RETAINED = 16;

const WEEKDAYS = ['L', 'M', 'M', 'J', 'V', 'S', 'D'];

function x(col: number) {
  return LEFT + col * CELL_W;
}
function y(row: number) {
  return TOP + row * CELL_H;
}

export function LandingDemo() {
  const lines: Array<{ x1: number; y1: number; x2: number; y2: number }> = [];
  for (let row = 0; row <= ROWS; row++) lines.push({ x1: LEFT, y1: y(row), x2: LEFT + WIDTH, y2: y(row) });
  for (let col = 0; col <= COLS; col++) lines.push({ x1: x(col), y1: TOP, x2: x(col), y2: TOP + HEIGHT });

  return (
    <figure className="flex flex-col gap-3">
      <div
        data-testid="demonstration"
        className="surface-raised relative overflow-hidden p-3 shadow-[0_24px_80px_-32px_color-mix(in_oklab,var(--color-ember)_45%,transparent)]"
      >
        <svg
          viewBox={`0 0 ${LEFT * 2 + WIDTH} ${TOP + HEIGHT + 16}`}
          className="h-auto w-full"
          aria-hidden="true"
          focusable="false"
        >
          <defs>
            <clipPath id="demo-trace-clip">
              <rect className="demo-trace" x={LEFT - 2} y={0} width={WIDTH + 4} height={TOP + HEIGHT + 16} />
            </clipPath>
            <filter id="demo-glow" x="-50%" y="-50%" width="200%" height="200%">
              <feGaussianBlur stdDeviation="4" />
            </filter>
          </defs>

          {/* En-tête : le mois et les jours de la semaine. */}
          <text x={LEFT} y={28} fill="var(--color-text)" fontSize="18" fontWeight="600">
            Octobre 2026
          </text>
          <text x={LEFT + WIDTH} y={28} textAnchor="end" fill="var(--color-text-faint)" fontSize="11" fontFamily="var(--font-mono)">
            SONDAGE · DÎNER DE RENTRÉE
          </text>
          {WEEKDAYS.map((letter, col) => (
            <text
              key={col}
              x={x(col) + CELL_W / 2}
              y={TOP - 12}
              textAnchor="middle"
              fill="var(--color-text-faint)"
              fontSize="11"
              fontFamily="var(--font-mono)"
            >
              {letter}
            </text>
          ))}

          {/* La grille, révélée comme un trait de découpe. */}
          <g clipPath="url(#demo-trace-clip)">
            {lines.map((line, index) => (
              <line key={index} {...line} stroke="var(--color-rule-strong)" strokeWidth="1" />
            ))}
            {Array.from({ length: DAYS_IN_MONTH }, (_, i) => {
              const { col, row } = cellOf(i + 1);
              return (
                <text
                  key={i}
                  x={x(col) + 8}
                  y={y(row) + 17}
                  fill="var(--color-text-muted)"
                  fontSize="12"
                  fontFamily="var(--font-mono)"
                >
                  {i + 1}
                </text>
              );
            })}
          </g>

          {/* La tête du laser court le long du bord pendant le tracé. */}
          <g className="demo-head" style={{ '--run': `${WIDTH}px` } as React.CSSProperties}>
            <circle cx={LEFT} cy={TOP} r="9" fill="var(--color-incandescent-halo)" filter="url(#demo-glow)" />
            <circle cx={LEFT} cy={TOP} r="3.2" fill="var(--color-incandescent)" />
          </g>

          {/* Les jours proposés s'allument, puis leurs pastilles apparaissent. */}
          {PROPOSED.map(({ day, votes, delay }) => {
            const { col, row } = cellOf(day);
            const cx = x(col);
            const cy = y(row);
            return (
              <g key={day}>
                <rect
                  className="demo-fade"
                  style={{ '--delay': `${delay}s` } as React.CSSProperties}
                  x={cx + 3}
                  y={cy + 3}
                  width={CELL_W - 6}
                  height={CELL_H - 6}
                  rx="8"
                  fill="color-mix(in oklab, var(--color-ember) 16%, transparent)"
                  stroke="var(--color-ember)"
                  strokeWidth="1.5"
                />
                <Badge
                  cx={cx + CELL_W - 10}
                  cy={cy + 10}
                  count={day === RETAINED ? votes - 1 : votes}
                  delay={delay + 0.9 + (day % 3) * 0.25}
                  replacedAt={day === RETAINED ? 3.3 : undefined}
                />
                {day === RETAINED ? (
                  <Badge cx={cx + CELL_W - 10} cy={cy + 10} count={votes} delay={3.3} tone="leading" />
                ) : null}
              </g>
            );
          })}

          {/* La date retenue, en jade. */}
          {(() => {
            const { col, row } = cellOf(RETAINED);
            return (
              <g data-testid="demo-date-retenue" className="demo-fade" style={{ '--delay': '3.9s' } as React.CSSProperties}>
                <rect
                  x={x(col) + 3}
                  y={y(row) + 3}
                  width={CELL_W - 6}
                  height={CELL_H - 6}
                  rx="8"
                  fill="var(--color-retained)"
                />
                <text
                  x={x(col) + 8}
                  y={y(row) + 17}
                  fill="var(--color-on-retained)"
                  fontSize="12"
                  fontWeight="700"
                  fontFamily="var(--font-mono)"
                >
                  {RETAINED}
                </text>
                <Badge cx={x(col) + CELL_W - 10} cy={y(row) + 10} count={5} delay={0} tone="leading" />
              </g>
            );
          })()}
        </svg>
      </div>
      <figcaption className="text-sm text-[var(--color-text-muted)]">
        Chaque réponse allume sa pastille chez tout le monde, en direct. La date retenue ressort en jade.
      </figcaption>
    </figure>
  );
}

function Badge({
  cx,
  cy,
  count,
  delay,
  replacedAt,
  tone = 'vote',
}: {
  cx: number;
  cy: number;
  count: number;
  delay: number;
  /** Instant où une pastille plus à jour la remplace : elle s'efface alors. */
  replacedAt?: number;
  /** `leading` : la pastille dorée du jour le plus voté, comme dans le calendrier. */
  tone?: 'vote' | 'leading';
}) {
  const pop = (
    <g className="demo-pop" style={{ '--delay': `${delay}s` } as React.CSSProperties}>
      <circle
        cx={cx}
        cy={cy}
        r="9"
        fill={tone === 'leading' ? 'var(--color-leading)' : 'var(--color-vote)'}
        stroke="var(--color-ink-raised)"
        strokeWidth="2"
      />
      <text
        x={cx}
        y={cy + 3.6}
        textAnchor="middle"
        fontSize="10"
        fontWeight="700"
        fontFamily="var(--font-mono)"
        fill={tone === 'leading' ? 'var(--color-on-leading)' : 'var(--color-on-vote)'}
      >
        {count}
      </text>
    </g>
  );
  if (replacedAt === undefined) return pop;
  return (
    <g className="demo-out" style={{ '--delay': `${replacedAt}s` } as React.CSSProperties}>
      {pop}
    </g>
  );
}
