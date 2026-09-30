/**
 * Destination de retour après connexion.
 *
 * La page de connexion accepte un `?next=` pour ramener le visiteur là où il
 * allait. Sans filtre, ce paramètre transformerait la page en tremplin de
 * redirection ouverte : un lien qui semble pointer vers ce site, une vraie
 * page de connexion, un vrai certificat, et une arrivée chez quelqu'un
 * d'autre — le décor exact d'un hameçonnage.
 *
 * La règle vit ICI, hors du fichier « use server », pour qu'elle se lise et se
 * teste : ce qui compte n'est pas d'appeler `redirect`, c'est de savoir ce
 * qu'on refuse.
 *
 * ── Pourquoi une ANALYSE et non un test de préfixe ──────────────────────
 *
 * Refuser `//` et laisser passer tout ce qui commence par une barre oblique
 * ne suffit pas : l'analyseur d'URL des
 * navigateurs — celui qui résout l'en-tête `Location`, et celui que le routeur
 * de Next applique côté client — traite l'ANTISLASH comme un séparateur
 * d'autorité pour les schémas http et https, et retire tabulations et retours
 * ligne AVANT d'analyser. `/\exemple.test` et `/<tabulation>/exemple.test`
 * passeraient donc un tel filtre et se résoudraient hors du site.
 *
 * On résout donc contre une origine témoin, et on ne rend le chemin que s'il
 * n'en est pas sorti. Un test de préfixe décrit ce qu'on croit qu'une chaîne
 * veut dire ; l'analyse dit ce que le navigateur en fera.
 */

/** Origine témoin : n'existe pas, ne sera jamais jointe, c'est le but. */
const PROBE_ORIGIN = 'https://redirection.invalid';

/**
 * Rend `target` s'il désigne un chemin de CE site, `fallback` sinon.
 *
 * Le chemin rendu est celui que l'analyse a reconstruit, pas la chaîne reçue :
 * ce qui part dans l'en-tête est donc exactement ce qui a été vérifié.
 */
export function safeInternalPath(target: string, fallback: string): string {
  if (!target.startsWith('/')) return fallback;

  // Antislash et caractères de contrôle sont écartés AVANT l'analyse : ce sont
  // eux qui font dire deux choses différentes à une même chaîne selon qui la
  // lit. Les retirer plutôt que les traduire évite d'avoir à deviner laquelle
  // des deux lectures était la bonne.
  if (/[\\\u0000-\u001f\u007f]/.test(target)) return fallback;

  try {
    const url = new URL(target, PROBE_ORIGIN);
    if (url.origin !== PROBE_ORIGIN) return fallback;
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return fallback;
  }
}
