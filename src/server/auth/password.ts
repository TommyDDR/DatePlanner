import { hash, verify } from '@node-rs/argon2';
import { randomBytes } from 'node:crypto';

/**
 * Hachage des mots de passe.
 *
 * Argon2id avec les paramètres recommandés par l'OWASP (19 Mio de mémoire,
 * 2 itérations, parallélisme 1). Le sel est généré et embarqué par la
 * bibliothèque : le hachage stocké contient déjà tous les paramètres, ce qui
 * permettra de les durcir plus tard sans invalider les comptes existants.
 */
const ARGON2_OPTIONS = {
  memoryCost: 19_456,
  timeCost: 2,
  parallelism: 1,
} as const;

export async function hashPassword(plain: string): Promise<string> {
  return hash(plain, ARGON2_OPTIONS);
}

/**
 * Vérifie un mot de passe. Ne lève jamais : un hachage corrompu ou d'un
 * ancien format renvoie `false` plutôt que de faire échouer la connexion avec
 * une erreur serveur qui renseignerait un attaquant.
 */
export async function verifyPassword(storedHash: string, plain: string): Promise<boolean> {
  try {
    return await verify(storedHash, plain, ARGON2_OPTIONS);
  } catch {
    return false;
  }
}

/**
 * Vérifie un mot de passe sur un compte qui n'en a peut-être pas.
 *
 * Un compte né d'une connexion Google porte `passwordHash` à `null` : il n'y a
 * rien à comparer, et le geste est refusé. Le hachage factice est exécuté quand
 * même, pour que le refus coûte le même temps qu'une vérification réelle - sans
 * lui, la rapidité de la réponse dirait « ce compte n'a pas de mot de passe »,
 * c'est-à-dire « ce compte passe par Google ».
 */
export async function verifyOptionalPassword(
  storedHash: string | null,
  plain: string,
): Promise<boolean> {
  if (storedHash === null) {
    await fakeVerify(plain);
    return false;
  }
  return verifyPassword(storedHash, plain);
}

/**
 * Hachage factice, exécuté quand l'email saisi n'existe pas.
 *
 * Sans cela, une connexion sur un compte inconnu répondrait bien plus vite que
 * sur un compte existant, et cet écart de temps suffirait à énumérer les
 * adresses inscrites.
 */
let dummyHash: Promise<string> | null = null;

export async function fakeVerify(plain: string): Promise<void> {
  // Le hachage de référence est calculé une seule fois, à la première
  // tentative, à partir d'une valeur aléatoire : il est donc réellement
  // valide, et sa vérification coûte exactement le même temps qu'une
  // vérification sur un compte existant.
  dummyHash ??= hashPassword(randomBytes(32).toString('base64url'));
  try {
    await verify(await dummyHash, plain, ARGON2_OPTIONS);
  } catch {
    // Seul le temps de calcul nous intéresse ici.
  }
}
