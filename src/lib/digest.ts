import { DIGEST } from '@/config/limits';
import type { Voter } from '@/lib/availability';

/**
 * Le résumé des nouvelles réponses envoyé au créateur - module PUR (FR-041).
 *
 * Le premier résumé part quinze minutes après la première nouvelle réponse :
 * une vague de réponses arrivée en quelques minutes tient dans un seul email.
 * Ensuite, au plus un résumé toutes les trente minutes.
 */

const MINUTE = 60_000;

/** L'instant d'envoi d'un résumé programmé maintenant. */
export function nextDigestAt(now: Date, lastSentAt: Date | null): Date {
  const grouped = now.getTime() + DIGEST.firstDelayMinutes * MINUTE;
  const spaced = lastSentAt ? lastSentAt.getTime() + DIGEST.minIntervalMinutes * MINUTE : 0;
  return new Date(Math.max(grouped, spaced));
}

export type DigestResponse = Voter & { createdAt: Date };

/**
 * Ce que dit un résumé AU MOMENT DE SON ENVOI : les réponses créées après le
 * curseur et encore présentes, dans l'ordre d'arrivée, et le nouveau curseur.
 * `null` quand plus rien n'est nouveau - réponses retirées entre-temps : le
 * résumé n'a plus d'objet.
 */
export function digestSince(
  responses: readonly DigestResponse[],
  cursor: Date,
): { newcomers: Voter[]; cursor: Date } | null {
  const fresh = responses
    .filter((response) => response.createdAt.getTime() > cursor.getTime())
    .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  if (fresh.length === 0) return null;
  return {
    newcomers: fresh.map(({ name, account }) => ({ name, account })),
    cursor: fresh[fresh.length - 1]!.createdAt,
  };
}
