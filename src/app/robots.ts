import type { MetadataRoute } from 'next';
import { SITE_URL } from '@/config/identity';

/** Les sondages et les espaces personnels ne s'indexent pas (FR-037). */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      disallow: ['/s/', '/api/', '/compte', '/mes-sondages', '/nouveau'],
    },
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
