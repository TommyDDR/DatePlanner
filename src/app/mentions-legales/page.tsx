import type { Metadata } from 'next';
import Link from 'next/link';
import { IDENTITY, SITE_DOMAIN, readEditor } from '@/config/identity';
import { LegalPage, LegalSection } from '@/components/legal-page';

export const metadata: Metadata = {
  title: 'Mentions légales',
  description: `Éditeur et hébergement de ${IDENTITY.name}.`,
  alternates: { canonical: '/mentions-legales' },
  robots: { index: true, follow: true },
};

/** Mentions légales (FR-036), lues dans `IDENTITY` et `readEditor`. */
export default function LegalNoticePage() {
  const editor = readEditor();

  return (
    <LegalPage label="Informations légales" title="Mentions légales">
      <LegalSection title="Éditeur">
        <p>
          Service édité à titre non professionnel par :
          <br />
          {editor.name}
          <br />
          {editor.address}
          <br />
          Contact :{' '}
          <a className="text-[var(--color-ember)] underline underline-offset-4" href={`mailto:${IDENTITY.email}`}>
            {IDENTITY.email}
          </a>
          <br />
          Directeur de la publication : {editor.name}
        </p>
      </LegalSection>

      <LegalSection title="Hébergement">
        {/* Auto-hébergé : l'éditeur tient aussi le rôle d'hébergeur. */}
        <p>
          Service auto-hébergé : les serveurs sont détenus et exploités par l’éditeur.
          <br />
          {editor.name}, {editor.address}
        </p>
        <p className="mt-3">
          Le nom de domaine {SITE_DOMAIN} est enregistré auprès d’{IDENTITY.legal.registrar} SAS, 2 rue Kellermann, 59100
          Roubaix, France, qui n’héberge pas le service.
        </p>
      </LegalSection>

      <LegalSection title="Contenus publiés">
        <p>
          Les titres, descriptions et pseudos des sondages sont rédigés par leurs utilisateurs, qui en répondent.
          Un contenu manifestement illicite peut être signalé à{' '}
          <a className="text-[var(--color-ember)] underline underline-offset-4" href={`mailto:${IDENTITY.email}`}>
            {IDENTITY.email}
          </a>
          , avec le lien du sondage : il sera retiré.
        </p>
      </LegalSection>

      <LegalSection title="Données personnelles">
        <p>
          Le traitement des données est détaillé dans la{' '}
          <Link href="/confidentialite" className="text-[var(--color-ember)] underline underline-offset-4">
            politique de confidentialité
          </Link>
          .
        </p>
      </LegalSection>
    </LegalPage>
  );
}
