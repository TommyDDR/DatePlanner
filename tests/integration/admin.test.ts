import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SESSION } from '@/config/limits';
import { deleteUserAction } from '@/app/admin/actions';
import AdminPollsPage from '@/app/admin/sondages/page';
import AdminUsersPage from '@/app/admin/utilisateurs/page';
import { parsePollListQuery, parseUserListQuery } from '@/lib/admin-query';
import { getAdminUser, type AdminUser } from '@/server/admin/access';
import { listPolls } from '@/server/admin/polls';
import { listUsers } from '@/server/admin/users';
import { prisma } from '@/server/db/client';
import { testCookies, TestRedirect } from '../setup';
import { resetDatabase } from '../helpers/db';
import {
  createPoll,
  createResponse,
  createSessionFor,
  createUser,
  dayFromToday,
  retainDays,
} from '../helpers/factories';

/** L'administration : accès, liste et suppression des comptes, liste des sondages (FR-046 à FR-048). */

const ADMIN_EMAIL = 'admin@exemple.test';

beforeEach(async () => {
  await resetDatabase();
  testCookies.clear();
  vi.stubEnv('ADMIN_EMAILS', ADMIN_EMAIL);
});

afterEach(() => {
  vi.unstubAllEnvs();
});

function form(values: Record<string, string>): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(values)) data.append(key, value);
  return data;
}

async function signIn(user: { id: string }) {
  testCookies.set(SESSION.cookieName, await createSessionFor(user.id));
}

/** L'administrateur, connecté. */
async function signInAdmin(): Promise<AdminUser> {
  const admin = await createUser({ email: ADMIN_EMAIL, displayName: 'Admin', emailProvedAt: new Date() });
  await signIn(admin);
  return (await getAdminUser())!;
}

async function redirectOf(promise: Promise<unknown>): Promise<string> {
  const error = await promise.catch((caught: unknown) => caught);
  expect(error).toBeInstanceOf(TestRedirect);
  return (error as TestRedirect).location;
}

describe('accès', () => {
  it('est réservé à une adresse déclarée et prouvée', async () => {
    expect(await getAdminUser()).toBeNull();

    const usurper = await createUser({ email: ADMIN_EMAIL, emailProvedAt: null });
    await signIn(usurper);
    expect(await getAdminUser()).toBeNull();

    await prisma.user.update({ where: { id: usurper.id }, data: { emailProvedAt: new Date() } });
    expect(await getAdminUser()).toMatchObject({ id: usurper.id, isAdmin: true });

    vi.stubEnv('ADMIN_EMAILS', '');
    expect(await getAdminUser()).toBeNull();
  });

  it('répond « introuvable » aux pages pour qui n’est pas administrateur', async () => {
    const pages = [AdminUsersPage, AdminPollsPage];
    for (const Page of pages) await expect(Page({ searchParams: Promise.resolve({}) })).rejects.toThrow('NOT_FOUND');

    await signIn(await createUser({ emailProvedAt: new Date() }));
    for (const Page of pages) await expect(Page({ searchParams: Promise.resolve({}) })).rejects.toThrow('NOT_FOUND');

    testCookies.clear();
    await signInAdmin();
    for (const Page of pages) await expect(Page({ searchParams: Promise.resolve({}) })).resolves.toBeTruthy();
  });
});

