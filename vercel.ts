import { routes, type VercelConfig } from "@vercel/config/v1";

export const config: VercelConfig = {
  framework: "nextjs",
  buildCommand: "npm run build",
  headers: [
    {
      source: "/(.*)",
      headers: [
        { key: "X-Content-Type-Options", value: "nosniff" },
        { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
        { key: "X-Frame-Options", value: "DENY" },
      ],
    },
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
