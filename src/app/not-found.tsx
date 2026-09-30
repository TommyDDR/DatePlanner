import Link from 'next/link';

export const metadata = { title: 'Introuvable' };

/**
 * La même page pour ce qui n'existe pas et ce qui est refusé (FR-028) : rien
 * ne dit si un sondage a existé.
 */
export default function NotFound() {
  return (
    <section className="mx-auto flex max-w-xl flex-col items-start gap-5 px-4 py-24 sm:px-6">
      <p className="label-tech">Erreur 404</p>
      <h1 className="text-3xl font-semibold tracking-tight">Introuvable</h1>
      <p className="text-[var(--color-text-muted)]">
        Ce sondage ou cette page n’existe pas, ou plus. Vérifiez le lien reçu, ou demandez-le à nouveau à la
        personne qui vous l’a envoyé.
      </p>
      <Link href="/" className="btn-ghost">
        Retour à l’accueil
      </Link>
    </section>
  );
}
