/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  output: 'standalone',
  distDir: '.next',
  experimental: {
    serverComponentsExternalPackages: ['python-shell']
  }
};

export default nextConfig; 