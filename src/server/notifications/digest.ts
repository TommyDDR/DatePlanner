import { randomUUID } from 'node:crypto';
import { digestSince, nextDigestAt } from '@/lib/digest';
import { signLink } from '@/lib/signed-link';
import { plural } from '@/lib/text';
import { prisma, type Tx } from '@/server/db/client';
import { registerComposer } from './compose';
import { absoluteUrl, button, escapeHtml, layout, paragraph, textFooter } from './templates';

/**
 * Le résumé des nouvelles réponses envoyé au créateur (FR-041, contracts/emails.md).
 *
 * Programmé à la première nouvelle réponse, composé AU DÉPART à partir de la
 * base : il annonce les réponses créées depuis le résumé précédent et encore
 * présentes. Un seul résumé en attente par sondage - l'index unique partiel de
 * la file le garantit, même sous deux réponses simultanées.
 */

export const OWNER_DIGEST_PURPOSE = 'owner-digest';

/**
 * Programme le résumé d'un sondage s'il n'y en a pas déjà un en attente.
 * Rend l'identifiant de l'entrée créée, ou `null`. À appeler DANS la
 * transaction de la réponse ; l'appelant lance l'envoi une fois validée.
 */
export async function scheduleOwnerDigest(tx: Tx, pollId: string): Promise<{ id: string; sendAfter: Date } | null> {
  const poll = await tx.poll.findUnique({
    where: { id: pollId },
    select: { notifyOwner: true, ownerDigestSentAt: true, owner: { select: { email: true } } },
  });
  if (!poll || !poll.notifyOwner) return null;

  const id = randomUUID();
  const sendAfter = nextDigestAt(new Date(), poll.ownerDigestSentAt);
  // `ON CONFLICT … DO NOTHING` sur l'index partiel : un conflit ne fait pas
  // échouer la transaction de la réponse, il ne crée simplement rien.
  const inserted = await tx.$executeRaw`
    INSERT INTO "email_outbox" ("id", "to", "template", "payload", "poll_id", "status", "send_after", "attempts", "created_at")
    VALUES (${id}::uuid, ${poll.owner.email}, 'OWNER_DIGEST'::"email_template", ${JSON.stringify({ pollId })}::jsonb,
            ${pollId}::uuid, 'PENDING'::"email_status", ${sendAfter}, 0, now())
    ON CONFLICT ("poll_id") WHERE "template" = 'OWNER_DIGEST' AND "status" = 'PENDING' DO NOTHING`;
  return inserted > 0 ? { id, sendAfter } : null;
}

/** Le lien de désactivation, et celui de la désinscription en un clic. */
export function digestUnsubscribeLinks(pollId: string) {
  const token = encodeURIComponent(signLink(OWNER_DIGEST_PURPOSE, pollId));
  return {
    page: absoluteUrl(`/notifications/resume/desactiver?t=${token}`),
    oneClick: absoluteUrl(`/api/notifications/resume/desactiver?t=${token}`),
  };
}

registerComposer('OWNER_DIGEST', async (entry) => {
  const pollId = entry.pollId;
  if (!pollId) return null;
  const poll = await prisma.poll.findUnique({
    where: { id: pollId },
    select: {
      publicId: true,
      title: true,
      notifyOwner: true,
      ownerDigestCursor: true,
      responses: {
        select: { createdAt: true, pseudonym: true, user: { select: { displayName: true } } },
      },
    },
  });
  if (!poll || !poll.notifyOwner) return null;

  const digest = digestSince(
    poll.responses.map((r) => ({
      name: r.user?.displayName ?? r.pseudonym ?? '',
      account: r.user !== null,
      createdAt: r.createdAt,
    })),
    poll.ownerDigestCursor,
  );
  if (!digest) return null;

  const count = digest.newcomers.length;
  const subject = `${plural(count, 'nouvelle réponse', 'nouvelles réponses')} à « ${poll.title} »`;
  const link = absoluteUrl(`/s/${poll.publicId}`);
  const links = digestUnsubscribeLinks(pollId);
  const total = `${plural(poll.responses.length, 'personne a', 'personnes ont')} répondu en tout.`;
  const names = digest.newcomers.map((voter) => `- ${voter.name}${voter.account ? ' (compte)' : ''}`);

  return {
    subject,
    text: [
      `Du nouveau sur votre sondage « ${poll.title} » :`,
      '',
      ...names,
      '',
      total,
      '',
      `Voir le sondage : ${link}`,
      textFooter(`Ne plus recevoir ces résumés pour ce sondage : ${links.page}`),
    ].join('\n'),
    html: layout(
      [
        paragraph(`Du nouveau sur votre sondage « ${poll.title} » :`),
        `<ul style="margin:0 0 16px;padding-left:20px">${digest.newcomers
          .map((voter) => `<li>${escapeHtml(voter.name)}${voter.account ? ' <small>(compte)</small>' : ''}</li>`)
          .join('')}</ul>`,
        paragraph(total),
        button(link, 'Voir le sondage'),
      ].join(''),
      `<a href="${escapeHtml(links.page)}" style="color:#57504a">Ne plus recevoir ces résumés pour ce sondage</a>`,
    ),
    headers: {
      'List-Unsubscribe': `<${links.oneClick}>`,
      'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
    },
    afterSend: async () => {
      // Le curseur n'avance qu'une fois l'email parti, et jamais à reculons.
      await prisma.poll.updateMany({
        where: { id: pollId, ownerDigestCursor: { lt: digest.cursor } },
        data: { ownerDigestCursor: digest.cursor },
      });
      await prisma.poll.update({ where: { id: pollId }, data: { ownerDigestSentAt: new Date() } });
    },
  };
});
