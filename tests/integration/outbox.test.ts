import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { prisma } from '@/server/db/client';
import { registerComposer } from '@/server/notifications/compose';
import { cancelPendingForPoll, deliver, enqueueEmail, flushOutbox } from '@/server/notifications/outbox';
import { escapeHtml } from '@/server/notifications/templates';
import { resetDatabase } from '../helpers/db';
import { createPoll } from '../helpers/factories';

/**
 * File d'envoi : un échec d'envoi ne bloque ni n'annule l'action qui l'a
 * déclenché (FR-043).
 */

let composed: 'email' | 'null' = 'email';

registerComposer('INACTIVITY_WARNING', async () =>
  composed === 'null' ? null : { subject: 'Objet', text: 'Texte', html: '<p>Texte</p>' },
);

beforeEach(async () => {
  await resetDatabase();
  composed = 'email';
  vi.spyOn(console, 'info').mockImplementation(() => undefined);
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

async function enqueueLater(): Promise<string> {
  // Dans le futur : `enqueueEmail` ne tente rien tout seul, le test décide.
  return enqueueEmail({ to: 'a@exemple.test', template: 'INACTIVITY_WARNING', sendAfter: new Date(Date.now() + 86_400_000) });
}

async function makeDue(id: string): Promise<void> {
  await prisma.emailOutbox.update({ where: { id }, data: { sendAfter: new Date(Date.now() - 1000) } });
}

describe('file d’envoi', () => {
  it('envoie une entrée due et la marque envoyée', async () => {
    vi.stubEnv('EMAIL_DRIVER', 'console');
    const id = await enqueueLater();
    await makeDue(id);
    expect(await deliver(id)).toBe(true);
    expect(await prisma.emailOutbox.findUniqueOrThrow({ where: { id } })).toMatchObject({ status: 'SENT', attempts: 1 });
  });

  it('n’envoie pas une entrée avant son heure', async () => {
    const id = await enqueueLater();
    expect(await deliver(id)).toBe(false);
    expect((await prisma.emailOutbox.findUniqueOrThrow({ where: { id } })).status).toBe('PENDING');
  });

  it('laisse l’entrée en attente, sans lever, quand l’envoi échoue', async () => {
    vi.stubEnv('EMAIL_DRIVER', 'smtp');
    vi.stubEnv('SMTP_HOST', '');
    const id = await enqueueLater();
    await makeDue(id);
    await expect(deliver(id)).resolves.toBe(false);
    const entry = await prisma.emailOutbox.findUniqueOrThrow({ where: { id } });
    expect(entry).toMatchObject({ status: 'PENDING', attempts: 1 });
    expect(entry.lastError).toMatch(/SMTP_HOST/);
    expect(entry.sendAfter.getTime()).toBeGreaterThan(Date.now());
  });

  it('abandonne après cinq essais', async () => {
    vi.stubEnv('EMAIL_DRIVER', 'smtp');
    vi.stubEnv('SMTP_HOST', '');
    const id = await enqueueLater();
    await prisma.emailOutbox.update({ where: { id }, data: { attempts: 4, sendAfter: new Date(Date.now() - 1000) } });
    await deliver(id);
    expect((await prisma.emailOutbox.findUniqueOrThrow({ where: { id } })).status).toBe('FAILED');
  });

  it('annule une entrée que le composeur juge sans objet', async () => {
    composed = 'null';
    const id = await enqueueLater();
    await makeDue(id);
    expect(await deliver(id)).toBe(false);
    expect((await prisma.emailOutbox.findUniqueOrThrow({ where: { id } })).status).toBe('CANCELLED');
  });

  it('annule les emails en attente d’un sondage supprimé, pas ceux déjà partis', async () => {
    const poll = await createPoll();
    await prisma.emailOutbox.create({ data: { to: 'a@x.test', template: 'OWNER_DIGEST', pollId: poll.id } });
    await prisma.emailOutbox.create({ data: { to: 'a@x.test', template: 'RETAINED_DAY', pollId: poll.id, status: 'SENT' } });
    expect(await cancelPendingForPoll(poll.id)).toBe(1);
  });

  it('reprend les entrées dues', async () => {
    vi.stubEnv('EMAIL_DRIVER', 'console');
    const a = await enqueueLater();
    const b = await enqueueLater();
    await makeDue(a);
    await makeDue(b);
    expect(await flushOutbox()).toEqual({ sent: 2, failed: 0 });
  });
});

describe('escapeHtml', () => {
  it('échappe le balisage d’une valeur saisie', () => {
    expect(escapeHtml('<a href="x">Léa & Co</a>')).toBe('&lt;a href=&quot;x&quot;&gt;Léa &amp; Co&lt;/a&gt;');
  });
});
