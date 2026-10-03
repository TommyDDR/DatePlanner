/**
 * Comptes administrateurs (décision 042).
 *
 * Leurs adresses vivent dans `.env`, jamais dans le dépôt, qui est public :
 * `ADMIN_EMAILS`, séparées par des virgules. Elle est lue à chaque appel,
 * jamais gravée au build : la changer demande un redémarrage, pas un nouveau
 * build. Pas de préfixe `NEXT_PUBLIC_` : seul le serveur la lit.
 */
export const ADMIN_ENV = 'ADMIN_EMAILS';

type Env = Record<string, string | undefined>;

/** Les adresses déclarées, en minuscules comme en base ; vide ou absente : aucune. */
export function readAdminEmails(env: Env = process.env): ReadonlySet<string> {
  return new Set(
    (env[ADMIN_ENV] ?? '')
      .split(',')
      .map((email) => email.trim().toLowerCase())
      .filter((email) => email !== ''),
  );
}

/**
 * Un compte est administrateur si son adresse est déclarée ET prouvée - par
 * Google, ou par un lien envoyé à l'adresse et utilisé.
 *
 * L'inscription ne vérifie pas l'adresse : sans la preuve, il suffirait de
 * s'inscrire avec l'adresse de l'administrateur avant lui pour l'être. Un tel
 * compte reste un compte ordinaire, et la connexion Google du vrai titulaire
 * le lui reprend (FR-003).
 */
export function isAdminAccount(
  account: { email: string; emailProvedAt: Date | null },
  env: Env = process.env,
): boolean {
  return account.emailProvedAt !== null && readAdminEmails(env).has(account.email.toLowerCase());
}
