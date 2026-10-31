import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  output: "standalone",
  devIndicators: false,
  async headers() {
    return [
      {
        source: "/fonts/:path*",
        headers: [
          {
            key: "Cache-Control",
            value: "public, max-age=31536000, stale-while-revalidate=86400",
          },
        ],
      },
      {
        source: "/artwork/:path*",
        headers: [
          {
            key: "Cache-Control",
            value: "public, max-age=2592000, stale-while-revalidate=86400",
          },
        ],
      },
    ];
  },
  async redirects() {
    return [
      { source: "/discover", destination: "/search", permanent: false },
      { source: "/albums", destination: "/search", permanent: false },
      { source: "/artists", destination: "/search", permanent: false },
      { source: "/liked", destination: "/library", permanent: false },
      { source: "/recent", destination: "/library", permanent: false },
      { source: "/album/:id", destination: "/search", permanent: false },
      { source: "/artist/:id", destination: "/search", permanent: false },
      { source: "/playlist/:id", destination: "/library", permanent: false },
    ];
  },
};

export default nextConfig;
