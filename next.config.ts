import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The console renders clinical data server-side; nothing is statically exported.
  reactStrictMode: true,
  // The Medtechs page became People (14zcqntkd0v): old links and bookmarks still land,
  // query string (organization, search, sort, page) included.
  async redirects() {
    return [
      { source: "/medtechs", destination: "/people", permanent: true },
      { source: "/medtechs/:userId", destination: "/people/:userId", permanent: true },
    ];
  },
};

export default nextConfig;
