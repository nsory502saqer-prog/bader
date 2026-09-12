import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // مخرَج قائم بذاته: صورة Docker تحمل ما يلزم للتشغيل فقط، بلا شجرة
  // node_modules كاملة.
  output: 'standalone',
  typescript: {
    // البناء يفشل عند أي خطأ TypeScript — شرط من معايير القبول.
    ignoreBuildErrors: false,
  },
  eslint: {
    ignoreDuringBuilds: false,
  },
  images: {
    formats: ['image/webp'],
  },
  experimental: {
    serverActions: {
      bodySizeLimit: '12mb',
    },
  },
};

export default nextConfig;
