import { routes, type VercelConfig } from "@vercel/config/v1";

// Security headers (CSP and friends) live in next.config.ts so they apply on
// every host, including local production builds. This file keeps only the
// platform cache policy for immutable model and wasm assets.
export const config: VercelConfig = {
  framework: "nextjs",
  buildCommand: "npm run build",
  headers: [
    routes.cacheControl("/models/(.*)", {
      public: true,
      maxAge: "1 year",
      immutable: true,
    }),
    routes.cacheControl("/ort/(.*)", {
      public: true,
      maxAge: "1 year",
      immutable: true,
    }),
  ],
};
