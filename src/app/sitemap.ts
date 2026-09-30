import type { MetadataRoute } from 'next';
import { SITE_URL } from '@/config/identity';

/** Les seules pages publiques et indexables. */
export default function sitemap(): MetadataRoute.Sitemap {
  return ['/', '/mentions-legales', '/confidentialite'].map((path) => ({ url: `${SITE_URL}${path}` }));
}
