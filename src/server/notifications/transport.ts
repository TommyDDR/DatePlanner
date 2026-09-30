import nodemailer, { type Transporter } from 'nodemailer';

/**
 * Transport email (research.md R10).
 *
 * Abstraction volontaire : le reste de l'application ne connaît que
 * `sendEmail`. Passer de la console à un envoi réel ne demande que des
 * variables d'environnement.
 *
 * Trois pilotes :
 *   console  aucun envoi, l'email est écrit dans les logs (développement, tests) ;
 *   gmail    boîte Gmail, réglages connus, mot de passe d'application ;
 *   smtp     n'importe quel serveur, tout est donné à la main.
 *
 * Gmail (production) :
 *   EMAIL_DRIVER=gmail
 *   SMTP_USER=notificationslaserit@gmail.com
 *   SMTP_PASSWORD=<mot de passe d'application, 16 caractères>
 *   EMAIL_FROM=<facultatif : sert au nom affiché, l'adresse est celle du compte>
 */

export type OutgoingEmail = {
  to: string;
  subject: string;
  text: string;
  html: string;
  /** En-têtes supplémentaires : `List-Unsubscribe` d'un résumé. */
  headers?: Record<string, string>;
};

export type SendResult = { ok: true; driver: string } | { ok: false; error: string };

type Env = Record<string, string | undefined>;

/**
 * Réglages des fournisseurs connus. Ils PRIMENT sur `SMTP_HOST`, `SMTP_PORT` et
 * `SMTP_SECURE` : `EMAIL_DRIVER=gmail` décrit un fournisseur, pas un serveur au
 * hasard.
 */
const PRESETS: Record<string, { host: string; port: number; secure: boolean }> = {
  gmail: { host: 'smtp.gmail.com', port: 465, secure: true },
};

export type MailerConfig = {
  driver: string;
  host: string;
  port: number;
  secure: boolean;
  user: string;
  pass: string;
  /** En-tête `From` réellement présenté au serveur. */
  from: string;
};

export type MailerResolution = { ok: true; config: MailerConfig } | { ok: false; error: string };

function trimmed(value: string | undefined): string {
  return (value ?? '').trim();
}

/**
 * Sépare `Nom <adresse>`. Une valeur SANS chevrons et sans arobase est un NOM :
 * `EMAIL_FROM="DatePlanner"` coiffe l'adresse du compte Gmail.
 */
function splitAddress(value: string): { name: string | null; address: string } {
  const match = /^\s*(.*?)\s*<([^>]+)>\s*$/.exec(value);
  if (match) return { name: match[1] || null, address: (match[2] ?? '').trim() };
  const bare = value.trim();
  if (bare && !bare.includes('@')) return { name: bare, address: '' };
  return { name: null, address: bare };
}

function formatAddress(name: string | null, address: string): string {
  return name ? `${name} <${address}>` : address;
}

export function emailDriver(env: Env = process.env): string {
  return (env.EMAIL_DRIVER ?? 'console').trim().toLowerCase() || 'console';
}

