/**
 * Les erreurs serveur, signalées à la supervision.
 *
 * Une page qui plante rend une page d'erreur au visiteur et écrit sa pile
 * dans le journal du serveur, que personne ne lit sans raison. Chaque erreur
 * que Next capte écrit donc AUSSI une ligne courte au journal, que la
 * supervision de l'hyperviseur compte et signale par email (alerte « Erreurs
 * serveur », `deploy/supervision/`, décision 044). La ligne est la même que
 * celle de laserit.fr : une seule règle les compte toutes deux.
 */

/** Le nom que la supervision cherche dans le journal. */
export const SERVER_ERROR_EVENT = 'server_error';

/**
 * Vrai si l'erreur dit quelque chose du service.
 *
 * Un visiteur qui ferme l'onglet pendant qu'une réponse part fait lever
 * `aborted` / `ECONNRESET`, et une page quittée EN COURS DE RENDU fait
 * abandonner le rendu à React, sans code : ce n'est pas une panne, et les
 * compter ferait sonner l'alerte à chaque redémarrage du service, quand les
 * onglets ouverts se relisent tous à la fois.
 */
const VISITOR_GONE_MESSAGES = new Set([
  'aborted',
  'The destination stream closed early.',
  'The destination stream errored while writing data.',
]);

export function isReportableError(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) return true;
  const code = 'code' in error ? String((error as { code: unknown }).code) : '';
  const message = error instanceof Error ? error.message : '';
  if (code === 'ECONNRESET' || code === 'EPIPE' || code === 'ERR_STREAM_PREMATURE_CLOSE') return false;
  return !VISITOR_GONE_MESSAGES.has(message);
}

/** Ce que Next dit de l'endroit où l'erreur est survenue (`onRequestError`). */
export type ServerErrorPlace = { routePath: string; routeType: string };

/**
 * La ligne que la supervision compte : une erreur, et OÙ - le fichier de la
 * route (`/app/s/[publicId]/page`) et sa nature (rendu, route, Server Action).
 *
 * Jamais le message, jamais l'adresse demandée : la seconde porte le lien
 * d'un sondage et une chaîne de requête, le premier tout ce que l'erreur aura
 * voulu dire. Next écrit déjà l'erreur entière dans le même journal ; cette
 * ligne n'est là que pour être comptée sans être lue, et son `digest` -
 * l'empreinte que Next donne à l'erreur - la relie à la pile écrite à côté.
 */
export function serverErrorLine(error: unknown, place: ServerErrorPlace): string {
  const digest =
    typeof error === 'object' && error !== null && 'digest' in error
      ? String((error as { digest: unknown }).digest).slice(0, 64)
      : undefined;
  return JSON.stringify({
    event: SERVER_ERROR_EVENT,
    route: place.routePath.slice(0, 200),
    type: place.routeType,
    ...(digest ? { digest } : {}),
  });
}

/**
 * Écrit la ligne dans le journal du service (la sortie d'erreur, que systemd
 * range dans journald). Ne lève jamais : appelée depuis le traitement d'une
 * erreur, elle ne doit pas en produire une seconde.
 */
export function logServerError(error: unknown, place: ServerErrorPlace): void {
  try {
    process.stderr.write(`${serverErrorLine(error, place)}\n`);
  } catch {
    // Une sortie fermée : rien de plus à faire.
  }
}
