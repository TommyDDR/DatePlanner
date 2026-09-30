'use client';

import Link from 'next/link';
import { useEffect, useRef } from 'react';

/**
 * Menu de l'en-tête sur téléphone : « Mes sondages », « Nouveau sondage » et
 * le compte, derrière un bouton à trois traits (décision 035).
 *
 * C'est un `<details>` : il s'ouvre et se ferme au toucher comme au clavier,
 * même sans JavaScript. Le script n'ajoute que ce qu'on attend d'un menu - se
 * refermer sur un lien suivi, sur Échap ou sur un toucher ailleurs. L'en-tête
 * reste monté d'une page à l'autre : sans cela, le menu resterait ouvert
 * par-dessus la page atteinte.
 */
export function MobileMenu({ displayName, className = '' }: { displayName: string; className?: string }) {
  const menu = useRef<HTMLDetailsElement>(null);

  // Posé une fois pour toutes : l'état ouvert se lit sur l'élément, au moment
  // même de la touche ou du toucher, sans attendre un rendu.
  useEffect(() => {
    const close = (focusToggle: boolean) => {
      const details = menu.current;
      if (!details?.open) return;
      details.open = false;
      if (focusToggle) details.querySelector('summary')?.focus();
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') close(true);
    };
    const onPointerDown = (event: PointerEvent) => {
      if (!menu.current?.contains(event.target as Node)) close(false);
    };

    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('pointerdown', onPointerDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('pointerdown', onPointerDown);
    };
  }, []);

  const closeOnFollow = () => {
    if (menu.current) menu.current.open = false;
  };

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
