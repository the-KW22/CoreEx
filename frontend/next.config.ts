import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  // The end-to-end tests build into their own folder, so they do not disturb a running `npm run dev`.
  distDir: process.env.E2E_BUILD ? ".next-e2e" : ".next",
  cacheComponents: true,
  partialPrefetching: true,
  // A Note body may be up to 1,000,000 characters; with multi-byte text that passes the 1 MB default.
  experimental: { serverActions: { bodySizeLimit: "4mb" } },
  // The Resume PDF route reads the Inter files from public/fonts at run time, so they must ship with that function.
  outputFileTracingIncludes: { "/export/resume-pdf": ["./public/fonts/*.woff"] },
  // The MCP guide moved into the Docs (docs/DESIGN.md section 6.11); old links keep working.
  async redirects() {
    return [{ source: "/help/mcp", destination: "/docs/mcp", permanent: true }];
  },
};

export default nextConfig;
