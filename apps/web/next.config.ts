/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "standalone",
  serverExternalPackages: ["mysql2"],
  experimental: {
    serverActions: {
      bodySizeLimit: "6mb",
    },
  },
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'images.unsplash.com', // Unsplash 허용
        port: '',
        pathname: '/**',
      },
    ],
  },
};

export default nextConfig;
