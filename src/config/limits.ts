/**
 * Limites et réglages du service, déclarés une seule fois.
 *
 * Les pages, les schémas de validation et le serveur lisent tous ces valeurs :
 * une limite recopiée à deux endroits finit toujours par diverger.
 */

/** Une fenêtre glissante anti-flood : `limit` unités autorisées par `windowSeconds`. */
export type RateLimitRule = { limit: number; windowSeconds: number };

/**
 * Seaux anti-flood (research.md R11, FR-038).
 *
 * `…PerIp` compte par adresse réseau, `…PerUser` par compte, `…PerAccount` par
 * adresse email visée, `…PerPollIp` par couple sondage et adresse.
 */
export const RATE_LIMITS = {
  loginPerIp: { limit: 10, windowSeconds: 900 },
  registerPerIp: { limit: 5, windowSeconds: 3600 },
  resetPerIp: { limit: 3, windowSeconds: 3600 },
  resetPerAccount: { limit: 3, windowSeconds: 3600 },
  pollCreatePerUser: { limit: 20, windowSeconds: 3600 },
  responsePerIp: { limit: 30, windowSeconds: 3600 },
  responsePerPollIp: { limit: 10, windowSeconds: 3600 },
  // Propre à la connexion Google : partagé avec `loginPerIp`, quelques
  // allers-retours vers Google épuiseraient le quota de connexion par mot de
  // passe de toute une sortie de réseau.
  googleSigninPerIp: { limit: 20, windowSeconds: 900 },
} as const satisfies Record<string, RateLimitRule>;

/** Verrou progressif d'un compte après des échecs de connexion répétés. */
export const LOGIN_LOCK = {
  /** Échecs tolérés avant le premier verrou. */
  freeAttempts: 5,
  /** Durée du premier verrou, doublée à chaque échec suivant. */
  baseLockSeconds: 60,
  /** Plafond d'un verrou. */
  maxLockSeconds: 3600,
} as const;

/** Session : cookie, échéance glissante, plafond absolu. */
export const SESSION = {
  cookieName: 'dp_session',
  /** Échéance glissante : trente jours d'inactivité. */
  maxAgeSeconds: 30 * 24 * 3600,
  /** La ligne en base n'est prolongée qu'au plus une fois par heure. */
  renewAfterSeconds: 3600,
  /** Plafond absolu depuis la connexion, activité ou non. */
  absoluteMaxAgeSeconds: 90 * 24 * 3600,
  /** Au-delà, une action sensible sans mot de passe exige une connexion récente. */
  recentLoginSeconds: 10 * 60,
} as const;

/** Cookie d'appareil d'un répondant sans compte (research.md R6). */
export const DEVICE = {
  cookieName: 'dp_appareil',
  /** Treize mois. */
  maxAgeSeconds: 396 * 24 * 3600,
} as const;

/** Mise à jour en direct des pages de sondage (research.md R8). */
export const LIVE_UPDATES = {
  /**
   * Canal PostgreSQL. Un identifiant, jamais un paramètre : `LISTEN` ne se
   * prépare pas. Il est donc figé ici et vérifié avant usage.
   */
  channel: 'dateplanner_live',
  /** Commentaire envoyé pour qu'aucun proxy ne coupe une connexion silencieuse. */
  heartbeatSeconds: 25,
  /** Le serveur ferme le flux au bout de ce délai ; le navigateur rouvre seul. */
  maxStreamMinutes: 55,
  /** Délai de reconnexion suggéré au navigateur (champ `retry` du flux). */
  reconnectDelayMs: 3000,
  /** Regroupement des relectures déclenchées par une rafale d'événements. */
  refreshDebounceMs: 300,
  /** Flux ouverts en même temps depuis une même adresse. */
  maxStreamsPerIp: 6,
} as const;

/** Bornes d'un sondage et des noms (data-model.md). */
export const POLL_LIMITS = {
  titleMax: 120,
  descriptionMax: 2000,
  pseudonymMax: 50,
  displayNameMax: 60,
  emailMax: 254,
  maxDays: 366,
  /** Au-delà, la liste des votants d'un jour se résume en « et N autres ». */
  votersShown: 20,
} as const;

/**
 * Mot de passe CHOISI (FR-002). Le plafond borne le coût du hachage : un
 * mot de passe d'un mégaoctet ferait travailler argon2 pour rien.
 */
export const PASSWORD = {
  min: 10,
  max: 128,
} as const;

/** Résumé des nouvelles réponses envoyé au créateur (FR-041). */
export const DIGEST = {
  /** Délai entre deux résumés d'un même sondage. */
  minIntervalMinutes: 30,
  /** Regroupement : le premier résumé part après ce délai. */
  firstDelayMinutes: 15,
} as const;

/** File d'envoi des emails (FR-043). */
export const OUTBOX = {
  maxAttempts: 5,
} as const;

/** Listes de l'administration (décision 042). */
export const ADMIN_LISTS = {
  /** Lignes par page. */
  pageSize: 20,
  /** Une recherche plus longue est tronquée : elle ne trouverait rien de plus. */
  searchMax: 100,
} as const;

/** Maintenance : au-delà de ce délai sans passage, la santé le signale. */
export const MAINTENANCE = {
  lateAfterMinutes: 30,
} as const;
