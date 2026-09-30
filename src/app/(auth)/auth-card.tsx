/** Le cadre commun des pages de compte : un titre, une carte, des liens. */
export function AuthCard({
  title,
  intro,
  children,
  footer,
}: {
  title: string;
  intro?: React.ReactNode;
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  return (
    <section className="mx-auto w-full max-w-md px-4 py-14 sm:py-20">
      <h1 className="text-3xl font-semibold tracking-tight">{title}</h1>
      {intro ? <div className="mt-3 text-[var(--color-text-muted)]">{intro}</div> : null}
      <div className="surface mt-8 p-6 sm:p-7">{children}</div>
      {footer ? <div className="mt-6 flex flex-col gap-2 text-sm text-[var(--color-text-muted)]">{footer}</div> : null}
    </section>
  );
}
