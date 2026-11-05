import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The console renders clinical data server-side; nothing is statically exported.
  reactStrictMode: true,
  experimental: {
    // Keep a page the person already opened in this tab for 30 s, so moving back and forth
    // between sidebar pages is instant (14zcqntkd0y). A server action's revalidatePath()
    // clears it, so one's own changes show at once; anything else is at most 30 s old, and
    // a revoked admin is refused on their next page that is not in this cache.
    staleTimes: { dynamic: 30 },
  },
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