/** Compose la configuration d'envoi à partir de l'environnement. Fonction PURE. */
export function resolveMailer(env: Env = process.env): MailerResolution {
  const driver = emailDriver(env);
  const preset = PRESETS[driver];

  const host = preset ? preset.host : trimmed(env.SMTP_HOST);
  const user = trimmed(env.SMTP_USER);
  // Google affiche le mot de passe d'application en quatre groupes de quatre :
  // recopié tel quel, il porte des espaces et l'authentification échoue.
  const pass = preset ? trimmed(env.SMTP_PASSWORD).replace(/\s+/g, '') : (env.SMTP_PASSWORD ?? '');

  const missing = [host ? null : 'SMTP_HOST', user ? null : 'SMTP_USER', pass ? null : 'SMTP_PASSWORD'].filter(
    (name): name is string => name !== null,
  );
  if (missing.length > 0) {
    return {
      ok: false,
      error: `EMAIL_DRIVER=${driver} mais ${missing.join(', ')} ${missing.length > 1 ? 'sont absentes' : 'est absente'}.`,
    };
  }

  const port = preset ? preset.port : Number(env.SMTP_PORT ?? 465);
  // Le port 465 impose TLS dès la connexion ; le 587 démarre en clair puis
  // passe en TLS (STARTTLS).
  const secure = preset ? preset.secure : env.SMTP_SECURE ? env.SMTP_SECURE === 'true' : port === 465;

  const declared = trimmed(env.EMAIL_FROM);
  const requested = declared ? splitAddress(declared) : { name: null, address: user };
  // Gmail RÉÉCRIT l'en-tête `From` avec l'adresse du compte authentifié : le
  // nom affiché est gardé, l'adresse est celle qui partira pour de bon.
  const address = preset ? user : requested.address || user;

  return {
    ok: true,
    config: { driver, host, port, secure, user, pass, from: formatAddress(requested.name, address) },
  };
}

/**
 * Qui achemine les emails, tel que la politique de confidentialité doit le
 * nommer (RGPD, article 13) - ou `null` quand rien ne part (pilote `console`).
 */
export function emailProcessor(env: Env = process.env): { name: string; outsideEu: boolean } | null {
  const driver = emailDriver(env);
  if (driver === 'gmail') {
    return {
      name: 'Google, par sa messagerie Gmail (Google Ireland Limited, avec des transferts possibles vers Google LLC aux États-Unis)',
      outsideEu: true,
    };
  }
  if (driver !== 'smtp') return null;
  const host = trimmed(env.SMTP_HOST).toLowerCase();
  return { name: `le fournisseur de messagerie du service (${host || 'serveur SMTP'})`, outsideEu: false };
}

let cached: { key: string; transporter: Transporter } | null = null;

function transporterFor(config: MailerConfig): Transporter {
  const key = [config.host, config.port, config.secure, config.user, config.pass].join('|');
  if (cached && cached.key === key) return cached.transporter;
  const transporter = nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: config.secure,
    auth: { user: config.user, pass: config.pass },
  });
  cached = { key, transporter };
  return transporter;
}

/**
 * Traduit l'échec en quelque chose d'actionnable : Gmail refuse le mot de
 * passe du compte comme une faute de frappe, seul un mot de passe
 * d'application passe.
 */
function explain(driver: string, message: string): string {
  const authFailure = /535|Username and Password not accepted|Invalid login|BadCredentials/i.test(message);
  if (driver === 'gmail' && authFailure) {
    return `${message} Gmail exige la validation en deux étapes ET un mot de passe d'application (16 caractères) dans SMTP_PASSWORD.`;
  }
  return message;
}

export async function sendEmail(email: OutgoingEmail): Promise<SendResult> {
  const driver = emailDriver();

  if (driver === 'console') {
    // En développement, l'email est écrit dans les logs : le flux complet reste
    // vérifiable sans service externe.
    console.info(
      ['', '─── EMAIL (pilote console) ───', `À      : ${email.to}`, `Objet  : ${email.subject}`, '', email.text, '──────────────────────────────', ''].join('\n'),
    );
    return { ok: true, driver: 'console' };
  }

  if (driver !== 'smtp' && !PRESETS[driver]) {
    return { ok: false, error: `EMAIL_DRIVER inconnu : « ${driver} ». Valeurs acceptées : console, gmail, smtp.` };
  }

  const resolved = resolveMailer();
  if (!resolved.ok) return { ok: false, error: resolved.error };

  try {
    await transporterFor(resolved.config).sendMail({
      from: resolved.config.from,
      to: email.to,
      subject: email.subject,
      text: email.text,
      html: email.html,
      ...(email.headers ? { headers: email.headers } : {}),
    });
    return { ok: true, driver };
  } catch (error) {
    return { ok: false, error: explain(driver, error instanceof Error ? error.message : 'Envoi SMTP échoué.') };
  }
}
