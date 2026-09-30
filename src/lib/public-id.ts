/**
 * Identifiant public d'un sondage - module PUR (research.md R7).
 *
 * 128 bits aléatoires en base64url : 22 caractères. C'est lui qui figure dans
 * le lien de partage, jamais l'identifiant interne. Toute valeur qui n'a pas
 * cette forme désigne un sondage introuvable, sans même interroger la base.
 */
export const PUBLIC_ID_PATTERN = /^[A-Za-z0-9_-]{22}$/;

export function isPublicId(value: string): boolean {
  return PUBLIC_ID_PATTERN.test(value);
}
