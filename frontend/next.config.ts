import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  cacheComponents: true,
  partialPrefetching: true,
  // A Note body may be up to 1,000,000 characters; with multi-byte text that passes the 1 MB default.
  experimental: { serverActions: { bodySizeLimit: "4mb" } },
};

export default nextConfig;
