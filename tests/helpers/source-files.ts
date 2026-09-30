import { readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Le code de `src/`, relu par les tests qui portent une règle d'écriture
 * plutôt qu'un comportement : texte affiché, scripts en ligne.
 */

export const ROOT = join(__dirname, '..', '..', 'src');

export function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return /\.(ts|tsx)$/.test(name) ? [path] : [];
  });
}

/** Le code sans ses commentaires ; les sauts de ligne sont gardés. */
export function withoutComments(source: string): string {
  let out = '';
  let quote: string | null = null;
  for (let i = 0; i < source.length; i += 1) {
    const char = source[i]!;
    const next = source[i + 1];
    if (quote !== null) {
      out += char;
      if (char === '\\') {
        out += next ?? '';
        i += 1;
      } else if (char === quote) {
        quote = null;
      }
      continue;
    }
    if (char === '/' && next === '/') {
      while (i < source.length && source[i] !== '\n') i += 1;
      out += '\n';
      continue;
    }
    if (char === '/' && next === '*') {
      i += 2;
      while (i < source.length && !(source[i] === '*' && source[i + 1] === '/')) {
        if (source[i] === '\n') out += '\n';
        i += 1;
      }
      i += 1;
      continue;
    }
    if (char === "'" || char === '"' || char === '`') quote = char;
    out += char;
  }
  return out;
}
