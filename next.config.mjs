/** @type {import('next').NextConfig} */
const config = {
  reactStrictMode: true,
  poweredByHeader: false,
  experimental: {
    typedRoutes: true
  },
  // Square CDN images will be added in Phase 3
  images: {
    remotePatterns: []
  }
}

export default config
