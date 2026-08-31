import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The console renders clinical data server-side; nothing is statically exported.
  reactStrictMode: true,
};

export default nextConfig;
