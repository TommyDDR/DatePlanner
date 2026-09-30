import Link from 'next/link';
import { AuthCard } from '../auth-card';
import { ForgotForm } from './forgot-form';

export const metadata = { title: 'Mot de passe oublié' };

export default function ForgotPasswordPage() {
  return (
    <AuthCard
      title="Mot de passe oublié"
      intro="Indiquez l’adresse de votre compte : vous recevrez un lien pour choisir un nouveau mot de passe."
      footer={
        <p>
          <Link href="/connexion" className="underline-offset-4 hover:underline">
            Retour à la connexion
          </Link>
        </p>
      }
    >
      <ForgotForm />
    </AuthCard>
  );
}
