/** @type {import('next').NextConfig} */
const nextConfig = {
  outputFileTracingRoot: __dirname,
  experimental: { optimizeCss: false },
  eslint: { ignoreDuringBuilds: true },
  typescript: { ignoreBuildErrors: true },
  async headers() {
    return [
      {
        // Disable caching for HTML documents to avoid stale buildId references
        source: '/:path*',
        has: [{ type: 'header', key: 'Accept', value: 'text/html' }],
        headers: [
          { key: 'Cache-Control', value: 'no-store, must-revalidate' },
        ],
      },
    ]
  },
};
module.exports = nextConfig;
