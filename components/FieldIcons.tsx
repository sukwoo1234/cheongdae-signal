interface IconProps {
  className?: string;
}

export function InstagramIcon({ className = "h-5 w-5" }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden>
      <rect x="3.5" y="3.5" width="17" height="17" rx="5" stroke="currentColor" strokeWidth="1.8" />
      <circle cx="12" cy="12" r="4" stroke="currentColor" strokeWidth="1.8" />
      <circle cx="17.4" cy="6.8" r="1.15" fill="currentColor" />
    </svg>
  );
}

export function PaletteIcon({ className = "h-5 w-5" }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden>
      <path d="M12 3.5c-5 0-8.5 3.35-8.5 7.8 0 4.25 3.2 7.2 7.25 7.2h1.1c.85 0 1.35-.92.9-1.64-.55-.9.1-2.05 1.16-2.05h2.8c2.22 0 3.79-1.7 3.79-4.02C20.5 6.6 16.76 3.5 12 3.5Z" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" />
      <circle cx="8" cy="9" r="1.2" fill="currentColor" />
      <circle cx="11.7" cy="6.9" r="1.2" fill="currentColor" />
      <circle cx="15.5" cy="8.2" r="1.2" fill="currentColor" />
    </svg>
  );
}
