/** @type {import('next').NextConfig} */
const nextConfig = {
  swcMinify: false,
  experimental: { optimizeCss: false },
  eslint: { ignoreDuringBuilds: true },
  typescript: { ignoreBuildErrors: true },
};
module.exports = nextConfig;
