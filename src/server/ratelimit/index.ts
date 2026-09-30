import { headers } from 'next/headers';
import { RATE_LIMITS, type RateLimitRule } from '@/config/limits';
import { RETENTION } from '@/config/retention';
import { prisma } from '@/server/db/client';

/**
 * Limitation de débit à fenêtre glissante, stockée en base (research.md R11).
 *
 * Choix assumé : pas de Redis. Le volume attendu rend une table amplement
 * suffisante, et cela supprime un service à héberger, à surveiller et à
 * sécuriser. Si le trafic changeait d'ordre de grandeur, seul ce fichier
 * serait à réécrire - l'interface `consume` resterait identique.
 *
 * La fenêtre est réellement glissante : on compte les événements des N
 * dernières secondes, plutôt que de réinitialiser un compteur à heure fixe.
 * Une fenêtre fixe autoriserait le double du quota à cheval sur deux périodes.
 */

export type BucketName = keyof typeof RATE_LIMITS;

export type RateLimitVerdict = {
  allowed: boolean;
  /** Consommation actuelle sur la fenêtre, poids compris. */
  used: number;
  limit: number;
  /** Secondes à attendre avant que de la place se libère. */
  retryAfterSeconds: number;
};

/**
 * Neutralisation des compteurs pour le développement et les parcours de bout
 * en bout. La double condition est délibérée : un `NODE_ENV` valant
 * `production` la neutralise, si bien qu'un `.env` de développement recopié
 * par mégarde sur le serveur ne désarme pas l'anti-flood. L'environnement est
 * relu à chaque appel : une bascule pendant un test prend effet aussitôt.
 */
export function rateLimitDisabled(): boolean {
  return process.env.RATE_LIMIT_DISABLED === '1' && process.env.NODE_ENV !== 'production';
}

/**
 * Adresses exemptées de tout comptage (`RATE_LIMIT_ALLOWLIST`, séparées par
 * des virgules). Elle sert à l'exploitant, et vaut AUSSI en production : une
 * adresse précise y est nommée, pas un mode. La comparaison est EXACTE, jamais
 * un préfixe.
 */
function allowlistedIps(): ReadonlySet<string> {
  const raw = process.env.RATE_LIMIT_ALLOWLIST ?? '';
  return new Set(
    raw
      .split(',')
      .map((value) => value.trim())
      .filter((value) => value.length > 0),
  );
}

/** Vrai si une adresse est exemptée. Jamais `inconnue`, qui n'est pas une adresse. */
export function ipIsAllowlisted(ip: string): boolean {
  if (ip === UNKNOWN_IP) return false;
  return allowlistedIps().has(ip);
}

/**
 * L'adresse de la requête en cours est-elle exemptée ?
 *
 * Décidé ICI plutôt que dans chaque appelant : certains seaux comptent par
 * compte ou par sondage, et une exemption qui ne couvrirait que les seaux par
 * adresse laisserait l'exploitant bloqué ailleurs. `headers()` lève hors
 * d'une requête : pas de requête, pas d'adresse, pas d'exemption.
 */
async function requestIsAllowlisted(): Promise<boolean> {
  if (allowlistedIps().size === 0) return false;
  try {
    return ipIsAllowlisted(clientIp(await headers()));
  } catch {
    return false;
  }
}

function bypassVerdict(rule: RateLimitRule): RateLimitVerdict {
  return { allowed: true, used: 0, limit: rule.limit, retryAfterSeconds: 0 };
}

/**
 * Enregistre une consommation dans le seau `bucket` pour la clé `key` et dit
 * si elle est autorisée.
 *
 * L'événement est enregistré même lorsqu'il est refusé : qui insiste ne doit
 * pas voir sa fenêtre se vider plus vite.
 */
