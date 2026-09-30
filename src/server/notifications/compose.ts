import type { EmailOutbox } from '@prisma/client';
import type { RenderedEmail } from './templates';

/**
 * Composition d'un email AU MOMENT DE SON ENVOI (research.md R10).
 *
 * La file ne garde que des identifiants : ce que l'email dit est relu en base
 * à son départ. Un résumé n'annonce donc jamais une réponse retirée entre-temps.
 *
 * Rend `null` quand l'email n'a plus lieu d'être (résumé devenu vide, sondage
 * supprimé) : la file l'annule au lieu de l'envoyer.
 */
export type Composer = (entry: EmailOutbox) => Promise<RenderedEmail | null>;

const composers = new Map<EmailOutbox['template'], Composer>();

/**
 * Chaque modèle déclare son composeur depuis le module qui le définit
 * (`server/notifications/…`). `outbox.ts` importe `composers.ts`, qui charge
 * ces modules : la liste est complète dès qu'un email peut partir.
 */
export function registerComposer(template: EmailOutbox['template'], composer: Composer): void {
  composers.set(template, composer);
}

export async function composeEmail(entry: EmailOutbox): Promise<RenderedEmail | null> {
  const composer = composers.get(entry.template);
  if (!composer) throw new Error(`Aucun composeur pour le modèle ${entry.template}.`);
  return composer(entry);
}
