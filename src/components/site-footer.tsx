import Link from 'next/link';
import { IDENTITY } from '@/config/identity';

export function SiteFooter() {
  return (
    <footer className="border-t border-[var(--color-rule)]">
      <div className="mx-auto flex max-w-6xl flex-col gap-3 px-4 py-8 text-sm text-[var(--color-text-muted)] sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <p>
          {IDENTITY.name} <span className="label-tech ml-2">un service de laserit.fr</span>
        </p>
        <nav aria-label="Informations légales" className="flex gap-4">
          <Link href="/mentions-legales" className="hover:text-[var(--color-text)]">
            Mentions légales
          </Link>
          <Link href="/confidentialite" className="hover:text-[var(--color-text)]">
            Confidentialité
          </Link>
        </nav>
      </div>
    </footer>
  );
}
