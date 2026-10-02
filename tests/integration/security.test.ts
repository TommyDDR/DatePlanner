import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { NextRequest } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { proxy } from '@/proxy';
import robots from '@/app/robots';
import { generateMetadata } from '@/app/s/[publicId]/page';
import { AvailabilityList } from '@/app/s/[publicId]/_sections/availability-list';
import { metadata as landingMetadata } from '@/app/page';
import { metadata as legalMetadata } from '@/app/mentions-legales/page';
import { metadata as privacyMetadata } from '@/app/confidentialite/page';
import { prisma } from '@/server/db/client';
import { composeEmail } from '@/server/notifications/compose';
import '@/server/notifications/composers';
import { getPollSynthesis } from '@/server/polls/read';
import { resetDatabase } from '../helpers/db';
import { createPoll, createResponse, createUser, dayFromToday } from '../helpers/factories';

/**
 * Sécurité des pages et des emails (FR-035, FR-037, constitution I).
 */

const HOSTILE_TITLE = '<script>alert("titre")</script> Dîner';
const HOSTILE_PSEUDO = '<img src=x onerror=alert(1)>';

beforeEach(resetDatabase);

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

function directive(policy: string | null, name: string): string {
  return (policy ?? '').split('; ').find((entry) => entry.startsWith(name)) ?? '';
}

describe('politique de sécurité des pages', () => {
  it('porte un nonce neuf par requête, sans « unsafe-inline », transmis au rendu', () => {
    const first = proxy(new NextRequest('https://dateplanner.laserit.fr/s/abc'));
    const second = proxy(new NextRequest('https://dateplanner.laserit.fr/'));
    const policy = first.headers.get('Content-Security-Policy');
    const scriptSrc = directive(policy, 'script-src');
    expect(scriptSrc).toMatch(/'nonce-[A-Za-z0-9+/]{22}=='/);
    expect(scriptSrc).not.toContain("'unsafe-inline'");
    expect(directive(policy, 'form-action')).toBe("form-action 'self'");
    expect(directive(policy, 'frame-ancestors')).toBe("frame-ancestors 'none'");
    expect(policy).not.toBe(second.headers.get('Content-Security-Policy'));

    // Next lit la politique et le nonce dans les en-têtes de la requête transmise.
    const nonce = /'nonce-([^']+)'/.exec(scriptSrc)![1];
    expect(first.headers.get('x-middleware-request-x-nonce')).toBe(nonce);
  });
});

describe('configuration de production', () => {
  async function productionConfig() {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('NEXT_PUBLIC_SITE_URL', 'https://dateplanner.laserit.fr');
    vi.stubEnv('EDITOR_NAME', 'Éditeur de test');
    vi.stubEnv('EDITOR_ADDRESS', '1 rue de l’Exemple 00000 Exempleville');
    vi.resetModules();
    return (await import('../../next.config')).default;
  }

  it('refuse de se charger sans l’identité de l’éditeur', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('NEXT_PUBLIC_SITE_URL', 'https://dateplanner.laserit.fr');
    vi.stubEnv('EDITOR_NAME', '');
    vi.stubEnv('EDITOR_ADDRESS', '');
    vi.resetModules();
    await expect(import('../../next.config')).rejects.toThrow('EDITOR_NAME');
  });

  it('renvoie tout accès en clair vers HTTPS, de façon permanente', async () => {
    const config = await productionConfig();
    const redirects = await config.redirects!();
    expect(redirects.length).toBeGreaterThan(0);
    for (const rule of redirects) {
      expect(rule.destination).toBe('https://dateplanner.laserit.fr/:path*');
      expect(rule.permanent).toBe(true);
    }
  });

  it('pose HSTS, interdit la mise en cadre, et une politique sans nonce ni script en ligne sur /api', async () => {
    const config = await productionConfig();
    const rules = await config.headers!();
    const all = rules.find((rule) => rule.source === '/:path*')!.headers;
    expect(all).toEqual(
      expect.arrayContaining([
        { key: 'Strict-Transport-Security', value: 'max-age=31536000' },
        { key: 'X-Frame-Options', value: 'DENY' },
        { key: 'X-Content-Type-Options', value: 'nosniff' },
      ]),
    );
    const api = rules.find((rule) => rule.source === '/api/:path*')!.headers[0]!.value;
    expect(directive(api, 'script-src')).toBe("script-src 'self'");
    expect(api).toContain('upgrade-insecure-requests');
  });
});

