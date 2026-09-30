/**
 * Identité du service et de son éditeur.
 *
 * Ces valeurs apparaissent dans les pages, les métadonnées, les mentions
 * légales et les emails. Elles sont déclarées UNE seule fois.
 */

/** Domaine public du service. */
export const SITE_DOMAIN = 'dateplanner.laserit.fr';

/** Adresse publique en production : HTTPS, sur le sous-domaine. */
export const SITE_ORIGIN = `https://${SITE_DOMAIN}`;

/**
 * Identité de l'éditeur : celle de laserit.fr (research.md, paramètres
 * d'exploitation). Le service est auto-hébergé : l'éditeur est aussi
 * l'hébergeur au sens de l'article 6-III de la LCEN, et son nom comme son
 * adresse sont REPRIS plutôt que retapés.
 */
const LEGAL_ENTITY_NAME = 'Prénom NOM EI';
const LEGAL_ADDRESS = 'Adresse postale';

export const IDENTITY = {
  name: 'DatePlanner',
  tagline: 'Trouvez la date qui arrange tout le monde.',
  /** Adresse de contact publique. */
  email: 'contact@laserit.fr',
  /** Téléphone : obligatoire, la LCEN l'exige de l'hébergeur. */
  phone: '00 00 00 00 00',
  legal: {
    entityName: LEGAL_ENTITY_NAME,
    siret: '000 000 000 00000',
    rneNumber: '000 000 000',
    address: LEGAL_ADDRESS,
    publicationDirector: 'Prénom NOM',
    hostingProvider: `${LEGAL_ENTITY_NAME}, ${LEGAL_ADDRESS}`,
    /** Le bureau d'enregistrement du nom de domaine, qui n'est pas l'hébergeur. */
    registrar: 'OVH',
  },
} as const;

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
