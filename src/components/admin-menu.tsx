'use client';

import Link from 'next/link';
import { ADMIN_SCREENS } from '@/lib/admin-query';
import { useDetailsMenu } from './use-details-menu';

/**
 * Le menu « Administration » de l'en-tête, sur un écran large et pour un
 * administrateur seulement (décision 042) : ses deux écrans. Sur téléphone,
 * ils passent dans `MobileMenu`.
 */
export function AdminMenu({ className = '' }: { className?: string }) {
  const { menu, closeOnFollow } = useDetailsMenu();

  return (
    <details ref={menu} className={`group relative ${className}`}>
      <summary className="flex cursor-pointer list-none items-center gap-1.5 rounded-full px-3 py-2 hover:bg-[var(--color-ink-soft)] [&::-webkit-details-marker]:hidden">
        Administration
        <svg
          width={12}
          height={12}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          strokeLinecap="round"
          aria-hidden
          className="transition-transform group-open:rotate-180"
        >
          <path d="m6 9 6 6 6-6" />
        </svg>
      </summary>
      <div className="surface-raised absolute right-0 top-full mt-2 flex w-56 flex-col p-1.5 text-[0.9375rem] shadow-lg">
        {ADMIN_SCREENS.map((screen) => (
          <Link
            key={screen.key}
            href={screen.href}
            onClick={closeOnFollow}
            className="flex min-h-11 items-center rounded-[10px] px-3 hover:bg-[var(--color-ink-soft)]"
          >
            {screen.label}
          </Link>
        ))}
      </div>
    </details>
  );
}
