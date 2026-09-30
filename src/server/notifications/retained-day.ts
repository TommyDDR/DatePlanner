import { dayFromDate, formatLongDay, type Day } from '@/lib/paris-day';
import { prisma, type Tx } from '@/server/db/client';
import { registerComposer } from './compose';
import { absoluteUrl, button, layout, paragraph, textFooter } from './templates';

/**
 * L'annonce de la date retenue (FR-042, contracts/emails.md).
 *
 * Un email par répondant CONNECTÉ - le service ne connaît pas l'adresse d'un
 * pseudo -, dédoublonné, créateur exclu. Mis en file DANS la transaction de la
 * clôture : il n'existe que si la clôture a eu lieu.
 */
export async function enqueueRetainedDayAnnouncements(
  tx: Tx,
  poll: { id: string; ownerId: string },
  day: Day,
): Promise<Array<{ id: string; sendAfter: Date }>> {
  const respondents = await tx.response.findMany({
    where: { pollId: poll.id, userId: { not: null, notIn: [poll.ownerId] } },
    select: { user: { select: { email: true } } },
    distinct: ['userId'],
  });
  const created: Array<{ id: string; sendAfter: Date }> = [];
  for (const { user } of respondents) {
    if (!user) continue;
    created.push(
      await tx.emailOutbox.create({
        data: { to: user.email, template: 'RETAINED_DAY', pollId: poll.id, payload: { day } },
        select: { id: true, sendAfter: true },
      }),
    );
  }
  return created;
}

/**
 * Composé au départ : si le sondage a été rouvert, ou sa date changée
 * entre-temps, l'annonce ne dit plus la vérité et elle est annulée - la
 * nouvelle date a sa propre annonce.
 */
registerComposer('RETAINED_DAY', async (entry) => {
  const day = (entry.payload as { day?: unknown }).day;
  if (!entry.pollId || typeof day !== 'string') return null;
  const poll = await prisma.poll.findUnique({
    where: { id: entry.pollId },
    select: { publicId: true, title: true, status: true, retainedDayId: true, days: { select: { id: true, day: true } } },
  });
  if (!poll || poll.status !== 'CLOSED' || !poll.retainedDayId) return null;
  const retained = poll.days.find((d) => d.id === poll.retainedDayId);
  if (!retained || dayFromDate(retained.day) !== day) return null;

  const when = formatLongDay(day);
  const link = absoluteUrl(`/s/${poll.publicId}`);
  const sentence = `La date retenue pour « ${poll.title} » est le ${when}.`;
  return {
    subject: `Date retenue pour « ${poll.title} » : ${when}`,
    text: ['Bonjour,', '', sentence, '', `Voir le sondage : ${link}`, textFooter()].join('\n'),
    html: layout([paragraph('Bonjour,'), paragraph(sentence), button(link, 'Voir le sondage')].join('')),
  };
});
