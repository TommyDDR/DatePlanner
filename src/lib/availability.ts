import { POLL_LIMITS } from '@/config/limits';

/**
 * Synthèse des votes d'un sondage - module PUR (FR-020, FR-021).
 *
 * Qui a voté pour quel jour, tel que tout porteur du lien le voit : les
 * pastilles du calendrier, l'infobulle d'un jour, la liste « Qui est
 * disponible ? ». Une seule construction pour les trois : ils ne peuvent pas
 * se contredire.
 */

export type Voter = {
  name: string;
  /** Réponse donnée avec un compte : elle se distingue d'un pseudo saisi. */
  account: boolean;
};

export type VoteRow = { day: string; name: string; account: boolean };

export type DayAvailability = { day: string; count: number; voters: Voter[] };

const BY_NAME = new Intl.Collator('fr', { sensitivity: 'base' });

/** Les jours ayant au moins un vote, dans l'ordre du calendrier, votants par ordre alphabétique. */
export function buildAvailability(rows: readonly VoteRow[]): DayAvailability[] {
  const byDay = new Map<string, Voter[]>();
  for (const row of rows) {
    const voters = byDay.get(row.day) ?? [];
    voters.push({ name: row.name, account: row.account });
    byDay.set(row.day, voters);
  }
  return [...byDay]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([day, voters]) => ({
      day,
      count: voters.length,
      voters: voters.sort((a, b) => BY_NAME.compare(a.name, b.name)),
    }));
}

/** Les votants à montrer, et combien restent (« et N autres ») au-delà de vingt. */
export function votersSummary(voters: readonly Voter[], shown: number = POLL_LIMITS.votersShown) {
  return { shown: voters.slice(0, shown), others: Math.max(0, voters.length - shown) };
}

export function voteCountLabel(count: number): string {
  return `${count} vote${count > 1 ? 's' : ''}`;
}
