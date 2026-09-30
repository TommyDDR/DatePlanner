import { IDENTITY, SITE_URL } from '@/config/identity';

/**
 * Mise en forme des emails (contracts/emails.md).
 *
 * Chaque email a une branche TEXTE et une branche HTML. Dans la branche HTML,
 * TOUTE valeur venue d'un utilisateur - titre, nom, pseudo - passe par
 * `escapeHtml` au point de sortie (constitution I) ; la branche texte la garde
 * telle quelle, rien n'y étant interprété.
 *
 * Les fonctions de ce module sont pures : elles reçoivent ce qu'il faut dire,
 * déjà relu en base par `compose.ts` au moment de l'envoi.
 */

export type RenderedEmail = {
  subject: string;
  text: string;
  html: string;
  headers?: Record<string, string>;
};

const HTML_ESCAPES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

export function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => HTML_ESCAPES[char] ?? char);
}

/** Un paragraphe HTML dont le texte est échappé ; les retours ligne deviennent des `<br>`. */
export function paragraph(text: string): string {
  return `<p style="margin:0 0 16px">${escapeHtml(text).replace(/\n/g, '<br>')}</p>`;
}

/** Un bouton-lien. L'adresse est construite par le service, jamais par un utilisateur. */
export function button(href: string, label: string): string {
  return `<p style="margin:24px 0"><a href="${escapeHtml(href)}" style="display:inline-block;padding:12px 20px;border-radius:999px;background:#c2410c;color:#fff7ed;text-decoration:none;font-weight:600">${escapeHtml(label)}</a></p>`;
}

/** Enveloppe HTML commune : marque, contenu, pied de page. */
export function layout(bodyHtml: string, footerHtml = ''): string {
  return [
    '<!doctype html><html lang="fr"><body style="margin:0;background:#f6f2ea;font-family:Segoe UI,system-ui,sans-serif;color:#17130f">',
    '<div style="max-width:560px;margin:0 auto;padding:32px 24px">',
    `<p style="margin:0 0 24px;font-weight:700;letter-spacing:.02em">${escapeHtml(IDENTITY.name)}</p>`,
    bodyHtml,
    `<p style="margin:32px 0 0;font-size:12px;color:#57504a">${footerHtml || escapeHtml(`${IDENTITY.name} - ${SITE_URL}`)}</p>`,
    '</div></body></html>',
  ].join('');
}

/** Pied de page texte commun. */
export function textFooter(extra = ''): string {
  return ['', '--', `${IDENTITY.name} - ${SITE_URL}`, extra].filter((line) => line !== '').join('\n');
}

/** Adresse absolue d'un chemin du site, pour les liens des emails. */
export function absoluteUrl(path: string): string {
  return `${SITE_URL}${path}`;
}
