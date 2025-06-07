/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  swcMinify: true,
  experimental: {
    appDir: true
  },
  output: 'standalone',
  distDir: '.next'
};

export default nextConfig; 