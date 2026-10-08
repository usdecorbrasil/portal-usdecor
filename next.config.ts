import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      // Foto ou PDF da nota de despesa sobe por Server Action (até 10 MB)
      bodySizeLimit: "12mb",
    },
  },
};

export default nextConfig;
