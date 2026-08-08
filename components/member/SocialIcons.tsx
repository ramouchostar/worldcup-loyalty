// Logos réseaux sociaux (SVG inline) pour la Carte Actions — badges colorés
// aux couleurs de marque de chaque plateforme, indépendants du branding
// par établissement (--brand-*) qui ne s'applique qu'à l'identité du resto.

type IconProps = { className?: string };

export function InstagramIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <rect width="24" height="24" rx="6" fill="url(#ig-gradient)" />
      <defs>
        <linearGradient id="ig-gradient" x1="0" y1="24" x2="24" y2="0" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#FFDD55" />
          <stop offset="0.5" stopColor="#E1306C" />
          <stop offset="1" stopColor="#833AB4" />
        </linearGradient>
      </defs>
      <rect x="6" y="6" width="12" height="12" rx="3.5" stroke="white" strokeWidth="1.6" />
      <circle cx="12" cy="12" r="3.1" stroke="white" strokeWidth="1.6" />
      <circle cx="15.6" cy="8.4" r="0.9" fill="white" />
    </svg>
  );
}

const TIKTOK_NOTE_PATH =
  "M16.6 5.82c-.7-.76-1.08-1.75-1.06-2.82h-3.09v12.4a2.592 2.592 0 0 1-2.59 2.5c-1.42 0-2.6-1.16-2.6-2.6c0-1.72 1.66-3.01 3.37-2.48V9.66c-3.45-.46-6.47 2.22-6.47 5.64c0 3.33 2.76 5.7 5.69 5.7c3.14 0 5.69-2.55 5.69-5.7V9.01a7.35 7.35 0 0 0 4.3 1.38V7.3c-1.24.07-2.46-.4-3.24-1.48Z";

export function TiktokIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <rect width="24" height="24" rx="6" fill="#010101" />
      <path d={TIKTOK_NOTE_PATH} fill="#25F4EE" transform="translate(-0.6 -0.4)" />
      <path d={TIKTOK_NOTE_PATH} fill="#FE2C55" transform="translate(0.6 0.4)" />
      <path d={TIKTOK_NOTE_PATH} fill="white" />
    </svg>
  );
}

export function FacebookIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <rect width="24" height="24" rx="6" fill="#1877F2" />
      <path
        d="M14.5 8.5h1.8V5.9c-.3 0-1.4-.1-2.6-.1-2.6 0-4.4 1.6-4.4 4.5v2.2H6.7v3h2.6v7.4h3.1v-7.4h2.5l.4-3h-2.9V10.6c0-.9.2-1.5 1.5-1.5Z"
        fill="white"
      />
    </svg>
  );
}

export function GoogleIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <rect width="24" height="24" rx="6" fill="white" />
      <path
        d="M18.9 12.2c0-.6-.1-1.1-.2-1.6h-6.6v3h3.8c-.2 1-.7 1.8-1.6 2.4v2h2.6c1.5-1.4 2-3.4 2-5.8Z"
        fill="#4285F4"
      />
      <path
        d="M12.1 19c2.2 0 4-.7 5.3-2l-2.6-2c-.7.5-1.6.8-2.7.8-2.1 0-3.8-1.4-4.5-3.2H5v2.1C6.3 17.2 9 19 12.1 19Z"
        fill="#34A853"
      />
      <path
        d="M7.6 12.6c-.2-.5-.3-1-.3-1.6s.1-1.1.3-1.6V7.3H5c-.6 1.1-.9 2.3-.9 3.7s.3 2.6.9 3.7l2.6-2.1Z"
        fill="#FBBC05"
      />
      <path
        d="M12.1 6.2c1.2 0 2.3.4 3.1 1.2l2.3-2.3C16.1 3.7 14.3 3 12.1 3 9 3 6.3 4.8 5 7.3l2.6 2.1c.7-1.8 2.4-3.2 4.5-3.2Z"
        fill="#EA4335"
      />
      <rect x="0.5" y="0.5" width="23" height="23" rx="5.5" stroke="#E5E7EB" />
    </svg>
  );
}
