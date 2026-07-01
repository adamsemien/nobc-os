import type { NextConfig } from "next";

// Content-Security-Policy — shipped REPORT-ONLY on purpose.
//
// This is a live Clerk (auth) + Stripe (payments) app; an enforcing CSP that
// mis-lists a required origin silently breaks sign-in or checkout. Report-Only
// installs the header and surfaces violations (browser console / report-uri)
// WITHOUT blocking anything, so the allowlist can be validated against real
// Clerk/Stripe/R2 traffic before flipping to the enforcing `Content-Security-
// Policy` key. 'unsafe-inline'/'unsafe-eval' are present because Next.js + Clerk
// need them today; tightening to nonces is a follow-up. HSTS is intentionally
// NOT set here — Vercel already sends `strict-transport-security: max-age=63072000`.
const CSP_REPORT_ONLY = [
  "default-src 'self'",
  "base-uri 'self'",
  "object-src 'none'",
  "frame-ancestors 'self'",
  "img-src 'self' data: blob: https:",
  "font-src 'self' data:",
  "style-src 'self' 'unsafe-inline'",
  "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://*.clerk.accounts.dev https://*.clerk.com https://clerk.thenobadcompany.com https://js.stripe.com https://challenges.cloudflare.com",
  "connect-src 'self' https://*.clerk.accounts.dev https://*.clerk.com https://clerk.thenobadcompany.com https://api.stripe.com https://*.r2.cloudflarestorage.com wss:",
  "frame-src 'self' https://*.clerk.accounts.dev https://*.clerk.com https://js.stripe.com https://hooks.stripe.com https://challenges.cloudflare.com",
  "worker-src 'self' blob:",
].join('; ');

const nextConfig: NextConfig = {
  turbopack: {
    root: __dirname,
  },
  // heic-convert/libheif-js ship a WASM binary (libheif.wasm). Keep them external
  // so it loads from node_modules at runtime and is traced into the Vercel
  // serverless bundle — webpack otherwise drops the .wasm and HEIC decode 422s.
  serverExternalPackages: ['heic-convert', 'libheif-js'],
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'Content-Security-Policy-Report-Only', value: CSP_REPORT_ONLY },
        ],
      },
    ];
  },
};

export default nextConfig;
