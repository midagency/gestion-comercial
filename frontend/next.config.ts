import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Evita confusión si hay package-lock en la carpeta padre del monorepo
  outputFileTracingRoot: path.join(__dirname),
};

export default nextConfig;
