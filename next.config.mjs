/** @type {import('next').NextConfig} */

// ── En-têtes de sécurité (audit sécurité 2026) ────────────────────────────────
// La CSP est verrouillée sur 'self' + Supabase. Les scripts/styles inline de
// Next.js imposent 'unsafe-inline' faute de nonce (durcissable ultérieurement
// via un nonce injecté par le middleware). 'unsafe-eval' volontairement absent
// (inutile en production).
//
// Seule exception : GA4, et **uniquement si un ID de mesure est configuré**.
// Un déploiement sans NEXT_PUBLIC_GA_MEASUREMENT_ID (dev, previews) garde donc
// la CSP d'origine, sans aucune origine Google autorisée. Les trois domaines
// ouverts sont le strict nécessaire de gtag.js : googletagmanager.com sert le
// script, google-analytics.com et analytics.google.com reçoivent les mesures.
const gaEnabled = Boolean(process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID);

const gaScriptSrc = gaEnabled ? " https://www.googletagmanager.com" : "";
const gaConnectSrc = gaEnabled
  ? " https://*.google-analytics.com https://*.analytics.google.com https://*.googletagmanager.com"
  : "";
const gaImgSrc = gaEnabled
  ? " https://*.google-analytics.com https://*.googletagmanager.com"
  : "";

const ContentSecurityPolicy = [
  "default-src 'self'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  "object-src 'none'",
  `script-src 'self' 'unsafe-inline'${gaScriptSrc}`,
  "style-src 'self' 'unsafe-inline'",
  `img-src 'self' data: blob: https://*.supabase.co${gaImgSrc}`,
  "font-src 'self' data:",
  `connect-src 'self' https://*.supabase.co wss://*.supabase.co${gaConnectSrc}`,
  "worker-src 'self' blob:",
  "manifest-src 'self'",
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: ContentSecurityPolicy },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
  { key: "Permissions-Policy", value: "camera=(self), microphone=(), geolocation=(), browsing-topics=()" },
];

const nextConfig = {
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
  // /restaurateurs → / (2026-08-08) : la landing restaurateurs a pris la
  // racine du domaine boosteats.tech (ex landing membre, déplacée vers
  // /membres). Redirection permanente pour ne pas casser les liens/QR déjà
  // partagés vers l'ancienne URL.
  async redirects() {
    return [{ source: "/restaurateurs", destination: "/", permanent: true }];
  },
  // Dev via Codespaces : le proxy de forwarding sert l'app sur un domaine
  // *.app.github.dev différent de celui vu par le serveur (localhost), ce que
  // Next.js refuse par défaut pour les Server Actions (protection CSRF).
  // Sans impact en production (le domaine Vercel réel n'a pas besoin d'être
  // listé ici, Next.js l'autorise via son propre déploiement).
  experimental: {
    serverActions: {
      allowedOrigins: ["localhost:3000", "*.app.github.dev"],
    },
  },
};

export default nextConfig;
