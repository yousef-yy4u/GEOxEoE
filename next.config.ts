import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The parent EOE/ dir has its own lockfile (legacy app + playwright-core),
  // so pin this app as the workspace root to avoid root inference ambiguity.
  turbopack: { root: process.cwd() },
};

export default nextConfig;
