import { dayFromDate, formatLongDay, type Day } from '@/lib/paris-day';
import { prisma, type Tx } from '@/server/db/client';
import { registerComposer } from './compose';
import { absoluteUrl, button, layout, paragraph, textFooter } from './templates';

/**
 * L'annonce des dates retenues (FR-042, contracts/emails.md).
 *
 * Un email par répondant CONNECTÉ - le service ne connaît pas l'adresse d'un
 * pseudo -, dédoublonné, créateur exclu. Mis en file DANS la transaction de la
 * clôture : il n'existe que si la clôture a eu lieu. Il porte TOUTES les dates
 * retenues, triées.
 */
export async function enqueueRetainedDayAnnouncements(
  tx: Tx,
  poll: { id: string; ownerId: string },
  days: readonly Day[],
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
        data: { to: user.email, template: 'RETAINED_DAY', pollId: poll.id, payload: { days: [...days] } },
        select: { id: true, sendAfter: true },
      }),
    );
  }
  return created;
}

/** Les dates d'une annonce. `{ day }` : une annonce mise en file avant les dates multiples. */
function announcedDays(payload: unknown): string[] | null {
  const { days, day } = (payload ?? {}) as { days?: unknown; day?: unknown };
  if (Array.isArray(days) && days.length > 0 && days.every((d) => typeof d === 'string')) return [...days].sort();
  return typeof day === 'string' ? [day] : null;
}

/**
 * Composé au départ : si le sondage a été rouvert, ou ses dates changées
 * entre-temps, l'annonce ne dit plus la vérité et elle est annulée - les
 * nouvelles dates ont leur propre annonce.
 */
registerComposer('RETAINED_DAY', async (entry) => {
  const days = announcedDays(entry.payload);
  if (!entry.pollId || !days) return null;
  const poll = await prisma.poll.findUnique({
    where: { id: entry.pollId },
    select: {
      publicId: true,
      title: true,
      status: true,
      days: { where: { retained: { isNot: null } }, orderBy: { day: 'asc' }, select: { day: true } },
    },
  });
  if (!poll || poll.status !== 'CLOSED') return null;
  if (poll.days.map((d) => dayFromDate(d.day)).join(',') !== days.join(',')) return null;

  const link = absoluteUrl(`/s/${poll.publicId}`);
  const when = days.map(formatLongDay);
  const subject =
    days.length === 1
      ? `Date retenue pour « ${poll.title} » : ${when[0]}`
      : `${days.length} dates retenues pour « ${poll.title} »`;
  const sentence =
    days.length === 1
      ? `La date retenue pour « ${poll.title} » est le ${when[0]}.`
      : [`Les dates retenues pour « ${poll.title} » sont :`, ...when.map((day) => `- le ${day}`)].join('\n');
  return {
    subject,
    text: ['Bonjour,', '', sentence, '', `Voir le sondage : ${link}`, textFooter()].join('\n'),
    html: layout([paragraph('Bonjour,'), paragraph(sentence), button(link, 'Voir le sondage')].join('')),
  };
});
