/**
 * « Du nouveau » sur un sondage (FR-044, décision 034).
 *
 * `activityAt` est la version courante du sondage, `seenAt` celle que le
 * compte a vue en dernier. Jamais vue, ou vue plus ancienne : du nouveau.
 */
export function hasNews(activityAt: Date, seenAt: Date | null): boolean {
  return seenAt === null || seenAt.getTime() < activityAt.getTime();
}
