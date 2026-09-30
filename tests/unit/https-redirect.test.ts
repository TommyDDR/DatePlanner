import type { IncomingMessage } from 'node:http';
import { matchHas } from 'next/dist/shared/lib/router/utils/prepare-destination';
import { describe, expect, it } from 'vitest';
import { httpsRedirects } from '@/lib/https-redirect';

/**
 * Les règles rendues, jugées par le MÊME comparateur que le routeur de Next :
 * une requête est renvoyée si l'une d'elles la retient.
 */
function redirected(headers: Record<string, string>): boolean {
  const req = { headers } as unknown as IncomingMessage;
  return httpsRedirects('https://dateplanner.laserit.fr', true).some(
    (rule) => matchHas(req, {}, rule.has, rule.missing) !== false,
  );
}

describe('redirection vers HTTPS', () => {
  it("ne redirige rien hors production : le développement se sert en clair sur localhost", () => {
    expect(httpsRedirects('http://localhost:3000', false)).toEqual([]);
  });

  it("renvoie ce que le proxy a reçu en clair vers l'adresse publique", () => {
    const [viaProxy] = httpsRedirects('https://dateplanner.laserit.fr', true);
    expect(viaProxy).toMatchObject({
      source: '/:path*',
      has: [{ type: 'header', key: 'x-forwarded-proto', value: 'http' }],
      destination: 'https://dateplanner.laserit.fr/:path*',
      permanent: true,
    });
  });

  it("renvoie un accès direct à Next, sauf depuis la machine elle-même", () => {
    const [, direct] = httpsRedirects('https://dateplanner.laserit.fr', true);
    expect(direct?.missing?.[0]).toEqual({ type: 'header', key: 'x-forwarded-proto' });
    const loopback = new RegExp(`^${(direct?.missing?.[1] as { value: string }).value}$`);
    for (const host of ['localhost', '127.0.0.1', '[']) expect(loopback.test(host)).toBe(true);
    for (const host of ['dateplanner.laserit.fr', '192.168.1.20', 'localhost.evil.test']) {
      expect(loopback.test(host)).toBe(false);
    }
  });

  it("renvoie ce qui arrive en clair, laisse passer ce qui arrive en HTTPS", () => {
    expect(redirected({ host: 'dateplanner.laserit.fr', 'x-forwarded-proto': 'http' })).toBe(true);
    expect(redirected({ host: 'dateplanner.laserit.fr:3000' })).toBe(true);
    expect(redirected({ host: '192.168.1.53:3000' })).toBe(true);
    expect(redirected({ host: 'dateplanner.laserit.fr', 'x-forwarded-proto': 'https' })).toBe(false);
    expect(redirected({ host: '127.0.0.1:3000' })).toBe(false);
  });

  it("laisse passer la requête que Next s'adresse à lui-même pour optimiser une image", () => {
    // `fetchInternalImage` relit une image locale par une requête simulée
    // SANS AUCUN en-tête : renvoyée en 308, `/_next/image` rendrait du texte.
    expect(redirected({})).toBe(false);
  });

  it("vise l'origine publique, jamais un chemin ni un port recopié", () => {
    const redirects = httpsRedirects('https://dateplanner.laserit.fr/', true);
    expect(redirects.every((r) => r.destination === 'https://dateplanner.laserit.fr/:path*')).toBe(true);
  });

  it("refuse de démarrer en production sur une adresse publique en clair", () => {
    expect(() => httpsRedirects('http://dateplanner.laserit.fr:3000', true)).toThrow(/https/);
  });
});
