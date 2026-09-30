import { Client } from 'pg';
import { LIVE_UPDATES } from '@/config/limits';
import { prisma } from '@/server/db/client';

/**
 * Bus d'événements « ce sondage a bougé » (research.md R8).
 *
 * Rôle : prévenir les pages déjà ouvertes sur un sondage qu'il vient de
 * changer, pour qu'elles se relisent d'elles-mêmes. Rien de plus. L'événement
 * ne transporte AUCUNE donnée du sondage - ni nom, ni vote - seulement de quoi
 * savoir quel sondage réveiller (constitution II).
 *
 * TRANSPORT
 *   PostgreSQL, `LISTEN`/`NOTIFY` : la base est déjà là, `pg_notify` est
 *   diffusé à l'émetteur lui-même (un seul chemin de publication), et un
 *   `NOTIFY` n'est délivré qu'au commit.
 *
 * GARANTIE
 *   Au mieux une fois, sans rattrapage : une notification émise pendant une
 *   coupure de l'écoute est perdue. C'est acceptable parce que le message ne
 *   porte pas d'information - il déclenche une relecture, et la page se relit
 *   aussi à la reconnexion.
 */

export type LiveEventKind =
  | 'responses' // réponse créée, modifiée, retirée ou supprimée
  | 'poll' // titre, description, jours, options, clôture ou réouverture
  | 'deleted'; // sondage supprimé

export type LiveEvent = {
  /** Identifiant INTERNE du sondage : sert au filtrage, jamais transmis au navigateur. */
  pollId: string;
  kind: LiveEventKind;
  at: string;
};

const KINDS: ReadonlySet<string> = new Set<LiveEventKind>(['responses', 'poll', 'deleted']);

/** Ce qui part réellement dans le navigateur : ni l'identifiant interne, ni rien d'autre. */
export function publicPayload(event: LiveEvent): { kind: LiveEventKind; at: string } {
  return { kind: event.kind, at: event.at };
}

/* -------------------------------------------------------------------------- */
/* Publication                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * Publie un événement.
 *
 * Ne lève jamais : prévenir les onglets ouverts est un confort, et une panne
 * du bus ne doit pas faire échouer une réponse déjà enregistrée. À appeler
 * APRÈS la transaction.
 */
export async function publish(pollId: string, kind: LiveEventKind): Promise<void> {
  const payload = JSON.stringify({ pollId, kind, at: new Date().toISOString() } satisfies LiveEvent);
  try {
    await prisma.$executeRaw`SELECT pg_notify(${LIVE_UPDATES.channel}::text, ${payload}::text)`;
  } catch (error) {
    console.error('Publication d’un événement en direct impossible :', error);
  }
}

/* -------------------------------------------------------------------------- */
/* Abonnement                                                                  */
/* -------------------------------------------------------------------------- */

export type Listener = (event: LiveEvent) => void;

type Hub = {
  /** Auditeurs par sondage : un événement ne réveille que les pages de SON sondage. */
  listeners: Map<string, Set<Listener>>;
  client: Client | null;
  connecting: Promise<void> | null;
  reconnect: NodeJS.Timeout | null;
};

/**
 * Le concentrateur vit sur `globalThis`, comme le client Prisma : en
 * développement, chaque rechargement de module rouvrirait sinon une connexion
 * d'écoute de plus.
 */
const globalForHub = globalThis as unknown as { liveHub?: Hub };

const hub: Hub =
  globalForHub.liveHub ??
  (globalForHub.liveHub = { listeners: new Map(), client: null, connecting: null, reconnect: null });

function listenerCount(): number {
  let count = 0;
  for (const set of hub.listeners.values()) count += set.size;
  return count;
}

/**
 * Abonne un auditeur aux événements d'UN sondage et renvoie de quoi se
 * désabonner. La connexion d'écoute est ouverte au premier abonné et refermée
 * quand le dernier s'en va.
 */
