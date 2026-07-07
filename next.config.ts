import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  // Safety net for the native better-sqlite3 addon: force the compiled binary into
  // the standalone trace even if @vercel/nft misses it (most common standalone break).
  outputFileTracingIncludes: {
    "/*": ["./node_modules/better-sqlite3/build/Release/better_sqlite3.node"],
  },
};

export default nextConfig;
