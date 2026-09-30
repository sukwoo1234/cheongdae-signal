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

export function KakaoTalkIcon({ className = "h-5 w-5" }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden>
      <path d="M4 11.1c0-4 3.58-7.1 8-7.1s8 3.1 8 7.1-3.58 7.1-8 7.1c-.86 0-1.7-.12-2.47-.34L5.9 20l.9-3.17C5.08 15.53 4 13.48 4 11.1Z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
    </svg>
  );
}

export function PhoneIcon({ className = "h-5 w-5" }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden>
      <path d="M7.1 3.8 4.7 5.6c-.62.47-.9 1.27-.68 2.02 1.75 6.05 6.32 10.62 12.37 12.37.75.22 1.55-.06 2.02-.68l1.8-2.4a1.45 1.45 0 0 0-.18-1.95l-2.55-2.31a1.45 1.45 0 0 0-1.87-.06l-1.56 1.22a12.16 12.16 0 0 1-3.86-3.86l1.22-1.56a1.45 1.45 0 0 0-.06-1.87L9.05 3.98A1.45 1.45 0 0 0 7.1 3.8Z" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
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
