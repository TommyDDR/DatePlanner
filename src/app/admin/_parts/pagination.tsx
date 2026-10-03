import Link from 'next/link';

/**
 * Le passage d'une page à l'autre d'une liste : de simples liens, qui
 * gardent les filtres et se suivent sans JavaScript.
 */
export function Pagination({
  page,
  pageCount,
  hrefFor,
}: {
  page: number;
  pageCount: number;
  hrefFor: (page: number) => string;
}) {
  if (pageCount <= 1) return null;
  return (
    <nav aria-label="Pages de la liste" className="flex flex-wrap items-center justify-center gap-2 text-sm">
      <PageLink target={1} current={page} hrefFor={hrefFor}>
        Première
      </PageLink>
      <PageLink target={page - 1} current={page} hrefFor={hrefFor} rel="prev">
        Précédente
      </PageLink>
      <span className="px-3 py-2 text-[var(--color-text-muted)]">
        Page {page} sur {pageCount}
      </span>
      <PageLink target={page + 1} current={page} hrefFor={hrefFor} rel="next" last={pageCount}>
        Suivante
      </PageLink>
      <PageLink target={pageCount} current={page} hrefFor={hrefFor} last={pageCount}>
        Dernière
      </PageLink>
    </nav>
  );
}

const LINK = 'rounded-full border border-[var(--color-rule-strong)] px-3 py-2';

function PageLink({
  target,
  current,
  hrefFor,
  rel,
  last = Infinity,
  children,
}: {
  target: number;
  current: number;
  hrefFor: (page: number) => string;
  rel?: 'prev' | 'next';
  last?: number;
  children: React.ReactNode;
}) {
  // La page où l'on est déjà, ou une page hors de la liste : le lien s'efface sans disparaître.
  if (target === current || target < 1 || target > last) {
    return (
      <span aria-disabled="true" className={`${LINK} text-[var(--color-text-subtle)] opacity-60`}>
        {children}
      </span>
    );
  }
  return (
    <Link href={hrefFor(target)} rel={rel} className={`${LINK} hover:border-[var(--color-ember)]`}>
      {children}
    </Link>
  );
}
