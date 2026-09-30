import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SESSION } from '@/config/limits';
import { RETENTION } from '@/config/retention';
import { addMonths, todayInParis } from '@/lib/paris-day';
import { getSessionUser } from '@/server/auth/session';
import { prisma } from '@/server/db/client';
import { runMaintenance } from '@/server/maintenance';
import { deleteExpiredPolls, deleteWarnedAccounts, warnInactiveAccounts } from '@/server/maintenance/retention';
import { deliver, purgeOldEmails } from '@/server/notifications/outbox';
import { testCookies } from '../setup';
import { resetDatabase } from '../helpers/db';
import { createPoll, createResponse, createSessionFor, createUser, dayFromToday } from '../helpers/factories';

/**
 * Les durées de conservation, appliquées par la maintenance (research.md R15).
 * Ce sont celles que la politique de confidentialité annonce.
 */

const DAY_MS = 86_400_000;

beforeEach(async () => {
  await resetDatabase();
  testCookies.clear();
  vi.spyOn(console, 'info').mockImplementation(() => undefined);
});

afterEach(() => {
  vi.restoreAllMocks();
});

function yearsAgo(years: number, extraDays = 0): Date {
  const date = new Date();
  date.setUTCFullYear(date.getUTCFullYear() - years);
  return new Date(date.getTime() - extraDays * DAY_MS);
}

