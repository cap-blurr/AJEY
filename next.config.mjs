/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  webpack: (config, { isServer }) => {
    config.resolve = config.resolve || {}
    config.resolve.alias = {
      ...(config.resolve.alias || {}),
      'utf-8-validate': false,
      'bufferutil': false,
      ...(isServer ? {} : { ws: false }),
      // node-fetch v2 optional dep used by @google/genai and walletconnect
      'encoding': false,
    }
    return config
  },
}

export default nextConfig