export function subscribe(pollId: string, listener: Listener): () => void {
  let set = hub.listeners.get(pollId);
  if (!set) hub.listeners.set(pollId, (set = new Set()));
  set.add(listener);
  void ensureConnected();

  let released = false;
  return () => {
    if (released) return;
    released = true;
    const current = hub.listeners.get(pollId);
    current?.delete(listener);
    if (current && current.size === 0) hub.listeners.delete(pollId);
    if (listenerCount() === 0) void disconnect();
  };
}

/** Attend que l'écoute soit établie : les tests doivent savoir quand une publication sera reçue. */
export function ready(): Promise<void> {
  return ensureConnected();
}

/** Ferme la connexion d'écoute. Utile aux tests, et au dernier désabonnement. */
export async function disconnect(): Promise<void> {
  if (hub.reconnect) {
    clearTimeout(hub.reconnect);
    hub.reconnect = null;
  }
  const client = hub.client;
  hub.client = null;
  hub.connecting = null;
  if (client) {
    client.removeAllListeners();
    await client.end().catch(() => undefined);
  }
}

function dispatch(event: LiveEvent): void {
  const set = hub.listeners.get(event.pollId);
  if (!set) return;
  // Une copie : un auditeur qui se désabonne en réagissant ne perturbe pas les autres.
  for (const listener of [...set]) {
    try {
      listener(event);
    } catch (error) {
      console.error('Auditeur d’événements en défaut :', error);
    }
  }
}

function ensureConnected(): Promise<void> {
  if (hub.client) return Promise.resolve();
  if (hub.connecting) return hub.connecting;

  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) return Promise.resolve();

  const client = new Client({ connectionString });

  const attempt = (async () => {
    await client.connect();
    client.on('notification', (message) => {
      if (message.channel !== LIVE_UPDATES.channel) return;
      const event = parseEvent(message.payload);
      if (event) dispatch(event);
    });
    // Une connexion perdue ne doit pas éteindre le direct : on repart, tant
    // qu'il reste quelqu'un à prévenir.
    client.on('error', () => scheduleReconnect(client));
    client.on('end', () => scheduleReconnect(client));
    // Le canal est un identifiant SQL : il ne se paramètre pas. Il est donc
    // constant, et vérifié plutôt qu'interpolé sur parole.
    await client.query(`LISTEN ${quoteIdentifier(LIVE_UPDATES.channel)}`);
    hub.client = client;
    hub.connecting = null;
  })().catch((error) => {
    console.error('Écoute des événements en direct impossible :', error);
    hub.connecting = null;
    client.removeAllListeners();
    void client.end().catch(() => undefined);
    scheduleReconnect(null);
  });

  hub.connecting = attempt;
  return attempt;
}

function scheduleReconnect(from: Client | null): void {
  if (from && hub.client !== from) return;
  if (hub.client === from) hub.client = null;
  if (listenerCount() === 0 || hub.reconnect) return;
  hub.reconnect = setTimeout(() => {
    hub.reconnect = null;
    if (listenerCount() > 0) void ensureConnected();
  }, LIVE_UPDATES.reconnectDelayMs);
  hub.reconnect.unref?.();
}

function parseEvent(payload: string | undefined): LiveEvent | null {
  if (!payload) return null;
  try {
    const parsed: unknown = JSON.parse(payload);
    if (typeof parsed !== 'object' || parsed === null) return null;
    const candidate = parsed as Partial<LiveEvent>;
    if (typeof candidate.pollId !== 'string') return null;
    if (typeof candidate.kind !== 'string' || !KINDS.has(candidate.kind)) return null;
    return {
      pollId: candidate.pollId,
      kind: candidate.kind,
      at: typeof candidate.at === 'string' ? candidate.at : new Date().toISOString(),
    };
  } catch {
    return null;
  }
}

function quoteIdentifier(name: string): string {
  if (!/^[a-z_][a-z0-9_]*$/i.test(name)) {
    throw new Error(`Nom de canal PostgreSQL invalide : ${name}`);
  }
  return `"${name}"`;
}
