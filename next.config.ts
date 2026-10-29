import type { NextConfig } from "next";
import { validateProductionEnv } from "./src/lib/validate-env";

// Validate required environment variables at build/startup time.
// In production, missing critical vars throw and abort deployment.
validateProductionEnv();



const ALLOWED_ORIGINS = [
  "https://thearcfun.xyz",
  "https://www.thearcfun.xyz",
];

const nextConfig: NextConfig = {
  poweredByHeader: false,
  experimental: {
    optimizePackageImports: [
      "wagmi",
      "viem",
      "@rainbow-me/rainbowkit",
      "lucide-react",
      "framer-motion"
    ],
  },
  transpilePackages: [
    "@solana/web3.js",
    "rpc-websockets"
  ],
  serverExternalPackages: [
    "@stellar/stellar-sdk"
  ],
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: 's2.coinmarketcap.com' },
      { protocol: 'https', hostname: 'coin-images.coingecko.com' }
    ],
  },

  async headers() {
    const isDev = process.env.NODE_ENV === "development";

    return [
      {
        // Apply to all routes including root
        source: "/:path*",
        headers: [
          {
            key: "X-Frame-Options",
            value: "SAMEORIGIN",
          },
          {
            key: "X-Content-Type-Options",
            value: "nosniff",
          },
          {
            key: "Referrer-Policy",
            value: "strict-origin-when-cross-origin",
          },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=()",
          },
          {
            key: "Cross-Origin-Opener-Policy",
            value: "same-origin-allow-popups",
          },
          {
            key: "Strict-Transport-Security",
            value: "max-age=63072000; includeSubDomains; preload",
          },
          {
            key: "Origin-Agent-Cluster",
            value: "?1",
          },
          {
            key: "Content-Security-Policy",
            value: "default-src 'self'; script-src 'self' 'unsafe-eval' 'unsafe-inline' https://verify.walletconnect.com https://verify.walletconnect.org https://secure.walletconnect.com https://challenges.cloudflare.com https://auth.privy.io https://s3.tradingview.com; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://api.fontshare.com; font-src 'self' data: https://fonts.gstatic.com https://cdn.fontshare.com; img-src 'self' data: blob: https:; connect-src 'self' https: wss:; worker-src 'self' blob:; frame-src 'self' https://verify.walletconnect.com https://verify.walletconnect.org https://secure.walletconnect.com https://challenges.cloudflare.com https://auth.privy.io https://dexscreener.com https://s.tradingview.com https://www.geckoterminal.com;",
          },
        ],
      },
      {
        // CORS headers on API routes (Next.js /api/* routes)
        source: "/api/(.*)",
        headers: [
          {
            key: "Access-Control-Allow-Origin",
            value: isDev ? "*" : "https://thearcfun.xyz",
          },
          {
            key: "Access-Control-Allow-Methods",
            value: "GET, POST, PUT, PATCH, DELETE, OPTIONS",
          },
          {
            key: "Access-Control-Allow-Headers",
            value: "Content-Type, Authorization",
          },
          {
            key: "Access-Control-Allow-Credentials",
            value: isDev ? "false" : "true",
          },
        ],
      },
    ];
  },

  async rewrites() {
    return [
      { source: '/recover', destination: '/' },
      { source: '/swap', destination: '/bridge' },
    ];
  },
};

export default nextConfig;

