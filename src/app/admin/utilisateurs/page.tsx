import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ADMIN_LISTS } from '@/config/limits';
import {
  parseUserListQuery,
  POLL_LIST_DEFAULTS,
  pollListHref,
  userListHref,
  USERS_PATH,
} from '@/lib/admin-query';
import { plural } from '@/lib/text';
import { getAdminUser } from '@/server/admin/access';
import { listUsers, type AdminUserRow } from '@/server/admin/users';
import { AdminHeading } from '../_parts/admin-heading';
import { DeleteUserForm } from '../_parts/delete-user-form';
import { Pagination } from '../_parts/pagination';

export const metadata = { title: 'Utilisateurs' };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

const DATE = new Intl.DateTimeFormat('fr-FR', { dateStyle: 'medium', timeZone: 'Europe/Paris' });

/**
 * Les comptes du service (FR-046) : les plus récents d'abord, par pages,
 * cherchés par nom ou adresse ; chacun se supprime avec tous ses sondages
 * (FR-047). Introuvable pour qui n'est pas administrateur.
 */
export default async function AdminUsersPage({ searchParams }: { searchParams: SearchParams }) {
  const admin = await getAdminUser();
  if (!admin) notFound();
  const params = await searchParams;
  const query = parseUserListQuery(params);
  const list = await listUsers(admin, query);

  return (
    <section className="mx-auto flex max-w-5xl flex-col gap-8 px-4 py-10 sm:px-6 sm:py-14">
      <AdminHeading current="utilisateurs" title="Utilisateurs" />

      {params.supprime === '1' ? (
        <p role="status" className="surface px-4 py-3 text-sm text-[var(--color-jade)]">
          Compte supprimé, avec ses sondages et ses réponses.
        </p>
      ) : null}

      <form method="get" action={USERS_PATH} role="search" className="flex flex-wrap items-end gap-3">
        <div className="flex min-w-0 flex-1 basis-60 flex-col gap-1.5">
          <label htmlFor="q" className="text-sm font-medium">
            Nom ou adresse email
          </label>
          <input id="q" name="q" type="search" defaultValue={query.q} maxLength={ADMIN_LISTS.searchMax} className="field" />
        </div>
        <button type="submit" className="btn-ghost">
          Rechercher
        </button>
        {query.q !== '' ? (
          <Link href={USERS_PATH} className="py-3 text-sm underline-offset-4 hover:underline">
            Tout afficher
          </Link>
        ) : null}
      </form>

      <p className="text-sm text-[var(--color-text-muted)]">
        {plural(list.total, 'compte')}
        {query.q !== '' ? ` pour « ${query.q} »` : ''}
      </p>

      {list.rows.length === 0 ? (
        <p className="surface p-6 text-[var(--color-text-muted)]">Aucun compte ne correspond à cette recherche.</p>
      ) : (
        <ul className="flex flex-col gap-3" data-testid="admin-utilisateurs">
          {list.rows.map((user) => (
            <UserItem key={user.id} user={user} q={query.q} page={list.page} />
          ))}
        </ul>
      )}

      <Pagination page={list.page} pageCount={list.pageCount} hrefFor={(page) => userListHref({ ...query, page })} />
    </section>
  );
}

function signInMethods(user: AdminUserRow): string {
  const methods = [user.hasPassword ? 'mot de passe' : null, user.hasGoogle ? 'Google' : null].filter(Boolean);
  return methods.length === 0 ? 'Aucune méthode de connexion' : `Connexion par ${methods.join(' et ')}`;
}

function UserItem({ user, q, page }: { user: AdminUserRow; q: string; page: number }) {
  return (
    <li className="surface flex flex-col gap-3 p-4 sm:flex-row sm:items-start sm:justify-between sm:p-5">
      <div className="flex min-w-0 flex-col gap-1">
        <p className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <span className="font-semibold">{user.displayName}</span>
          {user.isAdmin ? <span className="label-tech !text-[var(--color-ember)]">Administrateur</span> : null}
          {user.isSelf ? <span className="label-tech">Vous</span> : null}
        </p>
        <p className="text-sm [overflow-wrap:anywhere]">{user.email}</p>
        <p className="text-sm text-[var(--color-text-muted)]">
          {signInMethods(user)} · {user.emailProved ? 'adresse prouvée' : 'adresse non prouvée'}
        </p>
        <p className="text-sm text-[var(--color-text-muted)]">
          Créé le {DATE.format(user.createdAt)} · dernière activité le {DATE.format(user.lastActiveAt)} ·{' '}
          {user.polls > 0 ? (
            <Link
              href={pollListHref({ ...POLL_LIST_DEFAULTS, q: user.email })}
              className="text-[var(--color-text)] underline underline-offset-4"
            >
              {plural(user.polls, 'sondage')}
            </Link>
          ) : (
            'aucun sondage'
          )}{' '}
          · {plural(user.responses, 'réponse')}
        </p>
      </div>
      {user.isAdmin || user.isSelf ? null : (
        <DeleteUserForm userId={user.id} displayName={user.displayName} polls={user.polls} q={q} page={page} />
      )}
    </li>
  );
}
