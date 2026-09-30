import type { Metadata, Viewport } from 'next';
import { headers } from 'next/headers';
import { JetBrains_Mono, Space_Grotesk } from 'next/font/google';
import { IDENTITY, SITE_URL } from '@/config/identity';
import { CspNonceProvider } from '@/components/csp-nonce';
import { SiteFooter } from '@/components/site-footer';
import { SiteHeader } from '@/components/site-header';
import './globals.css';

// Les polices de laserit.fr (FR-031), auto-hébergées par next/font : aucune
// requête ne part vers Google au chargement d'une page.
const display = Space_Grotesk({
  subsets: ['latin'],
  variable: '--font-display-loaded',
  display: 'swap',
});

const mono = JetBrains_Mono({
  subsets: ['latin'],
  variable: '--font-mono-loaded',
  display: 'swap',
});

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: `${IDENTITY.name} - Sondages de dates`,
    template: `%s - ${IDENTITY.name}`,
  },
  description: IDENTITY.tagline,
  openGraph: { type: 'website', locale: 'fr_FR', siteName: IDENTITY.name },
  // Hors index par défaut (FR-037) : sondages, compte et connexion. Les pages
  // publiques - accueil, pages légales - déclarent le contraire.
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  // Les deux valeurs reprennent `--color-ink` de chaque mode.
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#f6f2ea' },
    { media: '(prefers-color-scheme: dark)', color: '#0c0a09' },
  ],
  width: 'device-width',
  initialScale: 1,
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // Posé par `proxy.ts` : le nonce que la politique de sécurité exige de tout
  // script en ligne.
  const nonce = (await headers()).get('x-nonce');

  return (
    <html
      lang="fr"
      data-scroll-behavior="smooth"
      className={`${display.variable} ${mono.variable}`}
      // Le thème choisi vit dans le navigateur du visiteur : le script du
      // `<head>` pose `data-theme` avant le premier rendu, le serveur ne peut
      // pas avoir écrit le même attribut.
      suppressHydrationWarning
    >
      <head>
        {/* Sans JavaScript, rien ne doit rester invisible. */}
        <noscript>
          <style>{'.reveal{opacity:1;transform:none}'}</style>
        </noscript>
      </head>
      <body className="flex min-h-screen flex-col antialiased">
        <CspNonceProvider nonce={nonce}>
          <a
            href="#contenu"
            className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-full focus:bg-[var(--color-ember)] focus:px-4 focus:py-2 focus:text-[var(--color-on-ember)]"
          >
            Aller au contenu
          </a>
          <SiteHeader />
          <main id="contenu" className="flex-1">
            {children}
          </main>
          <SiteFooter />
        </CspNonceProvider>
      </body>
    </html>
  );
}
