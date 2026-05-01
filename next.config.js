/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  experimental: {
    optimizePackageImports: ["date-fns", "lucide-react"],
  },
};

module.exports = nextConfig;
