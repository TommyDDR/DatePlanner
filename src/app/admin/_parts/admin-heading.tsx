import Link from 'next/link';
import { ADMIN_SCREENS, type AdminScreen } from '@/lib/admin-query';

/**
 * Le haut d'un écran de l'administration : son titre, et le passage à
 * l'autre écran. Rendu par chaque page APRÈS son contrôle d'accès : une mise
 * en page commune le montrerait aussi à qui reçoit « introuvable ».
 */
export function AdminHeading({ current, title }: { current: AdminScreen; title: string }) {
  return (
    <div className="flex flex-col gap-5">
      <div>
        <p className="label-tech">Administration</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">{title}</h1>
      </div>
      <nav aria-label="Administration" className="flex flex-wrap gap-2 border-b border-[var(--color-rule)] pb-3 text-sm">
        {ADMIN_SCREENS.map((screen) => {
          const active = screen.key === current;
          return (
            <Link
              key={screen.key}
              href={screen.href}
              aria-current={active ? 'page' : undefined}
              className={`rounded-full px-3 py-2 ${
                active
                  ? 'bg-[var(--color-ink-soft)] font-medium text-[var(--color-text)] ring-1 ring-[var(--color-rule-strong)]'
                  : 'text-[var(--color-text-muted)] hover:bg-[var(--color-ink-soft)] hover:text-[var(--color-text)]'
              }`}
            >
              {screen.label}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
