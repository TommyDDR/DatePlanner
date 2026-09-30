import { redirect } from 'next/navigation';
import { todayInParis } from '@/lib/paris-day';
import { getSessionUser } from '@/server/auth/session';
import { PollForm } from './poll-form';

export const metadata = { title: 'Nouveau sondage' };

export default async function NewPollPage() {
  if (!(await getSessionUser())) redirect(`/connexion?suite=${encodeURIComponent('/nouveau')}`);

  return (
    <section className="mx-auto max-w-3xl px-4 py-10 sm:px-6 sm:py-14">
      <p className="label-tech">Nouveau sondage</p>
      <h1 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">Quelle date arrange tout le monde ?</h1>
      <p className="mt-3 text-[var(--color-text-muted)]">
        Donnez un titre, proposez des jours, puis partagez le lien : chacun cochera ses disponibilités.
      </p>
      <div className="mt-10">
        <PollForm today={todayInParis(new Date())} />
      </div>
    </section>
  );
}
