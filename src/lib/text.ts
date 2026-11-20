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

/**
 * Le compteur de participants d'un sondage (spécification 002, FR-004) :
 * « 1 participant », « 3 participants » ; à zéro, le même message que
 * « Qui est disponible ? ». Le nombre reste exact, sans abréviation.
 */
export function participantCountLabel(count: number): string {
  return count === 0 ? 'Personne n’a encore répondu' : plural(count, 'participant');
}
