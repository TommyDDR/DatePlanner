import Link from 'next/link';
import { redirect } from 'next/navigation';
import { LiveMyPolls } from '@/components/live-my-polls';
import { formatLongDay } from '@/lib/paris-day';
import { plural } from '@/lib/text';
import { getSessionUser } from '@/server/auth/session';
import { listOwnerPolls, listRespondedPolls, type MyPollRow } from '@/server/polls/read';

export const metadata = { title: 'Mes sondages' };

const CREATED = new Intl.DateTimeFormat('fr-FR', { dateStyle: 'medium', timeZone: 'Europe/Paris' });

/** Les dates retenues nommées sur une ligne ; au-delà, leur nombre. */
const RETAINED_SHOWN = 3;

/**
 * Les sondages du compte (FR-024) : ceux qu'il a créés, les plus récents
 * d'abord, puis ceux d'autres comptes auxquels il a répondu. Un sondage qui a
 * changé depuis sa dernière visite porte une bordure orangée à gauche (FR-044),
 * tenue à jour en direct.
 */
export default async function MyPollsPage() {
  const user = await getSessionUser();
  if (!user) redirect(`/connexion?suite=${encodeURIComponent('/mes-sondages')}`);
  const [created, responded] = await Promise.all([listOwnerPolls(user.id), listRespondedPolls(user.id)]);

  return (
    <section className="mx-auto flex max-w-4xl flex-col gap-10 px-4 py-10 sm:px-6 sm:py-14">
      <LiveMyPolls key={[...created, ...responded].map((poll) => poll.publicId).join(' ')} />
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="label-tech">Espace de {user.displayName}</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">Mes sondages</h1>
        </div>
        <Link href="/nouveau" className="btn-ember">
          Nouveau sondage
        </Link>
      </div>

      <section aria-labelledby="sondages-crees" className="flex flex-col gap-4">
        <h2 id="sondages-crees" className="text-lg font-semibold">
          Créés par moi
        </h2>
        {created.length === 0 ? (
          <div className="surface flex flex-col items-start gap-3 p-6">
            <p>Vous n’avez pas encore créé de sondage.</p>
            <Link href="/nouveau" className="font-medium text-[var(--color-ember)] underline underline-offset-4">
              Créer mon premier sondage
            </Link>
          </div>
        ) : (
          <ul className="flex flex-col gap-3" data-testid="mes-sondages">
            {created.map((poll) => (
              <PollItem key={poll.publicId} poll={poll} detail={`Créé le ${CREATED.format(poll.createdAt)}`} />
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="sondages-repondus" className="flex flex-col gap-4">
        <h2 id="sondages-repondus" className="text-lg font-semibold">
          Auxquels j’ai répondu
        </h2>
        {responded.length === 0 ? (
          <p className="surface p-6 text-[var(--color-text-muted)]">
            Les sondages auxquels vous répondez connecté à ce compte apparaîtront ici.
          </p>
        ) : (
          <ul className="flex flex-col gap-3" data-testid="sondages-repondus">
            {responded.map((poll) => (
              <PollItem
                key={poll.publicId}
                poll={poll}
                detail={`Créé par ${poll.ownerName} le ${CREATED.format(poll.createdAt)}`}
              />
            ))}
          </ul>
        )}
      </section>
    </section>
  );
}

/**
 * Du nouveau : bordure gauche orangée, et les mots pour les lecteurs d'écran.
 * La bordure élargie mange le retrait : le texte reste aligné d'une ligne à
 * l'autre.
 */
const NEWS = 'border-l-4 border-l-[var(--color-ember)] pl-[calc(1rem-3px)] sm:pl-[calc(1.25rem-3px)]';

function PollItem({ poll, detail }: { poll: MyPollRow; detail: string }) {
  return (
    <li>
      <Link
        href={`/s/${poll.publicId}`}
        data-news={poll.news ? '' : undefined}
        className={`surface flex flex-col gap-2 p-4 transition-colors hover:border-[var(--color-ember)] sm:flex-row sm:items-center sm:justify-between sm:p-5 ${poll.news ? NEWS : ''}`}
      >
        <span className="flex flex-col gap-1">
          <span className="font-semibold">
            {poll.title}
            {poll.news ? <span className="sr-only"> - du nouveau</span> : null}
          </span>
          <span className="text-sm text-[var(--color-text-muted)]">
            {detail} · {plural(poll.respondents, 'répondant')}
          </span>
        </span>
        <span className="flex flex-wrap items-center gap-2 text-sm">
          {poll.status === 'OPEN' ? (
            <span className="label-tech !text-[var(--color-ember)]">Ouvert</span>
          ) : (
            <span className="label-tech">Clos</span>
          )}
          {poll.retainedDays.slice(0, RETAINED_SHOWN).map((day) => (
            <span
              key={day}
              className="rounded-full bg-[var(--color-retained)] px-2.5 py-0.5 text-[var(--color-on-retained)] first-letter:uppercase"
            >
              {formatLongDay(day)}
            </span>
          ))}
          {poll.retainedDays.length > RETAINED_SHOWN ? (
            <span className="text-[var(--color-text-muted)]">
              et {plural(poll.retainedDays.length - RETAINED_SHOWN, 'autre date', 'autres dates')}
            </span>
          ) : null}
        </span>
      </Link>
    </li>
  );
}
