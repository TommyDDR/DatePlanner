/**
 * La marque DatePlanner : une page de calendrier tracée au trait de plan,
 * dont un jour brûle - le point incandescent du laser.
 */
export function BrandMark({ className = 'h-7 w-7' }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden="true" focusable="false">
      <rect x="4" y="6" width="24" height="22" rx="4" fill="none" stroke="var(--color-draft)" strokeWidth="1.6" />
      <path d="M4 12.5h24" stroke="var(--color-draft)" strokeWidth="1.6" />
      <path d="M10 3.5v5M22 3.5v5" stroke="var(--color-draft)" strokeWidth="1.6" strokeLinecap="round" />
      <circle cx="11" cy="18" r="1.3" fill="var(--color-text-faint)" />
      <circle cx="16" cy="18" r="1.3" fill="var(--color-text-faint)" />
      <circle cx="11" cy="23" r="1.3" fill="var(--color-text-faint)" />
      <circle cx="21" cy="22" r="3.4" fill="var(--color-ember)" />
      <circle cx="21" cy="22" r="1.4" fill="var(--color-incandescent)" />
    </svg>
  );
}
