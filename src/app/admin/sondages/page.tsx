import Link from 'next/link';
import { notFound } from 'next/navigation';
import { RetainedDays } from '@/components/retained-days';
import { ADMIN_LISTS } from '@/config/limits';
import {
  isFiltered,
  parsePollListQuery,
  PERIOD_FIELD_LABELS,
  PERIOD_FIELDS,
  POLL_SORT_LABELS,
  POLL_SORTS,
  POLL_STATE_LABELS,
  POLL_STATES,
  pollListHref,
  POLLS_PATH,
  SORT_ORDER_LABELS,
  SORT_ORDERS,
  type PollListQuery,
} from '@/lib/admin-query';
import { dateFromDay, type Day } from '@/lib/paris-day';
import { plural } from '@/lib/text';
import { getAdminUser } from '@/server/admin/access';
import { listPolls, type AdminPollRow } from '@/server/admin/polls';
import { AdminHeading } from '../_parts/admin-heading';
import { Pagination } from '../_parts/pagination';

export const metadata = { title: 'Tous les sondages' };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

const DATE = new Intl.DateTimeFormat('fr-FR', { dateStyle: 'medium', timeZone: 'Europe/Paris' });
/** Un jour proposé n'a pas d'heure : il se lit en UTC, comme sa colonne. */
const DAY = new Intl.DateTimeFormat('fr-FR', { dateStyle: 'medium', timeZone: 'UTC' });

const formatDay = (day: Day) => DAY.format(dateFromDay(day));

/**
 * Tous les sondages du service (FR-048), par pages : triés et filtrés par
 * l'adresse, pour qu'une liste se recharge et se parcoure sans JavaScript.
 * Introuvable pour qui n'est pas administrateur.
 */
export default async function AdminPollsPage({ searchParams }: { searchParams: SearchParams }) {
  const admin = await getAdminUser();
  if (!admin) notFound();
  const query = parsePollListQuery(await searchParams);
  const list = await listPolls(admin, query);

  return (
    <section className="mx-auto flex max-w-5xl flex-col gap-8 px-4 py-10 sm:px-6 sm:py-14">
      <AdminHeading current="sondages" title="Tous les sondages" />
      <PollFilters query={query} />

      <p className="text-sm text-[var(--color-text-muted)]">
        {plural(list.total, 'sondage')}
        {isFiltered(query) ? (list.total > 1 ? ' correspondent aux filtres' : ' correspond aux filtres') : ''}
      </p>

      {list.rows.length === 0 ? (
        <p className="surface p-6 text-[var(--color-text-muted)]">
          {isFiltered(query) ? 'Aucun sondage ne correspond à ces filtres.' : 'Aucun sondage pour l’instant.'}
        </p>
      ) : (
        <ul className="flex flex-col gap-3" data-testid="admin-sondages">
          {list.rows.map((poll) => (
            <PollItem key={poll.publicId} poll={poll} />
          ))}
        </ul>
      )}

      <Pagination page={list.page} pageCount={list.pageCount} hrefFor={(page) => pollListHref({ ...query, page })} />
    </section>
  );
}

/** Les filtres et le tri : un formulaire `GET`, que la page relit à l'arrivée. */
function PollFilters({ query }: { query: PollListQuery }) {
  return (
    <form method="get" action={POLLS_PATH} role="search" aria-label="Filtrer et trier les sondages" className="surface flex flex-col gap-4 p-4 sm:p-5">
      <Field id="q" label="Titre, nom ou adresse du créateur">
        <input id="q" name="q" type="search" defaultValue={query.q} maxLength={ADMIN_LISTS.searchMax} className="field" />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Field id="etat" label="État">
          <Select id="etat" value={query.etat} options={POLL_STATES} labels={POLL_STATE_LABELS} />
        </Field>
        <Field id="periode" label="Période portant sur">
          <Select id="periode" value={query.periode} options={PERIOD_FIELDS} labels={PERIOD_FIELD_LABELS} />
        </Field>
        <Field id="du" label="Du">
          <input id="du" name="du" type="date" defaultValue={query.du ?? ''} className="field" />
        </Field>
        <Field id="au" label="Au">
          <input id="au" name="au" type="date" defaultValue={query.au ?? ''} className="field" />
        </Field>
        <Field id="tri" label="Trier par">
          <Select id="tri" value={query.tri} options={POLL_SORTS} labels={POLL_SORT_LABELS} />
        </Field>
        <Field id="sens" label="Ordre">
          <Select id="sens" value={query.sens} options={SORT_ORDERS} labels={SORT_ORDER_LABELS} />
        </Field>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <button type="submit" className="btn-ghost">
          Appliquer
        </button>
        <Link href={POLLS_PATH} className="text-sm underline-offset-4 hover:underline">
          Réinitialiser
        </Link>
      </div>
    </form>
  );
}

function Field({ id, label, children }: { id: string; label: string; children: React.ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-medium">
        {label}
      </label>
      {children}
    </div>
  );
}

function Select<T extends string>({
  id,
  value,
  options,
  labels,
}: {
  id: string;
  value: T;
  options: readonly T[];
  labels: Record<T, string>;
}) {
  return (
    <select id={id} name={id} defaultValue={value} className="field">
      {options.map((option) => (
        <option key={option} value={option}>
          {labels[option]}
        </option>
      ))}
    </select>
  );
}

function daysSummary(poll: AdminPollRow): string {
  if (poll.firstDay === null || poll.lastDay === null) return 'aucun jour proposé';
  if (poll.dayCount === 1) return `1 jour, le ${formatDay(poll.firstDay)}`;
  return `${plural(poll.dayCount, 'jour')} du ${formatDay(poll.firstDay)} au ${formatDay(poll.lastDay)}`;
}

function PollItem({ poll }: { poll: AdminPollRow }) {
  return (
    <li className="surface flex flex-col gap-2 p-4 sm:p-5">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <Link
          href={`/s/${poll.publicId}`}
          className="font-semibold underline-offset-4 [overflow-wrap:anywhere] hover:underline"
        >
          {poll.title}
        </Link>
        <span className="flex flex-wrap items-center gap-2 text-sm">
          {poll.status === 'OPEN' ? (
            <span className="label-tech !text-[var(--color-ember)]">Ouvert</span>
          ) : (
            <span className="label-tech">Clos</span>
          )}
          <RetainedDays days={poll.retainedDays} />
        </span>
      </div>
      <p className="text-sm [overflow-wrap:anywhere]">
        Par {poll.owner.displayName} · {poll.owner.email}
      </p>
      <p className="text-sm text-[var(--color-text-muted)]">
        Créé le {DATE.format(poll.createdAt)}
        {poll.closedAt ? ` · clos le ${DATE.format(poll.closedAt)}` : ''} · dernière activité le{' '}
        {DATE.format(poll.activityAt)}
      </p>
      <p className="text-sm text-[var(--color-text-muted)]">
        {plural(poll.respondents, 'répondant')} · {daysSummary(poll)}
      </p>
    </li>
  );
}
