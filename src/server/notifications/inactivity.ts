import { RETENTION } from '@/config/retention';
import { formatLongDay, todayInParis } from '@/lib/paris-day';
import { prisma } from '@/server/db/client';
import { registerComposer } from './compose';
import { absoluteUrl, button, layout, paragraph, textFooter } from './templates';

/**
 * L'avertissement avant suppression d'un compte inactif (contracts/emails.md,
 * hypothèse « Conservation » de la spec).
 *
 * Le délai de grâce court à partir de l'ENVOI, pas de la mise en file :
 * `inactivityWarnedAt` n'est posé qu'une fois l'email parti. Un email bloqué
 * par une panne de messagerie ne fait donc jamais supprimer un compte qui n'a
 * pas été prévenu.
 */

/** L'instant avant lequel une dernière activité rend un compte inactif. */
export function inactivityThreshold(now: Date): Date {
  const threshold = new Date(now);
  threshold.setUTCFullYear(threshold.getUTCFullYear() - RETENTION.inactiveAccountYears);
  return threshold;
}

/**
 * Composé au départ : un compte revenu entre-temps, ou supprimé, n'a plus
 * rien à apprendre - l'email est annulé.
 */
registerComposer('INACTIVITY_WARNING', async (entry) => {
  const userId = (entry.payload as { userId?: unknown }).userId;
  if (typeof userId !== 'string') return null;
  const now = new Date();
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { lastActiveAt: true, inactivityWarnedAt: true },
  });
  if (!user || user.inactivityWarnedAt || user.lastActiveAt >= inactivityThreshold(now)) return null;

  const deletion = formatLongDay(todayInParis(new Date(now.getTime() + RETENTION.deletionDaysAfterWarning * 86_400_000)));
  const link = absoluteUrl('/connexion');
  const years = RETENTION.inactiveAccountYears;
  const sentence = `Votre compte DatePlanner n’a pas servi depuis ${years} ans. Sans connexion d’ici le ${deletion}, il sera supprimé, avec vos sondages et vos réponses.`;
  const keep = 'Pour le conserver, il suffit de vous connecter.';

  return {
    subject: `Votre compte DatePlanner sera supprimé le ${deletion}`,
    text: ['Bonjour,', '', sentence, keep, '', link, textFooter()].join('\n'),
    html: layout([paragraph('Bonjour,'), paragraph(sentence), paragraph(keep), button(link, 'Me connecter')].join('')),
    // La condition répète celle du composeur : une connexion survenue pendant
    // l'envoi a remis le compte à zéro, et le délai ne doit pas démarrer.
    afterSend: async () => {
      await prisma.user.updateMany({
        where: { id: userId, inactivityWarnedAt: null, lastActiveAt: user.lastActiveAt },
        data: { inactivityWarnedAt: new Date() },
      });
    },
  };
});
