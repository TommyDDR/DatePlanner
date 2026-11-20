import { participantCountLabel } from '@/lib/text';

/**
 * Compteur de participants (spécification 002, FR-001, FR-007).
 *
 * Le nombre de réponses du sondage, sous son titre : visible sans rien
 * toucher. Il ne porte qu'un entier, aucun nom (FR-008). Rendu côté serveur,
 * il suit le direct comme les pastilles : chaque événement relit la page.
 * La région `role="status"` est la même d'une relecture à l'autre, seul son
 * texte change : un lecteur d'écran l'annonce sans que le focus bouge, et ne
 * dit rien au chargement (research.md R4).
 */
export function ParticipantCount({ count }: { count: number }) {
  return (
    <p role="status" data-testid="compteur-participants" className="text-sm font-medium text-[var(--color-text-muted)]">
      {participantCountLabel(count)}
    </p>
  );
}
