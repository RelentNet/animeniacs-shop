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
    // No remote hosts: product art is served same-origin via the /api/art proxy
    // (which downscales + hides the original Square url), and avatars / mockup
    // scenes are local /public assets. Whitelisting the Square S3 hosts here
    // would let /_next/image be abused to fetch the print-res originals.
    remotePatterns: []
  }
}

export default config
