'use client';

/**
 * Dernier recours, quand le layout racine lui-même a échoué : pas de feuille
 * de style garantie, donc des styles en ligne minimaux.
 */
export default function GlobalError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="fr">
      <body style={{ fontFamily: 'system-ui, sans-serif', padding: '4rem 1rem', maxWidth: '36rem', margin: '0 auto' }}>
        <h1>Un imprévu est survenu</h1>
        <p>Le service n’a pas pu afficher cette page. Réessayez dans un instant.</p>
        <button type="button" onClick={reset}>
          Réessayer
        </button>
      </body>
    </html>
  );
}
