/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "standalone",
  // Proxy API requests to the backend during dev (overridden by NEXT_PUBLIC_API_URL in prod)
  async rewrites() {
    return [
      {
        source: "/api/:path*",
        destination: `${process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000"}/api/:path*`,
      },
    ];
  },
};

export default nextConfig;
