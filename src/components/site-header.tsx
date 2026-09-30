import Link from 'next/link';
import { IDENTITY } from '@/config/identity';
import { getSessionUser } from '@/server/auth/session';
import { BrandMark } from './brand-mark';

/**
 * En-tête du site : la marque, et ce que la session permet.
 *
 * Connecté : « Mes sondages », « Nouveau sondage » et le compte. Sans session :
 * « Connexion ». La bascule de thème s'y ajoute (`ThemeToggle`).
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
              <Link href="/nouveau" className="rounded-full px-3 py-2 hover:bg-[var(--color-ink-soft)]">
                Nouveau sondage
              </Link>
              <Link
                href="/compte"
                className="max-w-[10rem] truncate rounded-full px-3 py-2 hover:bg-[var(--color-ink-soft)]"
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
        </nav>
      </div>
    </header>
  );
}
