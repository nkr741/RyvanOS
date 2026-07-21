import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: process.env.DOCKER_BUILD === "1" ? "standalone" : undefined,
  images: {
    remotePatterns: [],
    unoptimized: true,
  },
  serverExternalPackages: ["bcryptjs", "jsonwebtoken", "pg"],
  devIndicators: false,
};

export default nextConfig;
