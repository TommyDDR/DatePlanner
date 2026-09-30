import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import fixture from '../fixtures/laserit-tokens.json';

/**
 * L'identité visuelle reprend celle de laserit.fr (FR-031) : mêmes jetons de
 * couleur, clair et sombre, mêmes polices, mêmes rayons. Un jeton retouché
 * ici sans l'être là-bas ferait diverger les deux sites sans que personne le
 * décide.
 */

function themeTokens(css: string): Map<string, string> {
  const block = /@theme\s*\{([\s\S]*?)\n\}/.exec(css)?.[1] ?? '';
  const tokens = new Map<string, string>();
  for (const match of block.matchAll(/(--[a-z0-9-]+)\s*:\s*([^;]+);/g)) {
    tokens.set(match[1]!, match[2]!.replace(/\s+/g, ' ').trim());
  }
  return tokens;
}

describe('jetons visuels', () => {
  const tokens = themeTokens(readFileSync('src/app/globals.css', 'utf8'));

  it.each(Object.entries(fixture.tokens))('reprend %s de laserit.fr', (name, value) => {
    expect(tokens.get(name)).toBe(value);
  });
});

describe('polices', () => {
  it('charge les polices de laserit.fr', () => {
    const layout = readFileSync('src/app/layout.tsx', 'utf8');
    for (const font of fixture.fonts) expect(layout).toMatch(new RegExp(`\\b${font}\\(`));
  });
});
