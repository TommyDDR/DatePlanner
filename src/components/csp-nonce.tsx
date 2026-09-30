'use client';

import { createContext, useContext } from 'react';

/**
 * Le nonce de la requête, pour les scripts en ligne rendus par un composant
 * client.
 *
 * Le layout racine le lit dans les en-têtes (`x-nonce`, posé par
 * `proxy.ts`) et le confie ici : un composant client n'a pas accès aux
 * en-têtes. Sans nonce - un rendu hors requête -, la valeur est `null` et le
 * script part sans attribut : la politique le bloquera, ce qui est le bon
 * défaut.
 */
const CspNonceContext = createContext<string | null>(null);

export function CspNonceProvider({ nonce, children }: { nonce: string | null; children: React.ReactNode }) {
  return <CspNonceContext.Provider value={nonce}>{children}</CspNonceContext.Provider>;
}

export function useCspNonce(): string | null {
  return useContext(CspNonceContext);
}
