'use client';

import { useState } from 'react';

/**
 * Champ de mot de passe, avec de quoi le LIRE.
 *
 * Sur un téléphone, douze caractères saisis à l'aveugle, une faute de frappe,
 * et le message de connexion - indifférencié, à dessein - laisse croire qu'on
 * n'a pas de compte. Le bouton bascule le type du champ ; rien d'autre ne change,
 * l'attribut `autoComplete` reste celui du gestionnaire de mots de passe.
 *
 * Le bouton est POSÉ sur le champ, pas à côté : un champ qui rétrécit pour
 * lui laisser la place se lit comme un champ plus court que les autres. Il
 * est nommé - un œil sans nom n'existe pas pour un lecteur d'écran - et dit
 * son état par `aria-pressed`.
 */
export function PasswordInput({
  id,
  name,
  autoComplete,
  required = true,
  invalid,
  describedBy,
}: {
  id: string;
  name: string;
  autoComplete: 'current-password' | 'new-password';
  required?: boolean;
  invalid?: boolean;
  describedBy?: string | undefined;
}) {
  const [shown, setShown] = useState(false);

  return (
    <div className="relative">
      <input
        id={id}
        name={name}
        type={shown ? 'text' : 'password'}
        required={required}
        autoComplete={autoComplete}
        aria-invalid={invalid ? true : undefined}
        aria-describedby={describedBy}
        className={`field pr-12 ${invalid ? 'field-error' : ''}`}
      />
      <button
        type="button"
        onClick={() => setShown((value) => !value)}
        aria-pressed={shown}
        aria-label={shown ? 'Masquer le mot de passe' : 'Afficher le mot de passe'}
        className="absolute inset-y-0 right-0 flex w-12 items-center justify-center text-[var(--color-text-faint)] transition-colors hover:text-[var(--color-text)]"
      >
        <EyeIcon open={!shown} />
      </button>
    </div>
  );
}

/** Œil ouvert quand le mot de passe est masqué : c'est ce que le clic fera. */
function EyeIcon({ open }: { open: boolean }) {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M2.5 12s3.5-6.5 9.5-6.5 9.5 6.5 9.5 6.5-3.5 6.5-9.5 6.5S2.5 12 2.5 12Z"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
      <circle cx="12" cy="12" r="2.75" stroke="currentColor" strokeWidth="1.6" />
      {open ? null : <path d="M4 20 20 4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />}
    </svg>
  );
}