describe('suppression d’un compte', () => {
  it('emporte ses sondages, ses réponses et ses emails en attente, et revient sur la liste', async () => {
    await signInAdmin();
    const user = await createUser({ email: 'camille@exemple.test' });
    await createSessionFor(user.id);
    const own = await createPoll({ owner: user });
    await createResponse({ poll: own, pseudonym: 'Léa', days: [dayFromToday(3)] });
    const others = await createPoll();
    await createResponse({ poll: others, user, days: [dayFromToday(3)] });
    await createResponse({ poll: others, pseudonym: 'Noé', days: [dayFromToday(4)] });
    const before = (await prisma.poll.findUniqueOrThrow({ where: { id: others.id } })).activityAt;
    const digest = await prisma.emailOutbox.create({
      data: { to: 'proprio@exemple.test', template: 'OWNER_DIGEST', pollId: own.id, payload: { pollId: own.id } },
    });
    const reset = await prisma.emailOutbox.create({ data: { to: user.email, template: 'PASSWORD_RESET' } });

    const location = await redirectOf(deleteUserAction(null, form({ userId: user.id, q: 'cam', page: '2' })));

    expect(location).toBe('/admin/utilisateurs?q=cam&page=2&supprime=1');
    expect(await prisma.user.findUnique({ where: { id: user.id } })).toBeNull();
    expect(await prisma.poll.findUnique({ where: { id: own.id } })).toBeNull();
    expect(await prisma.session.count({ where: { userId: user.id } })).toBe(0);
    const remaining = await prisma.response.findMany({ where: { pollId: others.id } });
    expect(remaining.map((response) => response.pseudonym)).toEqual(['Noé']);
    const outbox = await prisma.emailOutbox.findMany({ where: { id: { in: [digest.id, reset.id] } } });
    expect(outbox.map((email) => email.status)).toEqual(['CANCELLED', 'CANCELLED']);
    // Une réponse a disparu du sondage d'un autre : du nouveau pour ses participants (FR-044).
    const after = (await prisma.poll.findUniqueOrThrow({ where: { id: others.id } })).activityAt;
    expect(after.getTime()).toBeGreaterThan(before.getTime());
  });

  it('ne supprime rien pour qui n’est pas administrateur', async () => {
    const user = await createUser();
    expect((await deleteUserAction(null, form({ userId: user.id })))?.error).toEqual({ code: 'NOT_FOUND' });

    await signIn(await createUser({ email: ADMIN_EMAIL, emailProvedAt: null }));
    expect((await deleteUserAction(null, form({ userId: user.id })))?.error).toEqual({ code: 'NOT_FOUND' });
    expect(await prisma.user.findUnique({ where: { id: user.id } })).not.toBeNull();
  });

  it('refuse le compte de l’administrateur lui-même et celui d’un autre administrateur', async () => {
    vi.stubEnv('ADMIN_EMAILS', `${ADMIN_EMAIL},second@exemple.test`);
    const admin = await signInAdmin();
    const second = await createUser({ email: 'second@exemple.test', emailProvedAt: new Date() });

    for (const target of [admin, second]) {
      expect((await deleteUserAction(null, form({ userId: target.id })))?.error).toMatchObject({ code: 'VALIDATION' });
      expect(await prisma.user.findUnique({ where: { id: target.id } })).not.toBeNull();
    }
  });

  it('supprime un compte qui porte une adresse d’administrateur jamais prouvée', async () => {
    vi.stubEnv('ADMIN_EMAILS', `${ADMIN_EMAIL},second@exemple.test`);
    await signInAdmin();
    const usurper = await createUser({ email: 'second@exemple.test', emailProvedAt: null });
    await redirectOf(deleteUserAction(null, form({ userId: usurper.id })));
    expect(await prisma.user.findUnique({ where: { id: usurper.id } })).toBeNull();
  });

  it('répond « introuvable » à un compte inconnu ou mal désigné', async () => {
    await signInAdmin();
    for (const userId of ['00000000-0000-4000-8000-000000000000', 'pas-un-uuid']) {
      expect((await deleteUserAction(null, form({ userId })))?.error).toEqual({ code: 'NOT_FOUND' });
    }
  });
});

