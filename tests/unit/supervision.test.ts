import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SUPERVISION_RETENTION } from '@/config/retention';
import { onRequestError } from '@/instrumentation';
import { isReportableError, SERVER_ERROR_EVENT, serverErrorLine } from '@/server/monitoring/server-errors';

/**
 * Ce que DatePlanner donne à la supervision (décision 044) : une ligne par
 * erreur serveur, le journal de ses seules unités, et la durée annoncée.
 */

const read = (...parts: string[]) => readFileSync(join(process.cwd(), ...parts), 'utf8');

describe('La ligne d’erreur que la supervision compte', () => {
  let written: string[] = [];
  beforeEach(() => {
    written = [];
    vi.spyOn(process.stderr, 'write').mockImplementation((chunk) => {
      written.push(String(chunk));
      return true;
    });
  });
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  const context = {
    routerKind: 'App Router',
    routePath: '/app/s/[publicId]/page',
    routeType: 'render',
    renderSource: 'server-rendering',
    revalidateReason: undefined,
    renderType: 'dynamic',
  } as const;
  const request = { path: '/s/abc123?jeton=secret', method: 'GET', headers: {} };

  it('ignore un visiteur parti avant la réponse', () => {
    expect(isReportableError(Object.assign(new Error('read ECONNRESET'), { code: 'ECONNRESET' }))).toBe(false);
    expect(isReportableError(new Error('aborted'))).toBe(false);
    expect(isReportableError(new Error('The destination stream closed early.'))).toBe(false);
    expect(isReportableError(new Error('Cannot read properties of undefined'))).toBe(true);
    expect(isReportableError('une chaîne')).toBe(true);
  });

  it('ignore le corps illisible d’une Server Action forgée', () => {
    expect(isReportableError(new TypeError('Failed to parse body as FormData.'))).toBe(false);
  });

  it('écrit une ligne par erreur, dans le processus Node seulement', async () => {
    vi.stubEnv('NEXT_RUNTIME', 'nodejs');
    await onRequestError(new Error('boum'), request, context);
    await onRequestError(new Error('aborted'), request, context);
    vi.stubEnv('NEXT_RUNTIME', 'edge');
    await onRequestError(new Error('boum'), request, context);

    const lines = written.filter((chunk) => chunk.includes(SERVER_ERROR_EVENT));
    expect(lines).toHaveLength(1);
    expect(lines[0]!.endsWith('\n')).toBe(true);
    expect(JSON.parse(lines[0]!)).toEqual({ event: 'server_error', route: '/app/s/[publicId]/page', type: 'render' });
    // Ni l'adresse demandée - le lien d'un sondage -, ni le message.
    expect(lines[0]).not.toContain('abc123');
    expect(lines[0]).not.toContain('boum');
  });

  it('dit où, jamais ce que dit l’erreur, sur une seule ligne', () => {
    const error = Object.assign(new Error('a@example.test introuvable'), { digest: '1234567' });
    const line = serverErrorLine(error, { routePath: '/app/compte/page', routeType: 'action' });
    expect(JSON.parse(line)).toEqual({ event: 'server_error', route: '/app/compte/page', type: 'action', digest: '1234567' });
    expect(line).not.toContain('a@example.test');
    expect(serverErrorLine(new Error('a\nb'), { routePath: '/x\ny', routeType: 'route' })).not.toContain('\n');
  });

  it('est celle de laserit.fr, que la même règle d’alerte compte', () => {
    expect(SERVER_ERROR_EVENT).toBe('server_error');
  });
});

describe('Ce qui quitte le conteneur pour la supervision', () => {
  it('la durée annoncée du journal est celle de journald', () => {
    expect(read('deploy', 'journald-dateplanner.conf')).toMatch(
      new RegExp(`^MaxRetentionSec=${SUPERVISION_RETENTION.logsDays}d\\s*$`, 'm'),
    );
  });

  it('seul le journal des unités de DatePlanner part', () => {
    const conf = read('deploy', 'supervision', 'dateplanner.alloy');
    const matches = conf.match(/^\s*matches\s*=\s*"([^"]*)"/m)?.[1];
    expect(matches).toBeDefined();
    for (const term of (matches ?? '').split(/\s+/)) {
      expect(term).toMatch(/^_SYSTEMD_UNIT=dateplanner(-maintenance|-backup)?\.service$/);
    }
    expect(conf).toMatch(/action\s*=\s*"keep"/);
  });

  it('Alloy ne rapporte pas son usage à Grafana Labs', () => {
    expect(read('deploy', 'supervision', 'alloy.default')).toMatch(/--disable-reporting/);
  });
});
