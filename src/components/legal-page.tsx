import type { ReactNode } from 'react';

/** Mise en page commune des pages légales. */
export function LegalPage({ label, title, children }: { label: string; title: string; children: ReactNode }) {
  return (
    <section className="mx-auto max-w-2xl px-4 py-12 sm:px-6 sm:py-16">
      <p className="label-tech">{label}</p>
      <h1 className="mt-4 text-3xl font-semibold tracking-[-0.02em]">{title}</h1>
      <div className="mt-10 space-y-10 text-sm leading-relaxed text-[var(--color-text-muted)]">{children}</div>
    </section>
  );
}

export function LegalSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section>
      <h2 className="mb-3 text-base font-semibold tracking-tight text-[var(--color-text)]">{title}</h2>
      {children}
    </section>
  );
}
