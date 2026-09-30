import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { SITE_URL } from '@/config/identity';
import { CopyLink } from '@/components/copy-link';
import { formatLongDay } from '@/lib/paris-day';
import { getSessionUser } from '@/server/auth/session';
import { getPollByPublicId } from '@/server/polls/read';

type Params = Promise<{ publicId: string }>;
type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const poll = await getPollByPublicId((await params).publicId);
  // Hors index dans tous les cas (FR-037), comme le reste du site sauf l'accueil.
  return { title: poll ? poll.title : 'Introuvable', robots: { index: false, follow: false } };
}

/** Les jours regroupés par mois, pour une lecture de calendrier. */
function byMonth(days: readonly string[]): Array<{ month: string; days: string[] }> {
  const groups = new Map<string, string[]>();
  for (const day of days) {
    const key = day.slice(0, 7);
    groups.set(key, [...(groups.get(key) ?? []), day]);
  }
  const monthName = new Intl.DateTimeFormat('fr-FR', { month: 'long', year: 'numeric', timeZone: 'UTC' });
  return [...groups].map(([key, list]) => {
    const label = monthName.format(new Date(`${key}-01T00:00:00Z`));
    return { month: label.charAt(0).toUpperCase() + label.slice(1), days: list };
  });
}

export default async function PollPage({ params, searchParams }: { params: Params; searchParams: SearchParams }) {
  const [{ publicId }, query] = await Promise.all([params, searchParams]);
  const poll = await getPollByPublicId(publicId);
  if (!poll) notFound();

  const user = await getSessionUser();
  const isOwner = user?.id === poll.ownerId;
  const shareUrl = `${SITE_URL}/s/${poll.publicId}`;

  return (
    <article className="mx-auto flex max-w-4xl flex-col gap-8 px-4 py-10 sm:px-6 sm:py-14">
      {isOwner && query.cree === '1' ? (
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

      <section aria-labelledby="jours-proposes" className="flex flex-col gap-4">
        <h2 id="jours-proposes" className="text-lg font-semibold">
          Jours proposés
        </h2>
        <div className="grid gap-4 sm:grid-cols-2">
          {byMonth(poll.days).map((group) => (
            <div key={group.month} className="surface p-4">
              <p className="label-tech mb-2">{group.month}</p>
              <ul className="flex flex-col gap-1">
                {group.days.map((day) => (
                  <li key={day}>{formatLongDay(day)}</li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </section>
    </article>
  );
}
