import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  turbopack: {
    root: __dirname,
  },
  // heic-convert/libheif-js ship a WASM binary (libheif.wasm). Keep them external
  // so it loads from node_modules at runtime and is traced into the Vercel
  // serverless bundle — webpack otherwise drops the .wasm and HEIC decode 422s.
  serverExternalPackages: ['heic-convert', 'libheif-js'],
};

export default nextConfig;
