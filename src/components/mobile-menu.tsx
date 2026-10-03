'use client';

import Link from 'next/link';
import { ADMIN_SCREENS } from '@/lib/admin-query';
import { useDetailsMenu } from './use-details-menu';

/**
 * Menu de l'en-tête sur téléphone : « Mes sondages », « Nouveau sondage », les
 * écrans de l'administration pour un administrateur (décision 042) et le
 * compte, derrière un bouton à trois traits (décision 035). Son comportement
 * est celui de `useDetailsMenu`.
 */
export function MobileMenu({
  displayName,
  isAdmin = false,
  className = '',
}: {
  displayName: string;
  isAdmin?: boolean;
  className?: string;
}) {
  const { menu, closeOnFollow } = useDetailsMenu();

  const item = 'flex min-h-11 items-center rounded-[10px] px-3 hover:bg-[var(--color-ink-soft)]';

  return (
    <details ref={menu} className={`group relative ${className}`}>
      <summary className="icon-btn h-11 w-11 cursor-pointer list-none rounded-[10px] text-[var(--color-text-muted)] transition-colors hover:text-[var(--color-text)] [&::-webkit-details-marker]:hidden">
        <span className="sr-only">Menu</span>
        <MenuIcon />
      </summary>
      <div className="surface-raised absolute right-0 top-full mt-2 flex w-60 max-w-[calc(100vw-2rem)] flex-col p-1.5 text-[0.9375rem] shadow-lg">
        <Link href="/mes-sondages" onClick={closeOnFollow} className={item}>
          Mes sondages
        </Link>
        <Link href="/nouveau" onClick={closeOnFollow} className={item}>
          Nouveau sondage
        </Link>
        {isAdmin ? (
          <>
            <div aria-hidden className="mx-3 my-1 border-t border-[var(--color-rule)]" />
            <p className="label-tech px-3 pb-1 pt-2">Administration</p>
            {ADMIN_SCREENS.map((screen) => (
              <Link key={screen.key} href={screen.href} onClick={closeOnFollow} className={item}>
                {screen.label}
              </Link>
            ))}
          </>
        ) : null}
        <div aria-hidden className="mx-3 my-1 border-t border-[var(--color-rule)]" />
        <Link href="/compte" onClick={closeOnFollow} className={item} aria-label={`Mon compte (${displayName})`}>
          <span className="truncate">{displayName}</span>
        </Link>
      </div>
    </details>
  );
}

/** Trois traits fermé, une croix ouvert : l'icône suit l'état, même sans JavaScript. */
function MenuIcon() {
  const common = {
    width: 20,
    height: 20,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.6,
    strokeLinecap: 'round' as const,
    'aria-hidden': true,
  };

  return (
    <>
      <svg {...common} className="group-open:hidden">
        <path d="M4 7h16M4 12h16M4 17h16" />
      </svg>
      <svg {...common} className="hidden group-open:block">
        <path d="M6 6l12 12M18 6 6 18" />
      </svg>
    </>
  );
}
