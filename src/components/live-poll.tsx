'use client';

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { LIVE_UPDATES } from '@/config/limits';

/**
 * Tient la page d'un sondage à jour (FR-023, research.md R8).
 *
 * S'abonne au flux du sondage et, à chaque changement annoncé, relit la page
 * par son rendu serveur (`router.refresh()`) : le flux ne porte aucune donnée,
 * c'est le rendu habituel, avec ses contrôles, qui dit ce qui est affiché.
 * Plusieurs événements rapprochés ne donnent qu'une relecture. Après une
 * coupure, le premier `ready` relit aussi la page : ce qui a été manqué est
 * rattrapé. `EventSource` se reconnecte seul ; une réponse 404 (sondage
 * supprimé) ou 429 l'arrête, et c'est voulu.
 */
export function LivePoll({ publicId }: { publicId: string }) {
  const router = useRouter();

  useEffect(() => {
    const source = new EventSource(`/api/s/${publicId}/flux`);
    let opened = false;
    let timer: number | null = null;

    const refresh = () => {
      if (timer !== null) window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        timer = null;
        router.refresh();
      }, LIVE_UPDATES.refreshDebounceMs);
    };

    source.addEventListener('ready', () => {
      if (opened) refresh();
      opened = true;
    });
    source.addEventListener('change', refresh);

    return () => {
      source.close();
      if (timer !== null) window.clearTimeout(timer);
    };
  }, [publicId, router]);

  return null;
}
