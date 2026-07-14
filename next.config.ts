import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["@wecom/aibot-node-sdk"],
  transpilePackages: ["dingtalk-jsapi"],
};

export default nextConfig;
