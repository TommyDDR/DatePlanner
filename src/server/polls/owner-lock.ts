import type { Tx } from '@/server/db/client';

/**
 * Le sondage de ce créateur, ligne VERROUILLÉE jusqu'à la fin de la
 * transaction (`FOR UPDATE`).
 *
 * Le propriétaire est dans la clause `WHERE` : ce qui n'est pas à lui est,
 * pour lui, introuvable (FR-028, constitution I). Le verrou sérialise les
 * gestes du créateur entre eux - deux clôtures, un retrait de jour et un
 * autre - et avec les réponses, qui posent un verrou partagé sur la même ligne.
 */
export type OwnedPoll = { id: string; ownerId: string; status: 'OPEN' | 'CLOSED'; multipleRetainedDays: boolean };

export async function lockOwnedPoll(tx: Tx, ownerId: string, publicId: string): Promise<OwnedPoll | null> {
  const rows = await tx.$queryRaw<
    Array<{ id: string; owner_id: string; status: 'OPEN' | 'CLOSED'; multiple_retained_days: boolean }>
  >`
    SELECT "id", "owner_id", "status"::text AS "status", "multiple_retained_days"
    FROM "poll" WHERE "public_id" = ${publicId} AND "owner_id" = ${ownerId}::uuid FOR UPDATE`;
  const row = rows[0];
  return row
    ? { id: row.id, ownerId: row.owner_id, status: row.status, multipleRetainedDays: row.multiple_retained_days }
    : null;
}
