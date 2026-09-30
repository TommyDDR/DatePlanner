import { readFileSync } from 'node:fs';
import { relative } from 'node:path';
import { describe, expect, it } from 'vitest';
import { contentSecurityPolicy } from '@/lib/csp';
import { ROOT, sourceFiles, withoutComments } from '../helpers/source-files';

/**
 * Ce que la politique de sécurité ne peut pas vérifier seule (constitution I,
 * FR-035) : le code de `src/` est relu pour qu'aucun script en ligne ne
 * dépende d'une exception, et qu'aucune valeur ne soit injectée comme HTML.
 */

const files = sourceFiles(ROOT).map((file) => ({
  name: relative(ROOT, file).replace(/\\/g, '/'),
  code: withoutComments(readFileSync(file, 'utf8')),
}));

function directive(policy: string, name: string): string {
  return policy.split('; ').find((entry) => entry.startsWith(name)) ?? '';
}

describe('politique de sécurité', () => {
  it('n’admet jamais de script en ligne sans nonce, en production comme ailleurs', () => {
    for (const isProduction of [true, false]) {
      for (const nonce of ['abc', null]) {
        const policy = contentSecurityPolicy({ nonce, isProduction });
        expect(directive(policy, 'script-src')).not.toContain("'unsafe-inline'");
        expect(directive(policy, 'default-src')).toBe("default-src 'self'");
      }
    }
  });
});

describe('le code de src/', () => {
  it('n’écrit aucune balise <script> sans le nonce de la requête', () => {
    // Admise si elle porte le nonce ou charge un fichier (`src=`, couvert par
    // la liste d'origines). Toute autre serait bloquée par la politique, en
    // silence pour le visiteur.
    const offending = files.flatMap(({ name, code }) =>
      [...code.matchAll(/<[sS]cript\b[^>]*>/g)].flatMap((match) =>
        /nonce|src=/.test(match[0]) ? [] : [`${name}: ${match[0]}`],
      ),
    );
    expect(offending).toEqual([]);
  });

  it('n’injecte du HTML brut que pour le script du thème, qui est une constante', () => {
    const raw = files.flatMap(({ name, code }) =>
      [...code.matchAll(/dangerouslySetInnerHTML=\{\{[^}]*\}\}/g)].map((match) => `${name}: ${match[0]}`),
    );
    expect(raw).toEqual(['components/theme-script.tsx: dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }}']);
  });

  it('ne passe par aucune API qui interprète une chaîne comme du HTML ou du code', () => {
    const forbidden = /\.(innerHTML|outerHTML)\s*=|insertAdjacentHTML|document\.write|\beval\(|new Function\(/;
    expect(files.filter(({ code }) => forbidden.test(code)).map(({ name }) => name)).toEqual([]);
  });
});
