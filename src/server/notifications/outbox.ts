import type { EmailTemplate, Prisma } from '@prisma/client';
import { OUTBOX } from '@/config/limits';
import { prisma, type Tx } from '@/server/db/client';
import { composeEmail } from './compose';
import { sendEmail } from './transport';
import './composers';

/**
 * File d'envoi des emails (research.md R10, FR-043).
 *
 * Un email n'est jamais envoyé pendant une transaction métier : il est mis en
 * file DANS la transaction - il n'existe que si l'action a réussi -, puis
 * expédié une fois la transaction validée. Une panne SMTP ne fait donc jamais
 * échouer l'action qui l'a déclenché ; la reprise est assurée par
 * `flushOutbox`, appelée par la maintenance.
 */

export type EnqueueInput = {
  to: string;
  template: EmailTemplate;
  /** Identifiants seulement : le contenu est composé au départ. */
  payload?: Record<string, string>;
  pollId?: string | null;
  sendAfter?: Date;
};

/**
 * Met un email en file.
 *
 * Hors transaction, l'envoi est tenté aussitôt (ou à l'heure dite). Dans une
 * transaction, l'entrée n'est pas encore visible des autres connexions : c'est
 * à l'appelant de lancer `deliverSoon` une fois la transaction validée.
 */
export async function enqueueEmail(input: EnqueueInput, db: Tx | typeof prisma = prisma): Promise<string> {
  const created = await db.emailOutbox.create({
    data: {
      to: input.to,
      template: input.template,
      payload: (input.payload ?? {}) as Prisma.InputJsonValue,
      pollId: input.pollId ?? null,
      sendAfter: input.sendAfter ?? new Date(),
    },
    select: { id: true, sendAfter: true },
  });
  if (db === prisma) deliverSoon(created.id, created.sendAfter);
  return created.id;
}

/**
 * Au-delà de ce délai, aucun minuteur n'est tenu en mémoire : la maintenance,
 * qui passe toutes les dix minutes, s'en charge. Un minuteur ne survit pas à
 * un redémarrage, et c'est très bien : la file, elle, est en base.
 */
const SCHEDULE_HORIZON_MS = 60 * 60 * 1000;

/** Tente l'envoi d'une entrée à l'heure dite, sans bloquer l'appelant. */
export function deliverSoon(id: string, sendAfter: Date = new Date()): void {
  const delay = sendAfter.getTime() - Date.now();
  if (delay <= 0) {
    void deliver(id).catch(() => undefined);
    return;
  }
  if (delay > SCHEDULE_HORIZON_MS) return;
  const timer = setTimeout(() => void deliver(id).catch(() => undefined), delay);
  // Un envoi en sursis ne doit pas retenir le processus (tests, arrêt).
  timer.unref?.();
}

/** Envoie une entrée précise. Renvoie `true` si elle est partie. */
export async function deliver(id: string): Promise<boolean> {
  const entry = await prisma.emailOutbox.findUnique({ where: { id } });
  // `PENDING` et rien d'autre : une entrée partie ne repart pas, une entrée
  // annulée ne part jamais, une entrée en échec attend qu'on s'en occupe.
  if (!entry || entry.status !== 'PENDING') return false;
  if (entry.sendAfter.getTime() > Date.now()) return false;

  try {
    const rendered = await composeEmail(entry);
    if (rendered === null) {
      await prisma.emailOutbox.updateMany({
        where: { id: entry.id, status: 'PENDING' },
        data: { status: 'CANCELLED' },
      });
      return false;
    }
    const { afterSend, ...email } = rendered;
    const result = await sendEmail({ to: entry.to, ...email });
    if (result.ok) {
      await prisma.emailOutbox.update({
        where: { id: entry.id },
        data: { status: 'SENT', sentAt: new Date(), attempts: entry.attempts + 1, lastError: null },
      });
      await afterSend?.();
      return true;
    }
    await markFailure(entry.id, entry.attempts + 1, result.error);
    return false;
  } catch (error) {
    await markFailure(entry.id, entry.attempts + 1, error instanceof Error ? error.message : 'Erreur inconnue.');
    return false;
  }
}

/**
 * Report exponentiel : 1, 2, 4, 8 minutes. Au-delà du plafond, l'entrée est
 * marquée en échec et reste consultable pour diagnostic.
 */
async function markFailure(id: string, attempts: number, message: string): Promise<void> {
  const exhausted = attempts >= OUTBOX.maxAttempts;
  await prisma.emailOutbox.update({
    where: { id },
    data: {
      attempts,
      lastError: message.slice(0, 500),
      status: exhausted ? 'FAILED' : 'PENDING',
      sendAfter: exhausted ? undefined : new Date(Date.now() + 2 ** attempts * 30_000),
    },
  });
}

/**
 * Annule les emails encore en attente d'un sondage (sondage supprimé).
 * La condition est dans le `WHERE` : un email déjà parti ne se rattrape pas.
 */
export async function cancelPendingForPoll(pollId: string, db: Tx | typeof prisma = prisma): Promise<number> {
  const { count } = await db.emailOutbox.updateMany({
    where: { pollId, status: 'PENDING' },
    data: { status: 'CANCELLED' },
  });
  return count;
}

/** Reprend toutes les entrées en attente dont l'heure est venue (maintenance). */
export async function flushOutbox(limit = 50): Promise<{ sent: number; failed: number }> {
  const pending = await prisma.emailOutbox.findMany({
    where: { status: 'PENDING', sendAfter: { lte: new Date() } },
    orderBy: { sendAfter: 'asc' },
    take: limit,
    select: { id: true },
  });
  let sent = 0;
  for (const entry of pending) {
    if (await deliver(entry.id)) sent += 1;
  }
  return { sent, failed: pending.length - sent };
}

/**
 * Purge des emails au-delà de leur durée de conservation : partis, annulés ou
 * en échec. Un échec garde l'adresse du destinataire ; il reste le temps d'un
 * diagnostic, pas davantage. Seul un email encore en attente est épargné.
 */
export async function purgeOldEmails(olderThan: Date): Promise<number> {
  const { count } = await prisma.emailOutbox.deleteMany({
    where: { status: { in: ['SENT', 'CANCELLED', 'FAILED'] }, createdAt: { lt: olderThan } },
  });
  return count;
}
