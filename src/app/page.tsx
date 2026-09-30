import type { Metadata } from 'next';
import Link from 'next/link';
import { IDENTITY, SITE_DOMAIN } from '@/config/identity';
import { LandingDemo } from '@/components/landing-demo';
import { getSessionUser } from '@/server/auth/session';

/** L'accueil est la seule page, avec les pages légales, à s'indexer (FR-037). */
export const metadata: Metadata = {
  title: { absolute: `${IDENTITY.name} - Trouvez la date qui arrange tout le monde` },
  description:
    'Proposez des jours, partagez un lien, chacun coche ses disponibilités : les votes s’affichent en direct et la meilleure date saute aux yeux. Sans compte pour répondre.',
  alternates: { canonical: '/' },
  robots: { index: true, follow: true },
  openGraph: {
    url: '/',
    title: `${IDENTITY.name} - Trouvez la date qui arrange tout le monde`,
    description: 'Des sondages de dates simples, en direct, sans compte pour répondre.',
  },
};

const STEPS = [
  {
    title: 'Proposez des jours',
    text: 'Un titre, quelques mots, et les jours possibles : un par un, une plage d’un glissé, ou une semaine entière.',
  },
  {
    title: 'Partagez le lien',
    text: 'Un lien impossible à deviner, à coller dans un message. Vos invités n’ont pas besoin de compte.',
  },
  {
    title: 'Chacun coche ses dates',
    text: 'Les pastilles se remplissent en direct, les noms s’affichent au survol. Vous closez et annoncez la date retenue.',
  },
];

const PROMISES = [
  { title: 'Sans compte pour répondre', text: 'Un pseudo suffit ; chacun retrouve et modifie sa réponse depuis son appareil.' },
  { title: 'En direct', text: 'Une réponse apparaît chez tout le monde en quelques secondes, sans recharger la page.' },
  { title: 'Clair ou sombre', text: 'Le thème de votre appareil, à votre main, sur ordinateur comme sur téléphone.' },
];

export default async function HomePage() {
  const user = await getSessionUser();
  const createHref = user ? '/nouveau' : `/connexion?suite=${encodeURIComponent('/nouveau')}`;

  return (
    <div className="flex flex-col">
      <section className="mx-auto grid w-full max-w-6xl items-center gap-10 px-4 pb-16 pt-8 sm:px-6 sm:pt-14 lg:grid-cols-[1.05fr_1fr] lg:gap-14 lg:pb-24">
        <div className="flex flex-col gap-5">
          <p className="label-tech">Sondages de dates · {SITE_DOMAIN}</p>
          <h1 className="text-[2.35rem] font-semibold leading-[1.05] tracking-tight sm:text-5xl lg:text-6xl">
            Trouvez la date qui arrange <span className="text-[var(--color-ember)]">tout le monde</span>.
          </h1>
          <p className="max-w-xl text-lg text-[var(--color-text-muted)]">
            Proposez des jours, partagez un lien, et regardez les disponibilités s’allumer en direct.
          </p>
          <div className="flex flex-wrap items-center gap-3">
            <Link href={createHref} className="btn-ember">
              Créer un sondage
            </Link>
            <a href="#etapes" className="btn-ghost">
              Comment ça marche
            </a>
          </div>
          <p className="label-tech">Gratuit · sans compte pour répondre · sans publicité</p>
        </div>
        <LandingDemo />
      </section>

      <section id="etapes" aria-labelledby="etapes-titre" className="border-y border-[var(--color-rule)] bg-[var(--color-ink-soft)]">
        <div className="mx-auto flex max-w-6xl flex-col gap-8 px-4 py-16 sm:px-6">
          <h2 id="etapes-titre" className="text-2xl font-semibold tracking-tight sm:text-3xl">
            Trois étapes, pas une de plus
          </h2>
          <ol data-testid="etapes" className="grid gap-4 md:grid-cols-3">
            {STEPS.map((step, index) => (
              <li key={step.title} className="surface flex flex-col gap-3 p-5">
                <span className="font-mono text-sm text-[var(--color-ember)]">0{index + 1}</span>
                <h3 className="text-lg font-semibold">{step.title}</h3>
                <p className="text-[var(--color-text-muted)]">{step.text}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section aria-labelledby="partage-titre" className="mx-auto grid w-full max-w-6xl items-center gap-10 px-4 py-16 sm:px-6 lg:grid-cols-2">
        <div className="flex flex-col gap-4">
          <h2 id="partage-titre" className="text-2xl font-semibold tracking-tight sm:text-3xl">
            Un lien, et c’est parti
          </h2>
          <p className="text-[var(--color-text-muted)]">
            Collez le lien dans votre groupe de discussion. Chacun l’ouvre, coche ses jours et valide : vous voyez qui
            est disponible, jour par jour, sans rien compter à la main.
          </p>
          <ul className="flex flex-col gap-3">
            {PROMISES.map((promise) => (
              <li key={promise.title} className="flex gap-3">
                <span aria-hidden="true" className="mt-2 size-2 shrink-0 rounded-full bg-[var(--color-ember)]" />
                <span>
                  <span className="font-medium">{promise.title}.</span>{' '}
                  <span className="text-[var(--color-text-muted)]">{promise.text}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>
        <div aria-hidden="true" className="surface flex flex-col gap-3 p-5">
          <p className="self-end rounded-2xl rounded-br-md bg-[var(--color-ember)] px-4 py-2.5 text-sm text-[var(--color-on-ember)]">
            On se fait ce dîner ? Dites-moi vos dispos 👇
          </p>
          <p className="self-end rounded-2xl rounded-br-md border border-[var(--color-rule-strong)] bg-[var(--color-ink-raised)] px-4 py-2.5 font-mono text-xs">
            {SITE_DOMAIN}/s/4mQx…
          </p>
          <p className="self-start rounded-2xl rounded-bl-md bg-[var(--color-ink-raised)] px-4 py-2.5 text-sm">
            C’est fait, je suis libre le 16 et le 17 !
          </p>
        </div>
      </section>

      <section className="mx-auto flex w-full max-w-6xl flex-col items-start gap-5 px-4 pb-20 sm:px-6">
        <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">Votre prochain rendez-vous commence ici.</h2>
        <Link href={createHref} className="btn-ember">
          Créer un sondage
        </Link>
      </section>
    </div>
  );
}
