import type { NextConfig } from "next";

const config: NextConfig = {
  agentRules: false,
  outputFileTracingIncludes: {
    "/api/admin/news": ["./public/fonts/*.ttf"],
    "/api/admin/news/automation": ["./public/fonts/*.ttf"],
    "/api/admin/news/prepare": ["./public/fonts/*.ttf"],
    "/api/instagram-assets/*/*": ["./public/fonts/*.ttf"],
  },
};
export default config;
