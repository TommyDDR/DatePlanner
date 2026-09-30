import { isPublicId } from '@/lib/public-id';
import { prisma } from '@/server/db/client';

/**
 * « Du nouveau » sur « Mes sondages » (FR-044, décision 034).
 *
 * VERSION
 *   `poll.activity_at` est la version de ce que voit un participant : elle
 *   avance à chaque réponse donnée, modifiée, retirée ou supprimée, et à chaque
 *   changement du titre, de la description, des jours ou de l'état. Les
 *   options (compte exigé, résumés) n'en sont pas : elles ne changent rien à ce
 *   que voit quelqu'un qui a déjà répondu.
 *
 * VERSION VUE
 *   Seuls le créateur et un répondant connecté en gardent une : le créateur
 *   dans `poll.owner_seen_at`, le répondant dans `response.seen_at`. Ouvrir le
 *   lien d'un sondage auquel on n'a pas répondu ne laisse aucune trace, et la
 *   version vue disparaît avec la réponse ou le sondage.
 *
 * ORDRE
 *   La version avance APRÈS la transaction du changement, sous le verrou de la
 *   ligne, d'au moins une milliseconde : une page lue avant le changement
 *   porte une version plus ancienne que celle qui l'annonce. Aucun changement
 *   n'est manqué ; au pire, un changement déjà vu est signalé une fois.
 */

/**
 * Un changement visible vient d'être enregistré : la version avance, et
 * l'auteur connecté du changement, qui l'a vu, n'y trouvera pas de nouveau.
 *
 * Ne lève jamais, comme `publish` : le changement est déjà enregistré, le
 * signaler n'est qu'un confort. À appeler APRÈS la transaction.
 */
export async function recordActivity(pollId: string, actorId: string | null): Promise<void> {
  try {
    const rows = await prisma.$queryRaw<Array<{ activity_at: Date }>>`
      UPDATE "poll"
      SET "activity_at" = GREATEST("activity_at" + interval '1 millisecond', ${new Date()}::timestamp(3))
      WHERE "id" = ${pollId}::uuid
      RETURNING "activity_at"`;
    const version = rows[0]?.activity_at;
    if (version && actorId) await markSeen(pollId, actorId, version);
  } catch (error) {
    console.error('Enregistrement d’un changement impossible :', error);
  }
}

/**
 * Ce compte a vu le sondage dans sa version `version` (celle que la page a
 * rendue). Renvoie `true` si sa version vue a avancé : il y avait du nouveau.
 */
export async function markPollSeen(userId: string, publicId: string, version: Date): Promise<boolean> {
  if (!isPublicId(publicId)) return false;
  const poll = await prisma.poll.findUnique({ where: { publicId }, select: { id: true } });
  return poll ? markSeen(poll.id, userId, version) : false;
}

/**
 * La version vue avance, ne recule jamais, et ne dépasse jamais la version
 * courante. Le filtre sur le créateur ou le répondant est dans l'écriture :
 * un autre compte n'écrit rien.
 */
async function markSeen(pollId: string, userId: string, version: Date): Promise<boolean> {
  const [owner, respondent] = await Promise.all([
    prisma.$executeRaw`
      UPDATE "poll"
      SET "owner_seen_at" = LEAST(${version}::timestamp(3), "activity_at")
      WHERE "id" = ${pollId}::uuid AND "owner_id" = ${userId}::uuid
        AND ("owner_seen_at" IS NULL OR "owner_seen_at" < LEAST(${version}::timestamp(3), "activity_at"))`,
    prisma.$executeRaw`
      UPDATE "response"
      SET "seen_at" = LEAST(${version}::timestamp(3), "poll"."activity_at")
      FROM "poll"
      WHERE "poll"."id" = "response"."poll_id"
        AND "response"."poll_id" = ${pollId}::uuid AND "response"."user_id" = ${userId}::uuid
        AND ("response"."seen_at" IS NULL OR "response"."seen_at" < LEAST(${version}::timestamp(3), "poll"."activity_at"))`,
  ]);
  return owner + respondent > 0;
}
