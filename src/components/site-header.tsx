import Link from 'next/link';
import { IDENTITY } from '@/config/identity';
import { getSessionUser } from '@/server/auth/session';
import { AdminMenu } from './admin-menu';
import { BrandMark } from './brand-mark';
import { MobileMenu } from './mobile-menu';

/**
 * En-tête du site : la marque, et ce que la session permet.
 *
 * Connecté : « Mes sondages », « Nouveau sondage », le menu « Administration »
 * pour un administrateur (`AdminMenu`, décision 042) et le compte ; sur
 * téléphone, ils passent dans un menu (`MobileMenu`, décision 035). Sans
 * session : « Connexion ». La bascule de thème s'y ajoute (`ThemeToggle`) et
 * reste dans le bandeau à toutes les largeurs.
 */
export async function SiteHeader({ themeToggle }: { themeToggle?: React.ReactNode }) {
  const user = await getSessionUser();

  return (
    <header className="sticky top-0 z-40 border-b border-[var(--color-rule)] bg-[color-mix(in_oklab,var(--color-ink)_86%,transparent)] backdrop-blur">
      <div className="mx-auto flex h-[var(--header-height)] max-w-6xl items-center gap-4 px-4 sm:px-6">
        <Link href="/" className="flex items-center gap-2.5 font-semibold tracking-tight">
          <BrandMark />
          <span>{IDENTITY.name}</span>
        </Link>
        <nav aria-label="Navigation principale" className="ml-auto flex items-center gap-1 text-sm sm:gap-2">
          {user ? (
            <>
              <Link href="/mes-sondages" className="hidden rounded-full px-3 py-2 hover:bg-[var(--color-ink-soft)] sm:inline-flex">
                Mes sondages
              </Link>
              <Link href="/nouveau" className="hidden rounded-full px-3 py-2 hover:bg-[var(--color-ink-soft)] sm:inline-flex">
                Nouveau sondage
              </Link>
              {user.isAdmin && <AdminMenu className="hidden sm:block" />}
              <Link
                href="/compte"
                className="hidden max-w-[10rem] truncate rounded-full px-3 py-2 hover:bg-[var(--color-ink-soft)] sm:inline-block"
                aria-label={`Mon compte (${user.displayName})`}
              >
                {user.displayName}
              </Link>
            </>
          ) : (
            <Link href="/connexion" className="rounded-full px-3 py-2 hover:bg-[var(--color-ink-soft)]">
              Connexion
            </Link>
          )}
          {themeToggle}
          {user && <MobileMenu displayName={user.displayName} isAdmin={user.isAdmin} className="sm:hidden" />}
        </nav>
      </div>
    </header>
  );
}
