'use client';

import { useLiveRefresh } from '@/components/live-refresh';

/**
 * Tient « Mes sondages » à jour (FR-044) : un changement sur l'un des sondages
 * du compte, ou le retour sur l'onglet, fait relire la page, et la bordure
 * « du nouveau » apparaît ou disparaît sans recharger.
 *
 * Le flux suit les sondages listés à son ouverture : la page le rouvre quand
 * sa liste change (`key`).
 */
export function LiveMyPolls() {
  useLiveRefresh('/api/mes-sondages/flux', { onReturn: true });
  return null;
}
