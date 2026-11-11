/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  output: 'standalone',
  distDir: '.next',
  experimental: {
    serverComponentsExternalPackages: [
      'python-shell',
      // OpenTelemetry SDK used for Arize AX tracing (lib/server/tracing.js):
      // loaded from node_modules at runtime instead of being bundled.
      '@opentelemetry/sdk-trace',
      '@opentelemetry/exporter-trace-otlp-proto',
      '@opentelemetry/resources',
      '@opentelemetry/context-async-hooks'
    ]
  }
};

export default nextConfig; 