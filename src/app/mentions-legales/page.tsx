import type { Metadata } from 'next';
import Link from 'next/link';
import { IDENTITY, SITE_DOMAIN } from '@/config/identity';
import { LegalPage, LegalSection } from '@/components/legal-page';

export const metadata: Metadata = {
  title: 'Mentions légales',
  description: `Éditeur et hébergement de ${IDENTITY.name}.`,
  alternates: { canonical: '/mentions-legales' },
  robots: { index: true, follow: true },
};

/** Mentions légales (FR-036), lues dans `IDENTITY`. */
export default function LegalNoticePage() {
  const legal = IDENTITY.legal;

  return (
    <LegalPage label="Informations légales" title="Mentions légales">
      <LegalSection title="Éditeur">
        <p>
          {legal.entityName}
          <br />
          {legal.address}
          <br />
          SIRET : {legal.siret}
          <br />
          Registre national des entreprises (RNE) : {legal.rneNumber}
          <br />
          Contact :{' '}
          <a className="text-[var(--color-ember)] underline underline-offset-4" href={`mailto:${IDENTITY.email}`}>
            {IDENTITY.email}
          </a>{' '}
          - {IDENTITY.phone}
          <br />
          Directeur de la publication : {legal.publicationDirector}
        </p>
      </LegalSection>

      <LegalSection title="Hébergement">
        {/* Auto-hébergé : l'éditeur tient aussi le rôle d'hébergeur, d'où le
            téléphone répété, que la LCEN exige de l'hébergeur. */}
        <p>
          Service auto-hébergé : les serveurs sont détenus et exploités par l’éditeur.
          <br />
          {legal.hostingProvider}
          <br />
          Téléphone : {IDENTITY.phone}
        </p>
        <p className="mt-3">
          Le nom de domaine {SITE_DOMAIN} est enregistré auprès d’{legal.registrar} SAS, 2 rue Kellermann, 59100
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
