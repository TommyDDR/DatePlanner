import { RETENTION } from '@/config/retention';
import { prisma } from '@/server/db/client';
import { hashToken } from '@/server/auth/session';
import { registerComposer } from './compose';
import { absoluteUrl, button, layout, paragraph, textFooter } from './templates';

/**
 * Email `PASSWORD_RESET` (contracts/emails.md).
 *
 * Composé au départ : si le lien a déjà servi ou expiré entre-temps, l'email
 * n'a plus d'objet et il est annulé.
 */
registerComposer('PASSWORD_RESET', async (entry) => {
  const token = (entry.payload as { token?: unknown }).token;
  if (typeof token !== 'string') return null;

  const record = await prisma.passwordResetToken.findUnique({
    where: { tokenHash: hashToken(token) },
    select: { usedAt: true, expiresAt: true },
  });
  if (!record || record.usedAt || record.expiresAt.getTime() < Date.now()) return null;

  const link = absoluteUrl(`/reinitialisation?jeton=${encodeURIComponent(token)}`);
  const minutes = RETENTION.passwordResetMinutes;
  const intro = `Pour choisir un nouveau mot de passe, ouvrez ce lien. Il reste valable ${minutes} minutes et ne sert qu’une fois.`;
  const notMe = 'Si vous n’êtes pas à l’origine de cette demande, ignorez cet email : votre mot de passe ne change pas.';

  return {
    subject: 'Réinitialiser votre mot de passe DatePlanner',
    text: ['Bonjour,', '', intro, '', link, '', notMe, textFooter()].join('\n'),
    html: layout(
      [paragraph('Bonjour,'), paragraph(intro), button(link, 'Choisir un nouveau mot de passe'), paragraph(notMe)].join(''),
    ),
  };
});
