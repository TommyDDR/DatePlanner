import Link from 'next/link';
import { redirect } from 'next/navigation';
import { nextFromParam } from '@/lib/safe-redirect';
import { getSessionUser } from '@/server/auth/session';
import { AuthCard } from '../auth-card';
import { LoginForm } from './login-form';

export const metadata = { title: 'Connexion' };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function LoginPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const next = nextFromParam(params.suite);
  if (await getSessionUser()) redirect(next ?? '/mes-sondages');

  const withNext = (path: string) => (next ? `${path}?suite=${encodeURIComponent(next)}` : path);

  return (
    <AuthCard
      title="Connexion"
      intro={next === '/nouveau' ? 'Connectez-vous pour créer votre sondage.' : undefined}
      footer={
        <>
          <p>
            Pas encore de compte ?{' '}
            <Link
              href={withNext('/inscription')}
              className="font-medium text-[var(--color-ember)] underline-offset-4 hover:underline"
            >
              Créer un compte
            </Link>
          </p>
          <p>
            <Link href="/mot-de-passe-oublie" className="underline-offset-4 hover:underline">
              Mot de passe oublié ?
            </Link>
          </p>
        </>
      }
    >
      <LoginForm next={next} />
    </AuthCard>
  );
}
