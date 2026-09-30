/**
 * En production, le site ne se sert qu'en HTTPS.
 *
 * Le proxy (Traefik, sur la VM proxy) renvoie déjà son port 80 sur le 443,
 * mais rien n'empêche d'atteindre Next EN CLAIR : le port 3000 joint par un
 * autre chemin, un proxy mal réglé, une adresse `http://` recopiée d'un ancien
 * email. La page s'afficherait alors, sans cookie de session - il est `Secure`
 * en production et le navigateur ne le renvoie pas -, donc sans connexion
 * possible, et sans rien pour dire pourquoi. Tout ce qui arrive en clair est
 * donc renvoyé, en permanence, sur l'adresse publique en `https`.
 *
 * Le schéma est lu dans `X-Forwarded-Proto`, que le proxy pose : Next, lui, ne
 * voit que la connexion en clair du proxy. Une requête qui n'en porte AUCUN
 * n'est pas passée par le proxy, et `next start` ne parle pas TLS : elle est
 * en clair. Seule exception, l'hôte LOCAL : la maintenance
 * (`deploy/dateplanner-maintenance.service`) appelle
 * `http://127.0.0.1:3000/api/maintenance`, et une supervision sur la machine
 * elle-même interroge `/api/sante` de la même façon. Renvoyés sur le
 * domaine, ces appels ne suivraient pas la redirection et la maintenance ne
 * tournerait plus. Un visiteur qui écrirait `Host: localhost` à la main ne
 * gagnerait rien : c'est lui qui choisit le clair, et le cookie de session
 * reste `Secure`.
 *
 * Seconde exception, la requête qui n'a AUCUN `Host` : c'est celle que Next
 * s'adresse à lui-même. L'optimiseur de `next/image` relit une image locale
 * par une requête simulée, sans le moindre en-tête, qui repasse par tout le
 * routage - redirections comprises. Renvoyée en 308, elle rendrait un corps
 * texte au lieu de l'image. Une vraie requête HTTP/1.1 porte toujours `Host` ;
 * celle qui n'en porte pas n'est pas passée par le proxy, et rien ne se perd à
 * la servir telle quelle.
 *
 * La destination est l'adresse PUBLIQUE (`SITE_URL`), jamais l'hôte reçu :
 * `http://dateplanner.laserit.fr:3000` renvoyé sur le même port en `https`
 * mènerait à un port qui ne parle pas TLS. Le code 308 garde la méthode et le corps :
 * un formulaire posté en clair est reposté en HTTPS, pas changé en `GET`.
 */

/** La forme d'une redirection de `next.config.ts`, réduite à ce qui sert ici. */
export type HttpsRedirect = {
  source: string;
  destination: string;
  permanent: true;
  has?: { type: 'header'; key: string; value?: string }[];
  missing?: ({ type: 'header'; key: string } | { type: 'host'; value: string })[];
};

/**
 * Les hôtes de la machine elle-même, comparés SANS port. `[` couvre `[::1]` :
 * Next coupe l'hôte au premier deux-points, il n'en reste que le crochet.
 */
const LOOPBACK_HOSTS = '(?:localhost|127\\.0\\.0\\.1|\\[)';

/**
 * Les redirections vers HTTPS, ou aucune hors production.
 *
 * Refuse de démarrer si l'adresse publique n'est pas en `https` : il n'y
 * aurait nulle part où renvoyer, et laisser servir en clair est précisément
 * ce que cette règle ferme.
 */
export function httpsRedirects(siteUrl: string, isProduction: boolean): HttpsRedirect[] {
  if (!isProduction) return [];
  const url = new URL(siteUrl);
  if (url.protocol !== 'https:') {
    throw new Error(
      `L'adresse publique du site doit être en https en production (reçu : ${siteUrl}). ` +
        'Corriger NEXT_PUBLIC_SITE_URL.',
    );
  }
  const destination = `${url.origin}/:path*`;
  return [
    {
      source: '/:path*',
      has: [{ type: 'header', key: 'x-forwarded-proto', value: 'http' }],
      destination,
      permanent: true,
    },
    {
      source: '/:path*',
      // Sans `Host`, c'est Next qui s'appelle lui-même (`next/image`).
      has: [{ type: 'header', key: 'host' }],
      missing: [
        { type: 'header', key: 'x-forwarded-proto' },
        { type: 'host', value: LOOPBACK_HOSTS },
      ],
      destination,
      permanent: true,
    },
  ];
}
