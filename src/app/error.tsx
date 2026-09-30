'use client';

/** Frontière d'erreur des pages : un message, et de quoi réessayer. */
export default function ErrorPage({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <section className="mx-auto flex max-w-xl flex-col items-start gap-5 px-4 py-24 sm:px-6">
      <p className="label-tech">Erreur</p>
      <h1 className="text-3xl font-semibold tracking-tight">Un imprévu est survenu</h1>
      <p className="text-[var(--color-text-muted)]">
        La page n’a pas pu s’afficher. Réessayez dans un instant ; si le problème continue, revenez plus tard.
      </p>
      <button type="button" onClick={reset} className="btn-ember">
        Réessayer
      </button>
    </section>
  );
}
