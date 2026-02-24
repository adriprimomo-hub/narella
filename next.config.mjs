/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    unoptimized: true,
  },
  outputFileTracingIncludes: {
    "/api/*": ["./certs/afip/**/*"],
    "/api/**/*": ["./certs/afip/**/*"],
  },
}

export default nextConfig
