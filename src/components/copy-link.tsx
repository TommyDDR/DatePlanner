'use client';

import { useRef, useState } from 'react';

/**
 * Le lien de partage, copiable en un geste (FR-012).
 *
 * Le presse-papiers n'est offert qu'aux origines sûres : ailleurs, ou refusé,
 * le lien est sélectionné dans son champ pour une copie à la main. Le résultat
 * est annoncé aux lecteurs d'écran.
 */
export function CopyLink({ url, label = 'Lien du sondage' }: { url: string; label?: string }) {
  const input = useRef<HTMLInputElement>(null);
  const [status, setStatus] = useState<'idle' | 'copied' | 'manual'>('idle');

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setStatus('copied');
    } catch {
      input.current?.select();
      setStatus('manual');
    }
    window.setTimeout(() => setStatus('idle'), 3000);
  }

  return (
    <div className="flex flex-col gap-2">
      <label htmlFor="lien-partage" className="text-sm font-medium">
        {label}
      </label>
      <div className="flex flex-col gap-2 sm:flex-row">
        <input
          ref={input}
          id="lien-partage"
          readOnly
          value={url}
          onFocus={(event) => event.currentTarget.select()}
          className="field font-mono text-sm"
        />
        <button type="button" onClick={copy} className="btn-ember shrink-0">
          {status === 'copied' ? 'Lien copié' : 'Copier le lien'}
        </button>
      </div>
      <p aria-live="polite" className="min-h-5 text-sm text-[var(--color-text-muted)]">
        {status === 'copied' ? 'Lien copié : collez-le dans un message.' : null}
        {status === 'manual' ? 'Le lien est sélectionné : copiez-le avec Ctrl+C.' : null}
      </p>
    </div>
  );
}
