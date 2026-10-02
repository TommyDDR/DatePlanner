import { beforeEach, describe, expect, it } from 'vitest';
import { prisma } from '@/server/db/client';
import { resetDatabase } from '../helpers/db';
import { createPoll, createResponse, createUser, dayFromToday, retainDays, sha256 } from '../helpers/factories';

/**
 * Les contraintes écrites à la main dans la migration initiale
 * (data-model.md) : c'est la base elle-même qui les tient, même si le code se
 * trompe.
 */

beforeEach(resetDatabase);

describe('retained_day', () => {
  it('refuse une date retenue sur un sondage ouvert', async () => {
    const poll = await createPoll();
    await expect(prisma.retainedDay.create({ data: { pollId: poll.id, pollDayId: poll.days[0]!.id } })).rejects.toThrow();
    await expect(
      prisma.retainedDay.create({ data: { pollId: poll.id, pollDayId: poll.days[0]!.id, pollStatus: 'OPEN' } }),
    ).rejects.toThrow();
  });

  it('refuse de rouvrir un sondage qui garde des dates retenues', async () => {
    const poll = await createPoll({ status: 'CLOSED' });
    await retainDays(poll, [dayFromToday(3)]);
    await expect(prisma.poll.update({ where: { id: poll.id }, data: { status: 'OPEN' } })).rejects.toThrow();
  });

  it("refuse une date retenue prise dans un autre sondage", async () => {
    const poll = await createPoll({ status: 'CLOSED' });
    const other = await createPoll({ status: 'CLOSED' });
    await expect(prisma.retainedDay.create({ data: { pollId: poll.id, pollDayId: other.days[0]!.id } })).rejects.toThrow();
  });

  it('accepte plusieurs dates retenues du sondage quand il est clos', async () => {
    const poll = await createPoll({ status: 'CLOSED' });
    await prisma.retainedDay.createMany({
      data: [poll.days[0]!, poll.days[2]!].map((day) => ({ pollId: poll.id, pollDayId: day.id })),
    });
    expect(await prisma.retainedDay.count({ where: { pollId: poll.id } })).toBe(2);
  });

  it('refuse la suppression directe d’un jour retenu', async () => {
    const poll = await createPoll({ status: 'CLOSED' });
    await retainDays(poll, [dayFromToday(3)]);
    await expect(prisma.pollDay.delete({ where: { id: poll.days[0]!.id } })).rejects.toThrow();
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

  it('laisse passer la cascade d’un sondage clos portant des votes et des dates retenues', async () => {
    const poll = await createPoll({ status: 'CLOSED', multipleRetainedDays: true });
    await createResponse({ poll, days: [dayFromToday(3), dayFromToday(4)] });
    await retainDays(poll, [dayFromToday(3), dayFromToday(5)]);

    await prisma.poll.delete({ where: { id: poll.id } });

    expect(await prisma.pollDay.count()).toBe(0);
    expect(await prisma.vote.count()).toBe(0);
    expect(await prisma.retainedDay.count()).toBe(0);
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
