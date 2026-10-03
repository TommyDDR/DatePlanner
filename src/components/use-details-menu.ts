'use client';

import { useCallback, useEffect, useRef } from 'react';

/**
 * Le comportement d'un menu bâti sur `<details>` (décision 035) : il s'ouvre
 * et se ferme au toucher comme au clavier, même sans JavaScript ; le script
 * n'ajoute que ce qu'on attend d'un menu - se refermer sur un lien suivi, sur
 * Échap ou sur un toucher ailleurs. L'en-tête reste monté d'une page à
 * l'autre : sans cela, le menu resterait ouvert par-dessus la page atteinte.
 */
export function useDetailsMenu() {
  const menu = useRef<HTMLDetailsElement>(null);

  // Posé une fois pour toutes : l'état ouvert se lit sur l'élément, au moment
  // même de la touche ou du toucher, sans attendre un rendu.
  useEffect(() => {
    const close = (focusToggle: boolean) => {
      const details = menu.current;
      if (!details?.open) return;
      details.open = false;
      if (focusToggle) details.querySelector('summary')?.focus();
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') close(true);
    };
    const onPointerDown = (event: PointerEvent) => {
      if (!menu.current?.contains(event.target as Node)) close(false);
    };

    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('pointerdown', onPointerDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('pointerdown', onPointerDown);
    };
  }, []);

  const closeOnFollow = useCallback(() => {
    if (menu.current) menu.current.open = false;
  }, []);

  return { menu, closeOnFollow };
}