describe('liste des utilisateurs', () => {
  it('cherche par nom ou adresse, sans tenir compte de la casse', async () => {
    const admin = await signInAdmin();
    await createUser({ email: 'lea.martin@exemple.test', displayName: 'Léa' });
    await createUser({ email: 'noe@exemple.test', displayName: 'Noé Martin' });
    await createUser({ email: 'zoe@exemple.test', displayName: 'Zoé' });

    const found = await listUsers(admin, parseUserListQuery({ q: 'MARTIN' }));
    expect(found.rows.map((user) => user.displayName).sort()).toEqual(['Léa', 'Noé Martin']);
    expect(found.total).toBe(2);
  });

  it('pagine, les plus récents d’abord, et décrit chaque compte', async () => {
    const admin = await signInAdmin();
    const base = Date.now() - 3_600_000;
    for (let i = 0; i < 22; i += 1) {
      const user = await createUser({ displayName: `Compte ${i}` });
      await prisma.user.update({ where: { id: user.id }, data: { createdAt: new Date(base + i * 1000) } });
    }
    const owner = await prisma.user.findFirstOrThrow({ where: { displayName: 'Compte 21' } });
    await createPoll({ owner });

    const first = await listUsers(admin, parseUserListQuery({}));
    expect(first).toMatchObject({ total: 23, page: 1, pageCount: 2 });
    expect(first.rows).toHaveLength(20);
    expect(first.rows[0]).toMatchObject({ displayName: 'Admin', isAdmin: true, isSelf: true, emailProved: true });
    expect(first.rows[1]).toMatchObject({ displayName: 'Compte 21', polls: 1, isAdmin: false, isSelf: false });

    const last = await listUsers(admin, parseUserListQuery({ page: '7' }));
    expect(last.page).toBe(2);
    expect(last.rows.map((user) => user.displayName)).toEqual(['Compte 2', 'Compte 1', 'Compte 0']);
  });
});