export async function consume(bucket: BucketName, key: string, weight = 1): Promise<RateLimitVerdict> {
  const rule = RATE_LIMITS[bucket];
  if (rateLimitDisabled()) return bypassVerdict(rule);
  if (await requestIsAllowlisted()) return bypassVerdict(rule);

  const since = new Date(Date.now() - rule.windowSeconds * 1000);

  const [aggregate] = await prisma.$transaction([
    prisma.rateLimitHit.aggregate({
      where: { bucket, key, at: { gte: since } },
      _sum: { weight: true },
    }),
    prisma.rateLimitHit.create({ data: { bucket, key, weight } }),
  ]);

  const used = (aggregate._sum.weight ?? 0) + weight;
  const allowed = used <= rule.limit;

  let retryAfterSeconds = 0;
  if (!allowed) {
    // Le plus ancien événement de la fenêtre dit quand de la place se libère.
    const oldest = await prisma.rateLimitHit.findFirst({
      where: { bucket, key, at: { gte: since } },
      orderBy: { at: 'asc' },
      select: { at: true },
    });
    const freeAt = (oldest?.at.getTime() ?? Date.now()) + rule.windowSeconds * 1000;
    retryAfterSeconds = Math.max(1, Math.ceil((freeAt - Date.now()) / 1000));
  }

  return { allowed, used, limit: rule.limit, retryAfterSeconds };
}

/** Efface les compteurs d'une clé - utilisé après une connexion réussie. */
export async function reset(bucket: BucketName, key: string): Promise<void> {
  await prisma.rateLimitHit.deleteMany({ where: { bucket, key } });
}

/** Purge des événements plus vieux que la plus longue fenêtre (maintenance). */
export async function purgeExpiredHits(now = new Date()): Promise<number> {
  const result = await prisma.rateLimitHit.deleteMany({
    where: { at: { lt: new Date(now.getTime() - RETENTION.rateLimitHitHours * 3600 * 1000) } },
  });
  return result.count;
}

/* -------------------------------------------------------------------------- */
/* Adresse du client                                                           */
/* -------------------------------------------------------------------------- */

/**
 * Adresse IP du client.
 *
 * LA PREMIÈRE VALEUR DE `X-Forwarded-For` EST ÉCRITE PAR LE CLIENT : la lire
 * reviendrait à le laisser choisir son propre seau. Seul est retenu ce que le
 * proxy a écrit LUI-MÊME :
 *  - `X-Real-IP`, que Traefik pose à partir de la connexion en retirant celui
 *    qu'envoie le visiteur ;
 *  - à défaut, la DERNIÈRE valeur de `X-Forwarded-For`, celle que le proxy le
 *    plus proche vient d'ajouter.
 *
 * Aucun en-tête : un marqueur constant plutôt que `null` - mieux vaut
 * regrouper les requêtes non identifiées dans un même seau que de ne pas les
 * limiter. Ce marqueur n'est jamais exempté.
 */
export const UNKNOWN_IP = 'inconnue';

export function clientIp(requestHeaders: Headers): string {
  const real = requestHeaders.get('x-real-ip')?.trim();
  if (real) return normalizeIp(real);

  const forwarded = requestHeaders.get('x-forwarded-for');
  if (forwarded) {
    const chain = forwarded.split(',');
    const last = chain[chain.length - 1]?.trim();
    if (last) return normalizeIp(last);
  }

  return UNKNOWN_IP;
}

/** L'adresse de la requête en cours, ou `inconnue` hors d'une requête. */
export async function currentIp(): Promise<string> {
  try {
    return clientIp(await headers());
  } catch {
    return UNKNOWN_IP;
  }
}

/**
 * Une adresse IPv4 a deux écritures, `::ffff:` en donne une seconde : deux
 * écritures pour un même visiteur, ce seraient deux seaux, donc le double du
 * quota - et une adresse exemptée ratée.
 */
function normalizeIp(ip: string): string {
  const mapped = /^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/i.exec(ip);
  return mapped?.[1] ?? ip;
}
