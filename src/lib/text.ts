/**
 * Assemblages de texte français - module PUR.
 */

/** « a », « a et b », « a, b et c ». */
export function enumerate(items: readonly string[]): string {
  if (items.length <= 1) return items[0] ?? '';
  return `${items.slice(0, -1).join(', ')} et ${items[items.length - 1]}`;
}

/** « 1 vote », « 3 votes » : le nom suit le nombre. */
export function plural(count: number, singular: string, pluralForm = `${singular}s`): string {
  return `${count} ${count > 1 ? pluralForm : singular}`;
}
