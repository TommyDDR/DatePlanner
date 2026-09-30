'use client';

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { LIVE_UPDATES } from '@/config/limits';

/**
 * Tient une page à jour d'après un flux en direct (research.md R8).
 *
 * S'abonne au flux `url` et, à chaque changement annoncé, relit la page par
 * son rendu serveur (`router.refresh()`) : le flux ne porte aucune donnée,
 * c'est le rendu habituel, avec ses contrôles, qui dit ce qui est affiché.
 * Plusieurs événements rapprochés ne donnent qu'une relecture. Après une
 * coupure, le premier `ready` relit aussi la page : ce qui a été manqué est
 * rattrapé. `EventSource` se reconnecte seul ; une réponse 404 (sondage
 * supprimé, session perdue) ou 429 l'arrête, et c'est voulu.
 *
 * `onReturn` : relit aussi la page quand on revient sur l'onglet, pour ce que
 * le flux n'annonce pas - un sondage lu dans un autre onglet.
 */
export function useLiveRefresh(url: string, { onReturn = false }: { onReturn?: boolean } = {}): void {
  const router = useRouter();

  useEffect(() => {
    const source = new EventSource(url);
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

    const onVisible = () => {
      if (document.visibilityState === 'visible') refresh();
    };
    if (onReturn) document.addEventListener('visibilitychange', onVisible);

    return () => {
      source.close();
      if (onReturn) document.removeEventListener('visibilitychange', onVisible);
      if (timer !== null) window.clearTimeout(timer);
    };
  }, [url, onReturn, router]);
}
