'use client';

import { useLayoutEffect, useSyncExternalStore } from 'react';
import { readStoredTheme, THEME_INIT_SCRIPT, THEME_STORAGE_KEY } from '@/lib/theme';

/**
 * Le script qui pose le thème choisi avant la première peinture.
 *
 * Il ne vaut que dans le HTML rendu par le SERVEUR : c'est là qu'il
 * s'exécute, avant toute peinture. Un `<script>` que React crée dans le
 * navigateur est inerte, et React le dit. Or une 404 levée PENDANT le rendu -
 * `notFound()` d'une garde de layout, ou d'une page - part sous la coquille
 * `__next_error__`, que Next remonte entièrement côté client : le script y
 * serait recréé, avec « Encountered a script tag while rendering React
 * component » en console de développement. Et le thème ne serait posé par
 * personne : un visiteur qui a choisi le sombre verrait cette page dans le
 * thème de son système.
 *
 * Le composant rend donc le script au serveur et à l'hydratation - le même
 * arbre des deux côtés -, plus rien une fois dans le navigateur, et pose
 * lui-même le thème quand l'arbre y est CRÉÉ, avant la peinture. Après une
 * hydratation, la pose ne fait que redire ce que le script a déjà écrit.
 */
export function ThemeScript({ nonce }: { nonce: string | null }) {
  // Faux au rendu serveur et pendant l'hydratation, vrai ensuite - et vrai
  // d'emblée quand Next monte l'arbre sans rien hydrater.
  const inBrowser = useSyncExternalStore(subscribeToNothing, () => true, () => false);

  useLayoutEffect(() => {
    if (inBrowser) applyStoredTheme();
  }, [inBrowser]);

  if (inBrowser) return null;
  return <script nonce={nonce ?? undefined} dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />;
}

function subscribeToNothing(): () => void {
  return () => undefined;
}

/** La règle de `THEME_INIT_SCRIPT`, exécutée depuis le composant. */
function applyStoredTheme(): void {
  try {
    const stored = readStoredTheme(localStorage.getItem(THEME_STORAGE_KEY));
    if (stored) document.documentElement.dataset.theme = stored;
  } catch {
    // Stockage refusé (navigation privée, réglage) : le système décide,
    // comme au premier passage.
  }
}
