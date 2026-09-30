import type { NextConfig } from 'next';
import { SITE_URL } from './src/config/identity';
import { contentSecurityPolicy } from './src/lib/csp';
import { httpsRedirects } from './src/lib/https-redirect';

const isProduction = process.env.NODE_ENV === 'production';

/**
 * La politique des routes de `/api`, SANS nonce.
 *
 * Celle des pages est posée par `proxy.ts`, qui tire un nonce par requête.
 * Les routes de `/api` ne passent pas par lui : elles rendent du JSON ou un
 * flux, jamais une page à scripts.
 */
const API_CONTENT_SECURITY_POLICY = contentSecurityPolicy({ nonce: null, isProduction });

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // Les tests de bout en bout lancent leur propre serveur pendant que celui du
  // développement tourne, et Next n'en admet qu'un par dossier de sortie.
  // `playwright.config.ts` en donne donc un autre, sous `.next` pour rester
  // ignoré de git et d'ESLint. Sans la variable, rien ne change.
  distDir: process.env.NEXT_DIST_DIR || '.next',
  serverExternalPackages: ['@node-rs/argon2'],
  // En production, tout ce qui arrive en clair repart en HTTPS
  // (`src/lib/https-redirect.ts`), et une adresse publique qui ne serait pas
  // en `https` empêche le démarrage. Les redirections passent avant
  // `proxy.ts` et avant les routes : `/api` et les fichiers statiques sont
  // couverts.
  async redirects() {
    return httpsRedirects(SITE_URL, isProduction);
  },
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), interest-cohort=()' },
          ...(isProduction
            ? [
                // Un an. Posé UNIQUEMENT en production : en développement le
                // site est servi en clair sur localhost, et l'en-tête forcerait
                // le navigateur à y exiger HTTPS pour toutes les applications
                // du même hôte.
                { key: 'Strict-Transport-Security', value: 'max-age=31536000' },
              ]
            : []),
        ],
      },
      {
        source: '/api/:path*',
        headers: [{ key: 'Content-Security-Policy', value: API_CONTENT_SECURITY_POLICY }],
      },
    ];
  },
};

export default nextConfig;
