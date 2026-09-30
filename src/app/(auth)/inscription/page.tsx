import Link from 'next/link';
import { redirect } from 'next/navigation';
import { nextFromParam } from '@/lib/safe-redirect';
import { getSessionUser } from '@/server/auth/session';
import { AuthCard } from '../auth-card';
import { GoogleButton } from '../google-button';
import { RegisterForm } from './register-form';

export const metadata = { title: 'Créer un compte' };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function RegisterPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const next = nextFromParam(params.suite);
  if (await getSessionUser()) redirect(next ?? '/mes-sondages');

  return (
    <AuthCard
      title="Créer un compte"
      intro="Un compte suffit pour créer vos sondages. Pour répondre à un sondage, aucun compte n’est nécessaire."
      footer={
        <p>
          Déjà un compte ?{' '}
          <Link
            href={next ? `/connexion?suite=${encodeURIComponent(next)}` : '/connexion'}
            className="font-medium text-[var(--color-ember)] underline underline-offset-4"
          >
            Se connecter
          </Link>
        </p>
      }
    >
      <div className="flex flex-col gap-4">
        <GoogleButton next={next} />
        <RegisterForm next={next} />
      </div>
    </AuthCard>
  );
}
