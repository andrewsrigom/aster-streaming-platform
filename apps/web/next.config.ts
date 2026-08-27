import { fileURLToPath } from "node:url";
import type { NextConfig } from "next";

const config: NextConfig = {
  output: "standalone",
  outputFileTracingRoot: fileURLToPath(new URL("../..", import.meta.url)),
  poweredByHeader: false,
  reactStrictMode: true,
  images: { remotePatterns: [], deviceSizes: [480, 768, 1280], imageSizes: [160, 320] },
};

export default config;
