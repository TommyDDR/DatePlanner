import Link from 'next/link';
import { redirect } from 'next/navigation';
import { formatLongDay } from '@/lib/paris-day';
import { plural } from '@/lib/text';
import { getSessionUser } from '@/server/auth/session';
import { listOwnerPolls } from '@/server/polls/read';

export const metadata = { title: 'Mes sondages' };

const CREATED = new Intl.DateTimeFormat('fr-FR', { dateStyle: 'medium', timeZone: 'Europe/Paris' });

/** Les sondages du compte, les plus récents d'abord (FR-024). */
export default async function MyPollsPage() {
  const user = await getSessionUser();
  if (!user) redirect(`/connexion?suite=${encodeURIComponent('/mes-sondages')}`);
  const polls = await listOwnerPolls(user.id);

  return (
    <section className="mx-auto flex max-w-4xl flex-col gap-8 px-4 py-10 sm:px-6 sm:py-14">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="label-tech">Espace de {user.displayName}</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">Mes sondages</h1>
        </div>
        <Link href="/nouveau" className="btn-ember">
          Nouveau sondage
        </Link>
      </div>

      {polls.length === 0 ? (
        <div className="surface flex flex-col items-start gap-3 p-6">
          <p>Vous n’avez pas encore créé de sondage.</p>
          <Link href="/nouveau" className="font-medium text-[var(--color-ember)] underline-offset-4 hover:underline">
            Créer mon premier sondage
          </Link>
        </div>
      ) : (
        <ul className="flex flex-col gap-3" data-testid="mes-sondages">
          {polls.map((poll) => (
            <li key={poll.publicId}>
              <Link
                href={`/s/${poll.publicId}`}
                className="surface flex flex-col gap-2 p-4 transition-colors hover:border-[var(--color-ember)] sm:flex-row sm:items-center sm:justify-between sm:p-5"
              >
                <span className="flex flex-col gap-1">
                  <span className="font-semibold">{poll.title}</span>
                  <span className="text-sm text-[var(--color-text-muted)]">
                    Créé le {CREATED.format(poll.createdAt)} · {plural(poll.respondents, 'répondant')}
                  </span>
                </span>
                <span className="flex flex-wrap items-center gap-2 text-sm">
                  {poll.status === 'OPEN' ? (
                    <span className="label-tech !text-[var(--color-ember)]">Ouvert</span>
                  ) : (
                    <span className="label-tech">Clos</span>
                  )}
                  {poll.retainedDay ? (
                    <span className="rounded-full bg-[var(--color-retained)] px-2.5 py-0.5 text-[var(--color-on-retained)] first-letter:uppercase">
                      {formatLongDay(poll.retainedDay)}
                    </span>
                  ) : null}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
