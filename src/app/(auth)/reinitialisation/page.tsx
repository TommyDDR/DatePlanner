import Link from 'next/link';
import { AuthCard } from '../auth-card';
import { ResetForm } from './reset-form';

export const metadata = { title: 'Nouveau mot de passe' };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function ResetPasswordPage({ searchParams }: { searchParams: SearchParams }) {
  const { jeton } = await searchParams;
  const token = typeof jeton === 'string' ? jeton : '';

  return (
    <AuthCard title="Nouveau mot de passe" intro="Choisissez le mot de passe de votre compte.">
      {token ? (
        <ResetForm token={token} />
      ) : (
        <div className="flex flex-col gap-4">
          <p>Ce lien est incomplet.</p>
          <Link href="/mot-de-passe-oublie" className="btn-ghost self-start">
            Demander un nouveau lien
          </Link>
        </div>
      )}
    </AuthCard>
  );
}
