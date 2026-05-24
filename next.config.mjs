/** @type {import('next').NextConfig} */
const config = {
  reactStrictMode: true,
  poweredByHeader: false,
  output: 'standalone',
  experimental: {
    typedRoutes: true,
    // isomorphic-dompurify pulls in jsdom (heavy native deps); keep it
    // out of the server-component bundle so Next traces the package's
    // own files (including jsdom's default-stylesheet.css).
    serverComponentsExternalPackages: ['isomorphic-dompurify']
  },
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'items-images-production.s3.us-west-2.amazonaws.com'
      },
      {
        protocol: 'https',
        hostname: 'items-images-sandbox.s3.us-west-2.amazonaws.com'
      }
    ]
  }
}

export default config
