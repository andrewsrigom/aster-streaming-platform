import { fileURLToPath } from "node:url";
import type { NextConfig } from "next";

const config: NextConfig = {
  output: "standalone",
  outputFileTracingRoot: fileURLToPath(new URL("../..", import.meta.url)),
  poweredByHeader: false,
  reactStrictMode: true,
  images: {
    localPatterns: [{ pathname: "/artwork/aster-v1.png", search: "" }],
    remotePatterns: [],
    deviceSizes: [480, 768, 1280],
    imageSizes: [160, 320],
    qualities: [75],
    formats: ["image/webp"],
    maximumResponseBody: 100 * 1024,
    maximumDiskCacheSize: 8 * 1024 * 1024,
    maximumRedirects: 0,
    dangerouslyAllowLocalIP: false,
    dangerouslyAllowSVG: false,
  },
};

export default config;
