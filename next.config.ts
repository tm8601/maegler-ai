import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  cacheComponents: true,
  partialPrefetching: true,
  allowedDevOrigins: [
    "127.0.0.1",
    "localhost",
    "maegler.ai-beregner.dk",
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
