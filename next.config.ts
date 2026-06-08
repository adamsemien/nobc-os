import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  turbopack: {
    root: __dirname,
  },
  // heic-convert/libheif-js ship a WASM binary (libheif.wasm). Keep them external
  // so it loads from node_modules at runtime and is traced into the Vercel
  // serverless bundle — webpack otherwise drops the .wasm and HEIC decode 422s.
  serverExternalPackages: ['heic-convert', 'libheif-js'],
  // Event hero imagery is stored as full public Vercel Blob URLs (see lib/event-hero-url.ts).
  // Allow next/image to optimize them so member-facing hero/grid images get a responsive
  // srcset + lazy-load + no layout shift.
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: '**.public.blob.vercel-storage.com' },
    ],
  },
};

export default nextConfig;
