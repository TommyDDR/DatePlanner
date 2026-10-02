/**
 * Identité du service et de son éditeur.
 *
 * Ces valeurs apparaissent dans les pages, les métadonnées, les mentions
 * légales et les emails. Elles sont déclarées UNE seule fois. Le nom et
 * l'adresse de l'éditeur, eux, vivent dans `.env` (`readEditor`).
 */

/** Domaine public du service. */
export const SITE_DOMAIN = 'dateplanner.laserit.fr';

/** Adresse publique en production : HTTPS, sur le sous-domaine. */
export const SITE_ORIGIN = `https://${SITE_DOMAIN}`;

export const IDENTITY = {
  name: 'DatePlanner',
  tagline: 'Trouvez la date qui arrange tout le monde.',
  /** Adresse de contact publique. */
  email: 'contact@laserit.fr',
  legal: {
    /** Le bureau d'enregistrement du nom de domaine, qui n'est pas l'hébergeur. */
    registrar: 'OVH',
  },
} as const;

/**
 * Identité de l'éditeur, lue dans l'environnement.
 *
 * Le service est édité à titre NON PROFESSIONNEL et auto-hébergé : l'éditeur
 * est aussi l'hébergeur au sens de l'article 6-III de la LCEN, et son nom
 * comme son adresse figurent donc aux mentions légales. Ce sont des données
 * personnelles, et le dépôt est public : elles vivent dans `.env`, jamais ici.
 * Pas de préfixe `NEXT_PUBLIC_` : seules les pages serveur les lisent.
 */
export const EDITOR_ENV = {
  name: 'EDITOR_NAME',
  address: 'EDITOR_ADDRESS',
} as const;

export type Editor = { name: string; address: string };

type Env = Record<string, string | undefined>;

/**
 * Hors production, une valeur absente s'affiche comme telle : le
 * développement et les tests n'ont pas à connaître l'éditeur réel.
 */
const UNSET_EDITOR: Editor = { name: 'Éditeur non renseigné', address: 'Adresse non renseignée' };

/**
 * En production, une valeur absente est une ERREUR : des mentions légales
 * sans éditeur ne sont pas des mentions légales. `next.config.ts` l'appelle
 * aussi, pour qu'un build de production échoue plutôt que de les servir.
 */
export function readEditor(env: Env = process.env): Editor {
  const name = env[EDITOR_ENV.name]?.trim() ?? '';
  const address = env[EDITOR_ENV.address]?.trim() ?? '';
  if (name !== '' && address !== '') return { name, address };
  if (env.NODE_ENV === 'production') {
    throw new Error(`${EDITOR_ENV.name} et ${EDITOR_ENV.address} sont requises en production (mentions légales).`);
  }
  return UNSET_EDITOR;
}

/**
 * Adresse canonique à partir de ce qui est configuré.
 *
 * Les deux entrées sont des PARAMÈTRES pour que la règle se vérifie sans
 * toucher à l'environnement du processus. Une variable laissée vide vaut une
 * variable absente, et la barre oblique finale est retirée.
 */
export function resolveSiteUrl(configured: string | undefined, nodeEnv: string | undefined): string {
  const given = configured?.trim();
  if (given !== undefined && given !== '') return given.replace(/\/+$/, '');
  return nodeEnv === 'production' ? SITE_ORIGIN : 'http://localhost:3000';
}

/**
 * URL canonique : métadonnées, sitemap, liens des emails.
 *
 * `NEXT_PUBLIC_SITE_URL` prime ; en son absence, `SITE_ORIGIN` en production,
 * `localhost` ailleurs. Retomber sur `localhost` en production enverrait des
 * liens de réinitialisation pointant sur la machine du destinataire.
 */
export const SITE_URL = resolveSiteUrl(process.env.NEXT_PUBLIC_SITE_URL, process.env.NODE_ENV);
