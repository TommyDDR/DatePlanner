import { beforeEach, describe, expect, it } from 'vitest';
import { prisma } from '@/server/db/client';
import { resetDatabase } from '../helpers/db';
import { createPoll, createResponse, createUser, dayFromToday, sha256 } from '../helpers/factories';

/**
 * Les contraintes écrites à la main dans la migration initiale
 * (data-model.md) : c'est la base elle-même qui les tient, même si le code se
 * trompe.
 */

beforeEach(resetDatabase);

describe('poll', () => {
  it('refuse une date retenue sur un sondage ouvert', async () => {
    const poll = await createPoll();
    await expect(
      prisma.poll.update({ where: { id: poll.id }, data: { retainedDayId: poll.days[0]!.id } }),
    ).rejects.toThrow();
  });

  it("refuse une date retenue prise dans un autre sondage", async () => {
    const poll = await createPoll({ status: 'CLOSED' });
    const other = await createPoll();
    await expect(
      prisma.poll.update({ where: { id: poll.id }, data: { retainedDayId: other.days[0]!.id } }),
    ).rejects.toThrow();
  });

  it('accepte une date retenue du sondage quand il est clos', async () => {
    const poll = await createPoll({ status: 'CLOSED' });
    const updated = await prisma.poll.update({
      where: { id: poll.id },
      data: { retainedDayId: poll.days[1]!.id },
    });
    expect(updated.retainedDayId).toBe(poll.days[1]!.id);
  });
});

describe('response', () => {
  it('exige exactement une identité', async () => {
    const poll = await createPoll();
    const user = await createUser();
    await expect(
      prisma.response.create({ data: { pollId: poll.id, userId: user.id, pseudonym: 'Léa' } }),
    ).rejects.toThrow();
    await expect(prisma.response.create({ data: { pollId: poll.id, pseudonym: 'Léa' } })).rejects.toThrow();
    await expect(prisma.response.create({ data: { pollId: poll.id } })).rejects.toThrow();
  });

  it("n'admet qu'une réponse par compte et par appareil", async () => {
    const poll = await createPoll();
    const user = await createUser();
    await prisma.response.create({ data: { pollId: poll.id, userId: user.id } });
    await expect(prisma.response.create({ data: { pollId: poll.id, userId: user.id } })).rejects.toThrow();

    const device = sha256('appareil');
    await prisma.response.create({ data: { pollId: poll.id, pseudonym: 'A', deviceTokenHash: device } });
    await expect(
      prisma.response.create({ data: { pollId: poll.id, pseudonym: 'B', deviceTokenHash: device } }),
    ).rejects.toThrow();
  });
});

describe('vote', () => {
  it('refuse la suppression directe d’un jour voté', async () => {
    const poll = await createPoll();
    const day = dayFromToday(3);
    await createResponse({ poll, days: [day] });
    await expect(prisma.pollDay.delete({ where: { id: poll.days[0]!.id } })).rejects.toThrow();
  });

  it('laisse passer la cascade d’un sondage clos portant des votes et une date retenue', async () => {
    const poll = await createPoll({ status: 'CLOSED' });
    await createResponse({ poll, days: [dayFromToday(3), dayFromToday(4)] });
    await prisma.poll.update({ where: { id: poll.id }, data: { retainedDayId: poll.days[0]!.id } });

    await prisma.poll.delete({ where: { id: poll.id } });

    expect(await prisma.pollDay.count()).toBe(0);
    expect(await prisma.vote.count()).toBe(0);
  });

  it('laisse passer la cascade d’un compte dont les sondages portent des votes', async () => {
    const owner = await createUser();
    const poll = await createPoll({ owner });
    await createResponse({ poll, days: [dayFromToday(3)] });

    await prisma.user.delete({ where: { id: owner.id } });

    expect(await prisma.poll.count()).toBe(0);
    expect(await prisma.vote.count()).toBe(0);
  });
});

describe('email_outbox', () => {
  it("n'admet qu'un résumé en attente par sondage", async () => {
    const poll = await createPoll();
    const data = { to: 'a@exemple.test', template: 'OWNER_DIGEST' as const, pollId: poll.id };
    await prisma.emailOutbox.create({ data });
    await expect(prisma.emailOutbox.create({ data })).rejects.toThrow();
    await prisma.emailOutbox.create({ data: { ...data, status: 'SENT' } });
  });
});