/** Le jour `months` mois et `days` jours avant aujourd'hui (Paris). */
function dayBefore(months: number, days = 0): string {
  const date = new Date(`${addMonths(todayInParis(new Date()), -months)}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() - days);
  return date.toISOString().slice(0, 10);
}

describe('sondages', () => {
  it(`sont supprimés ${RETENTION.pollMonthsAfterLastDay} mois après leur dernier jour, pas avant`, async () => {
    const months = RETENTION.pollMonthsAfterLastDay;
    const expired = await createPoll({ days: [dayBefore(months + 2), dayBefore(months, 1)] });
    await createResponse({ poll: expired, days: [dayBefore(months, 1)] });
    const pending = await prisma.emailOutbox.create({
      data: { to: 'a@exemple.test', template: 'OWNER_DIGEST', pollId: expired.id, sendAfter: new Date(Date.now() + DAY_MS) },
    });
    const lastDayToday = await createPoll({ days: [dayBefore(months + 1), dayBefore(months)] });
    const recent = await createPoll({ days: [dayFromToday(-3)] });

    expect(await deleteExpiredPolls(new Date())).toBe(1);

    expect(await prisma.poll.findUnique({ where: { id: expired.id } })).toBeNull();
    expect(await prisma.response.count({ where: { pollId: expired.id } })).toBe(0);
    expect((await prisma.emailOutbox.findUniqueOrThrow({ where: { id: pending.id } })).status).toBe('CANCELLED');
    expect(await prisma.poll.findUnique({ where: { id: lastDayToday.id } })).not.toBeNull();
    expect(await prisma.poll.findUnique({ where: { id: recent.id } })).not.toBeNull();
  });

  it('un jour ajouté à un vieux sondage le garde', async () => {
    const poll = await createPoll({ days: [dayBefore(RETENTION.pollMonthsAfterLastDay + 1)] });
    await prisma.pollDay.create({ data: { pollId: poll.id, day: new Date(`${dayFromToday(5)}T00:00:00.000Z`) } });
    expect(await deleteExpiredPolls(new Date())).toBe(0);
  });
});

describe('comptes inactifs', () => {
  it(`sont prévenus après ${RETENTION.inactiveAccountYears} ans, une seule fois`, async () => {
    const idle = await createUser({ lastActiveAt: yearsAgo(RETENTION.inactiveAccountYears, 1) });
    const active = await createUser({ lastActiveAt: yearsAgo(RETENTION.inactiveAccountYears - 1) });

    const report = await runMaintenance();
    expect(report.retention.warned).toBe(1);
    expect(report.sent).toBe(1);

    const warning = await prisma.emailOutbox.findFirstOrThrow({ where: { template: 'INACTIVITY_WARNING' } });
    expect(warning).toMatchObject({ to: idle.email, status: 'SENT' });
    // Le délai de grâce part de l'envoi.
    const warned = await prisma.user.findUniqueOrThrow({ where: { id: idle.id } });
    expect(warned.inactivityWarnedAt).not.toBeNull();
    expect((await prisma.user.findUniqueOrThrow({ where: { id: active.id } })).inactivityWarnedAt).toBeNull();

    expect(await warnInactiveAccounts(new Date())).toBe(0);
    expect(await prisma.emailOutbox.count({ where: { template: 'INACTIVITY_WARNING' } })).toBe(1);
  });

  it('annoncent la date de suppression dans l’objet', async () => {
    const info = vi.mocked(console.info);
    await createUser({ lastActiveAt: yearsAgo(RETENTION.inactiveAccountYears, 1) });
    await runMaintenance();
    const printed = info.mock.calls.map((call) => String(call[0])).join('\n');
    expect(printed).toMatch(/Votre compte DatePlanner sera supprimé le \w+ \d{1,2} \w+ \d{4}/);
  });

  it('ne sont jamais supprimés sans avertissement parti', async () => {
    vi.stubEnv('EMAIL_DRIVER', 'inconnu');
    try {
      const idle = await createUser({ lastActiveAt: yearsAgo(RETENTION.inactiveAccountYears + 2) });
      await runMaintenance();
      const warning = await prisma.emailOutbox.findFirstOrThrow({ where: { template: 'INACTIVITY_WARNING' } });
      expect(warning.status).toBe('PENDING');
      expect((await prisma.user.findUniqueOrThrow({ where: { id: idle.id } })).inactivityWarnedAt).toBeNull();

      const later = new Date(Date.now() + (RETENTION.deletionDaysAfterWarning + 1) * DAY_MS);
      expect(await deleteWarnedAccounts(later)).toBe(0);
      // Tant qu'un avertissement attend, aucun autre n'est mis en file.
      expect(await warnInactiveAccounts(later)).toBe(0);
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it(`sont supprimés ${RETENTION.deletionDaysAfterWarning} jours après l’avertissement, avec leurs sondages`, async () => {
    const days = RETENTION.deletionDaysAfterWarning;
    const idle = await createUser({ lastActiveAt: yearsAgo(4) });
    await prisma.user.update({ where: { id: idle.id }, data: { inactivityWarnedAt: new Date(Date.now() - (days + 1) * DAY_MS) } });
    const poll = await createPoll({ owner: idle });
    const notYet = await createUser({ lastActiveAt: yearsAgo(4) });
    await prisma.user.update({ where: { id: notYet.id }, data: { inactivityWarnedAt: new Date(Date.now() - (days - 1) * DAY_MS) } });

    const report = await runMaintenance();
    expect(report.retention.accounts).toBe(1);
    expect(await prisma.user.findUnique({ where: { id: idle.id } })).toBeNull();
    expect(await prisma.poll.findUnique({ where: { id: poll.id } })).toBeNull();
    expect(await prisma.user.findUnique({ where: { id: notYet.id } })).not.toBeNull();
  });

  it('une visite après l’avertissement sauve le compte et annule l’avertissement en attente', async () => {
    const idle = await createUser({ lastActiveAt: yearsAgo(4) });
    await prisma.user.update({ where: { id: idle.id }, data: { inactivityWarnedAt: new Date(Date.now() - 5 * DAY_MS) } });
    testCookies.set(SESSION.cookieName, await createSessionFor(idle.id));
    expect(await getSessionUser()).not.toBeNull();

    const later = new Date(Date.now() + RETENTION.deletionDaysAfterWarning * DAY_MS);
    expect(await deleteWarnedAccounts(later)).toBe(0);
    expect(await prisma.user.findUnique({ where: { id: idle.id } })).not.toBeNull();

    // Un avertissement mis en file puis rattrapé par une visite ne part pas.
    const other = await createUser({ lastActiveAt: yearsAgo(4) });
    await warnInactiveAccounts(new Date());
    await prisma.user.update({ where: { id: other.id }, data: { lastActiveAt: new Date() } });
    const entry = await prisma.emailOutbox.findFirstOrThrow({ where: { template: 'INACTIVITY_WARNING' } });
    expect(await deliver(entry.id)).toBe(false);
    expect((await prisma.emailOutbox.findUniqueOrThrow({ where: { id: entry.id } })).status).toBe('CANCELLED');
  });
});

describe('emails', () => {
  it(`sont purgés ${RETENTION.sentEmailDays} jours après leur mise en file, sauf en attente`, async () => {
    const old = new Date(Date.now() - (RETENTION.sentEmailDays + 1) * DAY_MS);
    for (const status of ['SENT', 'CANCELLED', 'FAILED', 'PENDING'] as const) {
      await prisma.emailOutbox.create({ data: { to: 'a@exemple.test', template: 'OWNER_DIGEST', status, createdAt: old } });
    }
    await prisma.emailOutbox.create({ data: { to: 'b@exemple.test', template: 'OWNER_DIGEST', status: 'SENT' } });

    expect(await purgeOldEmails(new Date(Date.now() - RETENTION.sentEmailDays * DAY_MS))).toBe(3);
    const left = await prisma.emailOutbox.findMany({ select: { status: true, to: true } });
    expect(left).toEqual(expect.arrayContaining([{ status: 'PENDING', to: 'a@exemple.test' }, { status: 'SENT', to: 'b@exemple.test' }]));
    expect(left).toHaveLength(2);
  });
});