describe('indexation', () => {
  it('une page de sondage, connue ou non, n’est jamais indexée', async () => {
    const poll = await createPoll();
    for (const publicId of [poll.publicId, 'inconnu-inconnu-inconnu']) {
      const metadata = await generateMetadata({ params: Promise.resolve({ publicId }) });
      expect(metadata.robots).toEqual({ index: false, follow: false });
    }
  });

  it('robots.txt écarte les sondages et les espaces personnels', () => {
    const rules = robots().rules as { disallow: string[] };
    expect(rules.disallow).toEqual(expect.arrayContaining(['/s/', '/api/', '/compte', '/mes-sondages']));
  });

  it('seuls l’accueil et les pages légales s’indexent', () => {
    for (const metadata of [landingMetadata, legalMetadata, privacyMetadata]) {
      expect(metadata.robots).toEqual({ index: true, follow: true });
    }
  });
});

describe('titres et pseudos contenant du balisage', () => {
  async function hostilePoll() {
    const owner = await createUser({ email: 'proprio@exemple.test' });
    const respondent = await createUser({ displayName: HOSTILE_PSEUDO });
    const poll = await createPoll({ owner, title: HOSTILE_TITLE, days: [dayFromToday(3), dayFromToday(4)] });
    await createResponse({ poll, pseudonym: HOSTILE_PSEUDO, days: [dayFromToday(3)] });
    await createResponse({ poll, user: respondent, days: [dayFromToday(3)] });
    return poll;
  }

  function expectInert(html: string) {
    expect(html).not.toContain('<script>');
    expect(html).not.toContain('<img src=x');
  }

  it('s’affichent comme du texte dans la liste des disponibilités', async () => {
    const poll = await hostilePoll();
    const html = renderToStaticMarkup(
      createElement(AvailabilityList, { availability: await getPollSynthesis(poll.id), retainedDay: null }),
    );
    expectInert(html);
    expect(html).toContain('&lt;img src=x onerror=alert(1)&gt;');
  });

  it('restent un titre de page en texte brut, échappé par le rendu', async () => {
    const poll = await hostilePoll();
    const metadata = await generateMetadata({ params: Promise.resolve({ publicId: poll.publicId }) });
    expect(metadata.title).toBe(HOSTILE_TITLE);
  });

  it('sont échappés dans la branche HTML de chaque email', async () => {
    const poll = await hostilePoll();
    const day = dayFromToday(3);
    const retained = await prisma.pollDay.findFirstOrThrow({ where: { pollId: poll.id, day: new Date(`${day}T00:00:00.000Z`) } });
    await prisma.poll.update({ where: { id: poll.id }, data: { status: 'CLOSED', retainedDayId: retained.id, ownerDigestCursor: new Date(0) } });

    for (const template of ['OWNER_DIGEST', 'RETAINED_DAY'] as const) {
      const entry = await prisma.emailOutbox.create({
        data: { to: 'a@exemple.test', template, pollId: poll.id, payload: template === 'RETAINED_DAY' ? { day } : {} },
      });
      const email = await composeEmail(entry);
      expect(email, template).not.toBeNull();
      expectInert(email!.html);
      expect(email!.html).toContain('&lt;script&gt;alert(&quot;titre&quot;)&lt;/script&gt; Dîner');
      if (template === 'OWNER_DIGEST') expect(email!.html).toContain('&lt;img src=x onerror=alert(1)&gt;');
    }
  });
});
