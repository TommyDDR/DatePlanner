import { NextResponse } from 'next/server';
import { SITE_URL } from '@/config/identity';

/**
 * Une redirection 303 vers un chemin du service, composée sur l'adresse
 * PUBLIQUE : derrière le proxy, l'origine que le serveur voit est la sienne,
 * pas celle du visiteur.
 */
export function redirectWithin(path: string): NextResponse {
  return NextResponse.redirect(new URL(path, SITE_URL), 303);
}
