import { fileURLToPath } from 'node:url';
import type { NextConfig } from 'next';

/**
 * Where /api/* is proxied. Rewrites are fixed at BUILD time: Docker passes the compose
 * service address as a build arg; `npm run dev` uses the host-run api.
 */
const apiTarget = process.env.API_REWRITE_TARGET ?? 'http://localhost:3001';

/** Repo root: dependencies are hoisted there by npm workspaces. */
const monorepoRoot = fileURLToPath(new URL('../..', import.meta.url));

const nextConfig: NextConfig = {
  // Self-contained server (server.js + traced node_modules) for the Docker image.
  output: 'standalone',
  outputFileTracingRoot: monorepoRoot,
  turbopack: { root: monorepoRoot },
  poweredByHeader: false,
  // No image optimisation server: keeps the image free of `sharp` and of any network calls.
  images: { unoptimized: true },

  // One origin for the browser, curl and run.py: everything under /api goes to NestJS.
  async rewrites() {
    return [{ source: '/api/:path*', destination: `${apiTarget}/api/:path*` }];
  },

  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'same-origin' },
          { key: 'X-Frame-Options', value: 'DENY' },
        ],
      },
    ];
  },
};

export default nextConfig;
