import { describe, expect, it } from 'vitest';
import { isAdminAccount, readAdminEmails } from '@/config/admin';
import { ADMIN_LISTS } from '@/config/limits';
import {
  clampPage,
  pageCount,
  parsePollListQuery,
  parseUserListQuery,
  POLL_LIST_DEFAULTS,
  pollListHref,
  userListHref,
} from '@/lib/admin-query';

/** Comptes administrateurs et paramètres des listes de l'administration (décision 042). */

describe('comptes administrateurs', () => {
  it('lit les adresses de ADMIN_EMAILS, en minuscules, sans espaces ni vides', () => {
    expect([...readAdminEmails({ ADMIN_EMAILS: ' Admin@Exemple.test, ,autre@exemple.test,' })]).toEqual([
      'admin@exemple.test',
      'autre@exemple.test',
    ]);
    expect(readAdminEmails({ ADMIN_EMAILS: '' }).size).toBe(0);
    expect(readAdminEmails({}).size).toBe(0);
  });

  it('exige une adresse déclarée ET prouvée', () => {
    const env = { ADMIN_EMAILS: 'admin@exemple.test' };
    const proved = new Date();
    expect(isAdminAccount({ email: 'admin@exemple.test', emailProvedAt: proved }, env)).toBe(true);
    expect(isAdminAccount({ email: 'ADMIN@exemple.test', emailProvedAt: proved }, env)).toBe(true);
    // Inscrit avec l'adresse de l'administrateur, sans jamais l'avoir prouvée.
    expect(isAdminAccount({ email: 'admin@exemple.test', emailProvedAt: null }, env)).toBe(false);
    expect(isAdminAccount({ email: 'autre@exemple.test', emailProvedAt: proved }, env)).toBe(false);
    expect(isAdminAccount({ email: 'admin@exemple.test', emailProvedAt: proved }, {})).toBe(false);
  });
});

describe('pages d’une liste', () => {
  it('compte une page au moins, et ramène une page trop loin à la dernière', () => {
    expect(pageCount(0)).toBe(1);
    expect(pageCount(ADMIN_LISTS.pageSize)).toBe(1);
    expect(pageCount(ADMIN_LISTS.pageSize + 1)).toBe(2);
    expect(clampPage(9, ADMIN_LISTS.pageSize + 1)).toBe(2);
    expect(clampPage(1, 0)).toBe(1);
  });
});

describe('liste des utilisateurs', () => {
  it('lit la recherche et la page, et retombe sur les défauts', () => {
    expect(parseUserListQuery({ q: '  camille ', page: '3' })).toEqual({ q: 'camille', page: 3 });
    expect(parseUserListQuery({ page: '0' })).toEqual({ q: '', page: 1 });
    expect(parseUserListQuery({ page: 'deux' })).toEqual({ q: '', page: 1 });
    expect(parseUserListQuery({ q: ['a', 'b'], page: ['2', '5'] })).toEqual({ q: 'a', page: 2 });
    expect(parseUserListQuery({ q: 'x'.repeat(500) }).q).toHaveLength(ADMIN_LISTS.searchMax);
  });

  it('n’écrit dans l’adresse que ce qui s’écarte du défaut', () => {
    expect(userListHref({ q: '', page: 1 })).toBe('/admin/utilisateurs');
    expect(userListHref({ q: 'léa', page: 2 })).toBe('/admin/utilisateurs?q=l%C3%A9a&page=2');
    expect(userListHref({ q: '', page: 1 }, 'supprime')).toBe('/admin/utilisateurs?supprime=1');
  });
});

describe('liste des sondages', () => {
  it('retombe sur les défauts pour une valeur inconnue ou mal formée', () => {
    expect(parsePollListQuery({})).toEqual(POLL_LIST_DEFAULTS);
    expect(
      parsePollListQuery({ etat: 'brouillon', periode: 'hier', tri: 'hasard', sens: 'haut', du: '2026-02-30', au: 'demain' }),
    ).toEqual(POLL_LIST_DEFAULTS);
  });

  it('lit les filtres, le tri et la page', () => {
    expect(
      parsePollListQuery({
        q: 'dîner',
        etat: 'clos',
        periode: 'jours',
        du: '2026-10-01',
        au: '2026-10-31',
        tri: 'repondants',
        sens: 'asc',
        page: '4',
      }),
    ).toEqual({
      q: 'dîner',
      etat: 'clos',
      periode: 'jours',
      du: '2026-10-01',
      au: '2026-10-31',
      tri: 'repondants',
      sens: 'asc',
      page: 4,
    });
  });

  it('lit à l’endroit une période saisie à l’envers', () => {
    expect(parsePollListQuery({ du: '2026-12-01', au: '2026-11-01' })).toMatchObject({ du: '2026-11-01', au: '2026-12-01' });
  });

  it('refait l’adresse qu’il a lue', () => {
    const query = parsePollListQuery({ etat: 'ouverts', du: '2026-10-01', tri: 'titre', sens: 'asc', page: '2' });
    const href = pollListHref(query);
    expect(href).toBe('/admin/sondages?etat=ouverts&du=2026-10-01&tri=titre&sens=asc&page=2');
    expect(parsePollListQuery(Object.fromEntries(new URL(href, 'https://exemple.test').searchParams))).toEqual(query);
    expect(pollListHref(POLL_LIST_DEFAULTS)).toBe('/admin/sondages');
  });
});
