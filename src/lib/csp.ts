/**
 * Politique de sécurité du contenu (constitution I, research.md R14).
 *
 * Ce qu'elle ferme :
 *  - `default-src 'self'` : aucune ressource d'une autre origine ;
 *  - `base-uri 'none'` : une balise `<base>` injectée ne peut plus réécrire la
 *    cible des liens et des scripts relatifs de la page ;
 *  - `form-action 'self'` : un formulaire ne poste que sur le site - c'est la
 *    directive qui empêche un mot de passe de partir sur un autre domaine. Le
 *    départ vers Google est un LIEN, pas un formulaire : il n'a rien à ouvrir ;
 *  - `object-src 'none'` et `frame-ancestors 'none'` : ni greffon, ni mise en
 *    cadre ;
 *  - `connect-src 'self'` : le site ne parle qu'à lui-même, le flux en direct
 *    compris. Un script tiers n'aurait nulle part où exfiltrer ;
 *  - `script-src` sans `'unsafe-inline'` : un script en ligne ne s'exécute que
 *    s'il porte le NONCE de la requête, tiré par `proxy.ts`. Next le pose sur
 *    ses propres scripts ; celui du thème le lit par `useCspNonce`.
 *
 * Sans nonce - les routes de `/api`, qui ne rendent pas de page à scripts -,
 * aucun script en ligne n'est admis du tout.
 *
 * `style-src` garde `'unsafe-inline'` : React pose des styles en attribut
 * (`style={…}`), qu'un nonce ne couvre pas. Un style injecté ne s'exécute pas.
 */
export function contentSecurityPolicy({
  nonce,
  isProduction,
}: {
  nonce: string | null;
  isProduction: boolean;
}): string {
  return [
    "default-src 'self'",
    "base-uri 'none'",
    "object-src 'none'",
    "frame-ancestors 'none'",
    "form-action 'self'",
    // `'unsafe-eval'` en développement seulement : React s'en sert pour
    // reconstruire les piles d'erreur du serveur dans le navigateur.
    ["script-src 'self'", ...(nonce ? [`'nonce-${nonce}'`] : []), ...(isProduction ? [] : ["'unsafe-eval'"])].join(
      ' ',
    ),
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' blob: data:",
    "font-src 'self'",
    // `ws:` en développement : la WebSocket de rechargement à chaud.
    `connect-src 'self'${isProduction ? '' : ' ws: wss:'}`,
    "frame-src 'none'",
    "manifest-src 'self'",
    // Hors production le site est servi en clair sur localhost : l'exiger en
    // HTTPS y rendrait la page inaccessible.
    ...(isProduction ? ['upgrade-insecure-requests'] : []),
  ].join('; ');
}

/** Un nonce neuf : 128 bits d'aléa, en base64. */
export function freshNonce(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return btoa(String.fromCharCode(...bytes));
}
