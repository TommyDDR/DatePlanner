'use client';

import { useLiveRefresh } from '@/components/live-refresh';

/** Tient la page d'un sondage à jour (FR-023) : chaque changement du sondage la fait relire. */
export function LivePoll({ publicId }: { publicId: string }) {
  useLiveRefresh(`/api/s/${publicId}/flux`);
  return null;
}
