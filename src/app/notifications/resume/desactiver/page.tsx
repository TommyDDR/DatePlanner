import { UnsubscribeForm } from './unsubscribe-form';

export const metadata = { title: 'Résumés par email' };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

/**
 * La page du lien « Ne plus recevoir ces résumés ». Elle ne change rien à
 * l'ouverture - un antivirus de messagerie ouvre les liens - : un bouton
 * confirme (contracts/pages.md).
 */
export default async function UnsubscribePage({ searchParams }: { searchParams: SearchParams }) {
  const { t } = await searchParams;
  return (
    <section className="mx-auto flex max-w-xl flex-col gap-5 px-4 py-16 sm:px-6">
      <p className="label-tech">Notifications</p>
      <h1 className="text-3xl font-semibold tracking-tight">Résumés des nouvelles réponses</h1>
      <UnsubscribeForm token={typeof t === 'string' ? t : ''} />
    </section>
  );
}
