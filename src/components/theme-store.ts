'use client';

import { useSyncExternalStore } from 'react';
import { THEME_STORAGE_KEY, readStoredTheme, resolveTheme, type Theme } from '@/lib/theme';

/**
 * Le thème effectif, lu comme une source extérieure au rendu.
 *
 * Le choix vit dans le navigateur du visiteur, pas dans sa session : le rendu
 * serveur ne peut pas le connaître. `useSyncExternalStore` rend la valeur de
 * repli à l'hydratation puis la valeur réelle, sans divergence et sans
 * écriture d'état dans un effet.
 *
 * Le magasin vit à part du bouton : tout composant qui aurait besoin du thème
 * effectif le lit ici, et deux lectures écrites séparément finiraient par
 * répondre deux choses sur la même page.
 */

const DARK_QUERY = '(prefers-color-scheme: dark)';

const listeners = new Set<() => void>();

function subscribe(onChange: () => void) {
  listeners.add(onChange);

  // Un autre onglet du même site peut changer le thème : `storage` ne se
  // déclenche que là, jamais dans l'onglet qui écrit - d'où la notification
  // explicite après chaque choix (`notifyThemeChange`).
  window.addEventListener('storage', onChange);

  // Sans choix explicite, le système fait foi : la feuille de styles suit
  // toute seule, ce qui est rendu en JavaScript non.
  const media = window.matchMedia(DARK_QUERY);
  media.addEventListener('change', onChange);

  return () => {
    listeners.delete(onChange);
    window.removeEventListener('storage', onChange);
    media.removeEventListener('change', onChange);
  };
}

function readTheme(): Theme {
  let stored: string | null = null;
  try {
    stored = localStorage.getItem(THEME_STORAGE_KEY);
  } catch {
    // Stockage refusé (navigation privée, réglage strict) : le thème système
    // reste utilisable, seul le souvenir est perdu.
  }
  return resolveTheme(readStoredTheme(stored), window.matchMedia(DARK_QUERY).matches);
}

/**
 * Rendu serveur : le sombre est la valeur de base de la feuille de styles.
 * Ce qui en dépend est corrigé dès l'hydratation ; les couleurs de la page,
 * elles, n'ont jamais été fausses - le script du `<head>` a posé l'attribut
 * avant la première peinture.
 */
function serverTheme(): Theme {
  return 'dark';
}

export function useTheme(): Theme {
  return useSyncExternalStore(subscribe, readTheme, serverTheme);
}

/** À appeler après avoir écrit le choix : `storage` ne prévient pas l'onglet qui écrit. */
export function notifyThemeChange(): void {
  for (const listener of listeners) listener();
}
