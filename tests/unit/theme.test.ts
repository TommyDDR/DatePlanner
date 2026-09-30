import { describe, expect, it } from 'vitest';
import {
  THEMES,
  THEME_INIT_SCRIPT,
  THEME_STORAGE_KEY,
  isTheme,
  otherTheme,
  readStoredTheme,
  resolveTheme,
  viewportIsAtFullHeight,
} from '@/lib/theme';

/**
 * Choix du thème. Le module est pur : il ne touche ni au DOM ni au stockage,
 * il dit seulement comment lire un choix et le résoudre. C'est ce qui le rend
 * vérifiable ici, hors navigateur.
 */
describe('choix du thème', () => {
  it('ne retient que les deux thèmes connus', () => {
    for (const theme of THEMES) expect(isTheme(theme)).toBe(true);
    expect(isTheme('system')).toBe(false);
    expect(isTheme(null)).toBe(false);
  });

  it('traite l’absence de choix comme un état, pas comme un thème par défaut', () => {
    expect(readStoredTheme(null)).toBeNull();
    expect(readStoredTheme(undefined)).toBeNull();
    expect(readStoredTheme('')).toBeNull();
    expect(readStoredTheme('SOMBRE')).toBeNull();
    // Une valeur écrite par une version antérieure ne doit pas figer le site.
    expect(readStoredTheme('system')).toBeNull();
  });

  it('relit les deux choix explicites', () => {
    expect(readStoredTheme('light')).toBe('light');
    expect(readStoredTheme('dark')).toBe('dark');
  });

  it('suit le système tant que rien n’a été choisi', () => {
    expect(resolveTheme(null, true)).toBe('dark');
    expect(resolveTheme(null, false)).toBe('light');
  });

  it('fait primer le choix du visiteur sur son système', () => {
    expect(resolveTheme('light', true)).toBe('light');
    expect(resolveTheme('dark', false)).toBe('dark');
  });

  it('bascule d’un thème à l’autre', () => {
    expect(otherTheme('light')).toBe('dark');
    expect(otherTheme('dark')).toBe('light');
  });

  it('refuse le fondu par capture quand la barre d’adresse ampute la fenêtre', () => {
    // Chrome Android décale tout le calque de transition de la hauteur de sa
    // barre d'adresse : l'en-tête collant y passe derrière elle. `lvh` est la
    // fenêtre barre escamotée, `dvh` celle du moment.
    expect(viewportIsAtFullHeight(744, 800)).toBe(false);
    // Barre escamotée : les deux unités se rejoignent, le fondu est juste.
    expect(viewportIsAtFullHeight(800, 800)).toBe(true);
    // Les hauteurs de fenêtre sont fractionnaires : un pixel ne compte pas.
    expect(viewportIsAtFullHeight(799.4, 800)).toBe(true);
  });

  it('laisse le fondu par capture aux fenêtres qu’on ne sait pas mesurer', () => {
    // Un navigateur qui ignore `dvh` ou `lvh` laisse le témoin à zéro. Le
    // défaut ne le concerne pas : lui retirer le fondu serait une perte sèche.
    expect(viewportIsAtFullHeight(0, 0)).toBe(true);
    expect(viewportIsAtFullHeight(0, 800)).toBe(true);
    expect(viewportIsAtFullHeight(Number.NaN, 800)).toBe(true);
  });

  it('le script d’amorçage ne pose l’attribut que pour un choix enregistré', () => {
    // Il s'exécute avant le premier rendu : une exception y laisserait la page
    // sans styles. Le `try` n'est donc pas décoratif - un navigateur qui
    // refuse le stockage local lève dès la lecture.
    expect(THEME_INIT_SCRIPT).toContain('try');
    expect(THEME_INIT_SCRIPT).toContain(JSON.stringify(THEME_STORAGE_KEY));

    const run = (stored: string | null) => {
      const dataset: Record<string, string> = {};
      new Function('localStorage', 'document', THEME_INIT_SCRIPT)(
        { getItem: () => stored },
        { documentElement: { dataset } },
      );
      return dataset.theme;
    };

    expect(run('light')).toBe('light');
    expect(run('dark')).toBe('dark');
    // Sans choix, aucun attribut : la feuille de styles suit le système, et
    // continue de le suivre s'il bascule pendant la visite.
    expect(run(null)).toBeUndefined();
    expect(run('system')).toBeUndefined();
  });
});