describe('liste des sondages', () => {
  async function names(admin: AdminUser, params: Record<string, string>): Promise<string[]> {
    return (await listPolls(admin, parsePollListQuery(params))).rows.map((poll) => poll.title);
  }

  it('filtre par état et par recherche sur le titre ou le créateur', async () => {
    const admin = await signInAdmin();
    const alice = await createUser({ email: 'alice@exemple.test', displayName: 'Alice' });
    await createPoll({ owner: alice, title: 'Pique-nique' });
    await createPoll({ title: 'Dîner de rentrée', status: 'CLOSED' });
    await createPoll({ title: 'Réunion' });

    expect((await names(admin, { etat: 'clos' }))).toEqual(['Dîner de rentrée']);
    expect((await names(admin, { etat: 'ouverts' })).sort()).toEqual(['Pique-nique', 'Réunion']);
    expect(await names(admin, { q: 'DÎNER' })).toEqual(['Dîner de rentrée']);
    expect(await names(admin, { q: 'alice@' })).toEqual(['Pique-nique']);
    expect(await names(admin, { q: 'alic' })).toEqual(['Pique-nique']);
  });

  it('filtre une période de création ou de clôture en jours de Paris, bornes comprises', async () => {
    const admin = await signInAdmin();
    // 22 h 30 UTC le 14 juillet : 0 h 30 le 15 à Paris.
    const late = await createPoll({ title: 'Le 15 à Paris' });
    await prisma.poll.update({ where: { id: late.id }, data: { createdAt: new Date('2026-07-14T22:30:00Z') } });
    const early = await createPoll({ title: 'Le 14', status: 'CLOSED' });
    await prisma.poll.update({
      where: { id: early.id },
      data: { createdAt: new Date('2026-07-14T10:00:00Z'), closedAt: new Date('2026-08-01T12:00:00Z') },
    });

    expect(await names(admin, { du: '2026-07-15', au: '2026-07-15' })).toEqual(['Le 15 à Paris']);
    expect(await names(admin, { au: '2026-07-14' })).toEqual(['Le 14']);
    expect(await names(admin, { periode: 'cloture', du: '2026-08-01' })).toEqual(['Le 14']);
    expect(await names(admin, { periode: 'cloture', au: '2026-07-31' })).toEqual([]);
  });

  it('filtre une période de jours proposés : un jour dans la période suffit', async () => {
    const admin = await signInAdmin();
    await createPoll({ title: 'Proche', days: [dayFromToday(2), dayFromToday(3)] });
    await createPoll({ title: 'À cheval', days: [dayFromToday(9), dayFromToday(30)] });
    await createPoll({ title: 'Lointain', days: [dayFromToday(60)] });

    const params = { periode: 'jours', du: dayFromToday(5), au: dayFromToday(10) };
    expect(await names(admin, params)).toEqual(['À cheval']);
    expect((await names(admin, { periode: 'jours', du: dayFromToday(30) })).sort()).toEqual(['Lointain', 'À cheval']);
  });

  it('trie par création, titre, répondants ou clôture, les sondages ouverts après les clos', async () => {
    const admin = await signInAdmin();
    const a = await createPoll({ title: 'Bravo' });
    const b = await createPoll({ title: 'Alpha', status: 'CLOSED' });
    const c = await createPoll({ title: 'Charlie', status: 'CLOSED' });
    await prisma.poll.update({ where: { id: a.id }, data: { createdAt: new Date('2026-01-01T12:00:00Z') } });
    await prisma.poll.update({
      where: { id: b.id },
      data: { createdAt: new Date('2026-02-01T12:00:00Z'), closedAt: new Date('2026-03-01T12:00:00Z') },
    });
    await prisma.poll.update({
      where: { id: c.id },
      data: { createdAt: new Date('2026-03-01T12:00:00Z'), closedAt: new Date('2026-02-15T12:00:00Z') },
    });
    for (const pseudonym of ['Léa', 'Noé']) await createResponse({ poll: a, pseudonym, days: [dayFromToday(3)] });
    await createResponse({ poll: c, days: [dayFromToday(3)] });

    expect(await names(admin, {})).toEqual(['Charlie', 'Alpha', 'Bravo']);
    expect(await names(admin, { sens: 'asc' })).toEqual(['Bravo', 'Alpha', 'Charlie']);
    expect(await names(admin, { tri: 'titre', sens: 'asc' })).toEqual(['Alpha', 'Bravo', 'Charlie']);
    expect(await names(admin, { tri: 'repondants' })).toEqual(['Bravo', 'Charlie', 'Alpha']);
    expect(await names(admin, { tri: 'cloture' })).toEqual(['Alpha', 'Charlie', 'Bravo']);
    expect(await names(admin, { tri: 'cloture', sens: 'asc' })).toEqual(['Charlie', 'Alpha', 'Bravo']);
  });

  it('pagine, et décrit chaque sondage', async () => {
    const admin = await signInAdmin();
    const owner = await createUser({ email: 'proprio@exemple.test', displayName: 'Proprio' });
    const days = [dayFromToday(3), dayFromToday(5), dayFromToday(8)];
    const closed = await createPoll({ owner, title: 'Le plus ancien', days, status: 'CLOSED' });
    await prisma.poll.update({ where: { id: closed.id }, data: { createdAt: new Date('2026-01-01T12:00:00Z') } });
    await retainDays(closed, [dayFromToday(5)]);
    await createResponse({ poll: closed, days: [dayFromToday(5)] });
    for (let i = 0; i < 21; i += 1) await createPoll({ owner, title: `Sondage ${i}` });

    const first = await listPolls(admin, parsePollListQuery({}));
    expect(first).toMatchObject({ total: 22, page: 1, pageCount: 2 });
    expect(first.rows).toHaveLength(20);

    const last = await listPolls(admin, parsePollListQuery({ page: '3' }));
    expect(last.page).toBe(2);
    expect(last.rows.at(-1)).toMatchObject({
      title: 'Le plus ancien',
      status: 'CLOSED',
      owner: { displayName: 'Proprio', email: 'proprio@exemple.test' },
      respondents: 1,
      dayCount: 3,
      firstDay: dayFromToday(3),
      lastDay: dayFromToday(8),
      retainedDays: [dayFromToday(5)],
    });
  });
});
