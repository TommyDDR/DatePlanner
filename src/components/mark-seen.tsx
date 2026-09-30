'use client';

import { useEffect, useRef } from 'react';
import { markPollSeenAction } from '@/app/s/[publicId]/actions';

/**
 * Dit au serveur quelle version du sondage la page affiche (FR-044,
 * décision 034) : « Mes sondages » cesse d'y voir du nouveau.
 *
 * Rejoué à chaque version affichée, y compris celles qu'apporte la mise à jour
 * en direct. Par une action et non au rendu : une page préchargée n'a été vue
 * par personne.
 */
export function MarkSeen({ publicId, version }: { publicId: string; version: string }) {
  // Chaque version n'est dite qu'une fois. Une seconde action attendrait son
  // tour derrière la première, et partirait vers la page suivante si l'on
  // quitte celle-ci entre-temps : Next ne l'y trouverait pas.
  const told = useRef<string | null>(null);

  useEffect(() => {
    const key = `${publicId}@${version}`;
    if (told.current === key) return;
    told.current = key;
    // Un confort : un échec (page quittée, réseau coupé) ne gêne personne.
    markPollSeenAction(publicId, version).catch(() => undefined);
  }, [publicId, version]);

  return null;
}
