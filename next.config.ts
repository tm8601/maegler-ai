import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  cacheComponents: true,
  partialPrefetching: true,
  allowedDevOrigins: [
    "127.0.0.1",
    "192.168.86.47",
    "100.126.14.87",
    "*.ai-beregner.dk",
  ],
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    ];
  },
};

export default nextConfig;
