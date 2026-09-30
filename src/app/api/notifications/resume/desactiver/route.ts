import { disableOwnerDigest } from '@/server/notifications/unsubscribe';

export const dynamic = 'force-dynamic';

/**
 * Désinscription en un clic (RFC 8058), cible de `List-Unsubscribe-Post`.
 *
 * Toujours 200 : la réponse ne dit rien de la validité du lien. Un GET ne
 * change rien - les antivirus de messagerie ouvrent les liens -, d'où la page
 * de confirmation pour les humains.
 */
export async function POST(request: Request): Promise<Response> {
  const token = new URL(request.url).searchParams.get('t') ?? '';
  if (token.length >= 10 && token.length <= 500) await disableOwnerDigest(token);
  return new Response(null, { status: 200, headers: { 'Cache-Control': 'no-store' } });
}
