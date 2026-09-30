'use client';

import { useCallback, useEffect, useRef } from 'react';
import {
  THEME_LABELS,
  THEME_STORAGE_KEY,
  otherTheme,
  viewportIsAtFullHeight,
  type Theme,
} from '@/lib/theme';
import { notifyThemeChange, useTheme } from './theme-store';

/**
 * Bouton de thème : clair ou sombre, rien d'autre.
 *
 * Tant que rien n'a été choisi, le thème affiché est celui du système - et il
 * le reste en direct si le système bascule, d'où l'écoute de la requête média
 * en plus de celle du stockage. Le premier clic écrit un choix explicite, qui
 * prime ensuite sur le système.
 *
 * Le choix vit dans le navigateur du visiteur, pas dans sa session : le rendu
 * serveur ne peut pas le connaître. Il est lu par `useTheme` (`theme-store`).
 * Les couleurs, elles, sont déjà bonnes avant ce rendu : le script du
 * `<head>` a posé l'attribut avant la première peinture (FR-030).
 */

/**
 * Durée du fondu. Reprise telle quelle dans `globals.css` : les deux doivent
 * rester d'accord, l'attribut étant retiré à la fin de la transition qu'il
 * déclenche.
 */
const TRANSITION_MS = 260;

/** `startViewTransition` n'est pas encore partout ; le typage ne l'exige pas. */
type ViewTransitionDocument = Document & {
  startViewTransition?: (callback: () => void) => { finished: Promise<void> };
};

/**
 * Hauteur d'une unité de fenêtre, mesurée sur un élément témoin.
 *
 * Les unités `dvh` et `lvh` ne se lisent nulle part en JavaScript : il faut
 * les faire calculer par la feuille de styles. Le témoin est posé hors flux et
 * invisible, mesuré, puis retiré - le temps d'un clic, pas d'un rendu.
 *
 * Une unité que le navigateur ne connaît pas laisse une hauteur nulle, que
 * `viewportIsAtFullHeight` traite comme une fenêtre saine.
 */
function measureViewportUnit(unit: 'dvh' | 'lvh'): number {
  const probe = document.createElement('div');
  probe.style.cssText = `position:absolute;top:0;left:0;width:0;visibility:hidden;pointer-events:none;height:100${unit}`;
  document.body.appendChild(probe);
  const height = probe.getBoundingClientRect().height;
  probe.remove();
  return height;
}

export function ThemeToggle({ className = '' }: { className?: string }) {
  const theme = useTheme();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const apply = useCallback((next: Theme) => {
    const root = document.documentElement;
    const wantsMotion = !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const startViewTransition = (document as ViewTransitionDocument).startViewTransition;
    const setAttribute = () => {
      root.dataset.theme = next;
    };

    // Le fondu par capture n'est pris que si la fenêtre est à sa taille
    // pleine : sur un téléphone dont la barre d'adresse est dépliée, le calque
    // de transition est décalé et l'en-tête collant passe derrière elle - voir
    // `viewportIsAtFullHeight`. Le repli, lui, n'anime que des couleurs : rien
    // n'y est capturé, donc rien ne peut s'y décaler.
    const fullHeight = viewportIsAtFullHeight(measureViewportUnit('dvh'), measureViewportUnit('lvh'));

    if (!wantsMotion) {
      // Changement sec : c'est ce qui a été demandé au niveau du système.
      setAttribute();
    } else if (typeof startViewTransition === 'function' && fullHeight) {
      // Fondu enchaîné entre deux captures de la page : les dégradés du fond
      // et les images suivent, ce qu'une transition de propriété ne fait pas.
      startViewTransition.call(document, setAttribute);
    } else {
      // Repli : on n'anime que les couleurs, et seulement le temps du
      // changement - une transition laissée en place traînerait sur chaque
      // survol. Un second clic pendant le fondu remet le compte à zéro plutôt
      // que de couper l'attribut en cours de route.
      if (timer.current) clearTimeout(timer.current);
      root.dataset.themeTransition = '';
      setAttribute();
      timer.current = setTimeout(() => {
        delete root.dataset.themeTransition;
        timer.current = null;
      }, TRANSITION_MS);
    }

    try {
      localStorage.setItem(THEME_STORAGE_KEY, next);
    } catch {
      // Voir plus haut : le thème s'applique quand même pour cette visite.
    }

    notifyThemeChange();
  }, []);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  const next = otherTheme(theme);

  return (
    <button
      type="button"
      onClick={() => apply(next)}
      aria-label={`Thème ${THEME_LABELS[theme].toLowerCase()}. Passer au thème ${THEME_LABELS[
        next
      ].toLowerCase()}.`}
      title={`Passer au thème ${THEME_LABELS[next].toLowerCase()}`}
      className={`icon-btn h-11 w-11 shrink-0 rounded-[10px] text-[var(--color-text-muted)] transition-colors hover:text-[var(--color-text)] ${className}`}
    >
      <ThemeIcon theme={theme} />
    </button>
  );
}

/** L'icône montre le thème en cours, pas celui qu'on obtiendrait en cliquant. */
function ThemeIcon({ theme }: { theme: Theme }) {
  const common = {
    width: 20,
    height: 20,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.6,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    'aria-hidden': true,
  };

  if (theme === 'light') {
    return (
      <svg {...common}>
        <circle cx="12" cy="12" r="4.2" />
        <path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6l1.4 1.4M17 17l1.4 1.4M18.4 5.6 17 7M7 17l-1.4 1.4" />
      </svg>
    );
  }

  return (
    <svg {...common}>
      <path d="M20 13.5A8 8 0 1 1 10.5 4a6.5 6.5 0 0 0 9.5 9.5Z" />
    </svg>
  );
}
