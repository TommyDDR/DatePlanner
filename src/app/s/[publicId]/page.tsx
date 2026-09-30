import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { SITE_URL } from '@/config/identity';
import { CopyLink } from '@/components/copy-link';
import type { DayBadge } from '@/components/date-picker';
import { LivePoll } from '@/components/live-poll';
import { MarkSeen } from '@/components/mark-seen';
import { formatLongDay, todayInParis } from '@/lib/paris-day';
import { acceptsResponses } from '@/lib/poll-rules';
import { readDeviceTokenHash } from '@/server/auth/device';
import { getSessionUser } from '@/server/auth/session';
import { getOwnResponse, getPollByPublicId, getPollSynthesis, listResponsesForOwner } from '@/server/polls/read';
import { AvailabilityList } from './_sections/availability-list';
import { OwnerPanel } from './_sections/owner-panel';
import { ResponseForm } from './_sections/response-form';

type Params = Promise<{ publicId: string }>;
type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const poll = await getPollByPublicId((await params).publicId);
  // Hors index dans tous les cas (FR-037).
  return { title: poll ? poll.title : 'Introuvable', robots: { index: false, follow: false } };
}

export default async function PollPage({ params, searchParams }: { params: Params; searchParams: SearchParams }) {
  const [{ publicId }, query] = await Promise.all([params, searchParams]);
  const poll = await getPollByPublicId(publicId);
  if (!poll) notFound();

  const user = await getSessionUser();
  const isOwner = user?.id === poll.ownerId;
  const shareUrl = `${SITE_URL}/s/${poll.publicId}`;
  const today = todayInParis(new Date());

  // Connecté : la réponse du compte ; sans session : celle de l'appareil.
  const deviceTokenHash = user ? null : await readDeviceTokenHash();
  const [own, availability] = await Promise.all([
    getOwnResponse(poll.id, user ? { userId: user.id } : deviceTokenHash ? { deviceTokenHash } : null),
    getPollSynthesis(poll.id),
  ]);

  const badges: Record<string, DayBadge> = Object.fromEntries(
    availability.map(({ day, count, voters }) => [day, { count, voters }]),
  );
  const markedMonths = [...new Set(poll.days.map((day) => day.slice(0, 7)))];
  const created = isOwner && query.cree === '1';
  // Les réponses à modérer : lues pour le SEUL créateur, filtre dans la requête.
  const moderated = isOwner && user ? await listResponsesForOwner(user.id, poll.id) : [];
  // Le créateur et un répondant connecté retrouvent ce sondage dans « Mes sondages ».
  const listed = user !== null && (isOwner || own !== null);

  return (
    <article className="mx-auto flex max-w-4xl flex-col gap-8 px-4 py-10 sm:px-6 sm:py-14">
      <LivePoll publicId={poll.publicId} />
      {listed ? <MarkSeen publicId={poll.publicId} version={poll.activityAt.toISOString()} /> : null}

      {created ? (
        <section aria-labelledby="sondage-cree" className="surface-raised flex flex-col gap-4 p-5 sm:p-6">
          <h2 id="sondage-cree" className="text-lg font-semibold">
            Sondage créé : partagez-le
          </h2>
          <p className="text-sm text-[var(--color-text-muted)]">
            Envoyez ce lien à vos invités. Ils pourront répondre sans créer de compte.
          </p>
          <CopyLink url={shareUrl} />
        </section>
      ) : null}

      <header className="flex flex-col gap-3">
        <p className="label-tech">Sondage de dates</p>
        <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">{poll.title}</h1>
        {poll.description ? (
          <p className="max-w-2xl whitespace-pre-line text-[var(--color-text-muted)]">{poll.description}</p>
        ) : null}
      </header>

      {poll.status === 'CLOSED' ? (
        <section
          aria-label="Sondage clos"
          data-testid="bandeau-clos"
          className="flex flex-col gap-1 rounded-[var(--radius-card)] border border-[var(--color-rule-strong)] p-4 sm:flex-row sm:items-center sm:gap-4"
        >
          <p className="label-tech">Sondage clos</p>
          {poll.retainedDay ? (
            <p className="flex items-center gap-2">
              Date retenue :
              <span className="rounded-full bg-[var(--color-retained)] px-3 py-1 font-semibold text-[var(--color-on-retained)] first-letter:uppercase">
                {formatLongDay(poll.retainedDay)}
              </span>
            </p>
          ) : (
            <p className="text-[var(--color-text-muted)]">Le créateur a arrêté les réponses.</p>
          )}
        </section>
      ) : null}

      <section aria-labelledby="votre-reponse" className="surface flex flex-col gap-5 p-4 sm:p-6">
        <h2 id="votre-reponse" className="text-lg font-semibold">
          {own ? 'Votre réponse' : 'Répondre'}
        </h2>
        <ResponseForm
          publicId={poll.publicId}
          pollDays={poll.days}
          today={today}
          accepting={acceptsResponses(poll.status, poll.days, today)}
          closed={poll.status === 'CLOSED'}
          requireAccount={poll.requireAccount}
          user={user ? { displayName: user.displayName } : null}
          existing={own}
          badges={badges}
          markedMonths={markedMonths}
          retainedDay={poll.retainedDay}
        />
      </section>

      <section aria-labelledby="qui-est-disponible" className="flex flex-col gap-3">
        <h2 id="qui-est-disponible" className="text-lg font-semibold">
          Qui est disponible ?
        </h2>
        <AvailabilityList availability={availability} retainedDay={poll.retainedDay} />
      </section>

      {isOwner ? (
        <OwnerPanel
          publicId={poll.publicId}
          shareUrl={shareUrl}
          title={poll.title}
          description={poll.description}
          status={poll.status}
          retainedDay={poll.retainedDay}
          days={poll.days}
          badges={badges}
          responses={moderated.map(({ id, name, account }) => ({ id, name, account }))}
          requireAccount={poll.requireAccount}
          notifyOwner={poll.notifyOwner}
          today={today}
          showShare={!created}
        />
      ) : null}
    </article>
  );
}
