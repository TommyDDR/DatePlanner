/**
 * Choix du thème - module pur, sans dépendance au navigateur.
 *
 * Deux thèmes, clair et sombre, et rien d'autre : le bouton bascule de l'un à
 * l'autre. Tant que le visiteur n'a rien choisi, aucune clé n'est écrite et
 * c'est son système qui décide - première visite comprise, et en direct s'il
 * bascule son système en cours de route. Au premier clic, le choix devient
 * explicite et prime sur le système à toutes les visites suivantes.
 *
 * L'absence de clé est donc un état à part entière, pas une valeur manquante :
 * `readStoredTheme` rend `null` plutôt qu'un thème par défaut, et c'est
 * `resolveTheme` qui tranche avec la préférence système.
 *
 * Les couleurs elles-mêmes ne sont pas ici : la feuille de styles les résout
 * avec `light-dark()`, à partir du `color-scheme` que ce module pilote. Ce
 * fichier ne connaît que le choix, jamais une valeur de couleur.
 */

export const THEMES = ['light', 'dark'] as const;

export type Theme = (typeof THEMES)[number];

/**
 * Clé de stockage local (contracts/http-api.md). Préfixée `dp-` comme les
 * cookies du service (`dp_session`, `dp_appareil`) : ce que DatePlanner pose
 * sur l'appareil du visiteur se reconnaît d'un coup d'œil, et ne se mélange
 * pas avec laserit.fr.
 */
export const THEME_STORAGE_KEY = 'dp-theme';

export function isTheme(value: unknown): value is Theme {
  return value === 'light' || value === 'dark';
}

/**
 * Interprète ce qui a été relu du stockage local. Tout ce qui n'est pas un
 * thème connu vaut « rien de choisi » : une valeur écrite par une version
 * antérieure, ou par autre chose, ne doit pas figer le site sur un thème.
 */
export function readStoredTheme(raw: string | null | undefined): Theme | null {
  return isTheme(raw) ? raw : null;
}

/** Le thème effectif : le choix du visiteur s'il en a un, sinon son système. */
export function resolveTheme(stored: Theme | null, systemPrefersDark: boolean): Theme {
  return stored ?? (systemPrefersDark ? 'dark' : 'light');
}

/** Le bouton n'a que deux positions. */
export function otherTheme(current: Theme): Theme {
  return current === 'dark' ? 'light' : 'dark';
}

/**
 * Le fondu par capture est-il fiable, vue la fenêtre du moment ?
 *
 * Sur Chrome Android, le calque de la transition de vue est posé dans un bloc
 * dont l'origine ignore la barre d'adresse : tant qu'elle est DÉPLIÉE, tout ce
 * calque est décalé vers le haut de sa hauteur et l'en-tête collant passe
 * derrière elle - il disparaît pendant toute l'animation et ne revient qu'à la
 * fin, avec le DOM vivant. Barre escamotée, le décalage est nul et le fondu
 * est juste ; c'est pourquoi le défaut ne se voit qu'une fois sur deux.
 *
 * L'état de la barre se MESURE, en comparant deux unités de fenêtre : `lvh`
 * est la fenêtre barre escamotée, `dvh` celle du moment. Un `dvh` plus petit
 * dit que quelque chose mange la fenêtre - barre d'adresse, clavier - et que
 * la capture ne sera pas à sa place. `visualViewport` ne le dit pas : sur ce
 * navigateur, sa hauteur suit la hauteur de mise en page et l'écart y reste
 * nul.
 *
 * Deux hauteurs qu'on ne sait pas mesurer valent une fenêtre saine : c'est le
 * cas des navigateurs de bureau, où le défaut n'existe pas et où retirer le
 * fondu serait une perte sèche.
 */
export function viewportIsAtFullHeight(current: number, largest: number): boolean {
  if (!Number.isFinite(current) || !Number.isFinite(largest) || current <= 0 || largest <= 0) {
    return true;
  }
  // Un pixel de tolérance : les hauteurs de fenêtre sont fractionnaires.
  return current >= largest - 1;
}

export const THEME_LABELS: Record<Theme, string> = {
  light: 'Clair',
  dark: 'Sombre',
};

/**
 * Script posé dans le `<head>`, exécuté avant le premier rendu.
 *
 * Sans lui, un visiteur ayant choisi le thème clair verrait la page s'afficher
 * en sombre le temps que React s'hydrate. L'attribut est écrit sur `<html>`
 * avant que le corps ne soit peint ; c'est pourquoi `<html>` porte
 * `suppressHydrationWarning` : le serveur ne peut pas connaître ce choix.
 *
 * Rien n'est posé tant que le visiteur n'a pas choisi : l'absence d'attribut
 * laisse `color-scheme: light dark` suivre le système, y compris s'il bascule
 * pendant la visite. Écrire ici le thème système figerait cette bascule.
 */
export const THEME_INIT_SCRIPT = `(function(){try{var c=localStorage.getItem(${JSON.stringify(
  THEME_STORAGE_KEY,
)});if(c==="light"||c==="dark"){document.documentElement.dataset.theme=c}}catch(e){}})()`;
