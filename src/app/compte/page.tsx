import { redirect } from 'next/navigation';
import { logoutAction } from '../(auth)/actions';
import { getSessionUser } from '@/server/auth/session';
import { AccountForms } from './account-forms';

export const metadata = { title: 'Mon compte' };

/** Le compte : nom d'affichage, connexion, suppression (contracts/pages.md). */
export default async function AccountPage() {
  const user = await getSessionUser();
  if (!user) redirect(`/connexion?suite=${encodeURIComponent('/compte')}`);

  return (
    <section className="mx-auto flex max-w-2xl flex-col gap-8 px-4 py-10 sm:px-6 sm:py-14">
      <div>
        <p className="label-tech">Mon compte</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight">{user.displayName}</h1>
        <p className="mt-2 text-[var(--color-text-muted)]">
          {user.email} · {user.hasPassword ? 'connexion par mot de passe' : 'connexion par Google'}
        </p>
      </div>
      <AccountForms displayName={user.displayName} hasPassword={user.hasPassword} />
      <form action={logoutAction}>
        <button type="submit" className="btn-ghost">
          Se déconnecter
        </button>
      </form>
    </section>
  );
}
