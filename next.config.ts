import type { NextConfig } from 'next'
import path from 'path'

const nextConfig: NextConfig = {
  turbopack: {
    // Pin the workspace root to this project, avoiding false detection of the parent lockfile
    root: path.resolve(__dirname),
  },
  async headers() {
    return [
      {
        // Allow /races/*/embed to be framed by any origin
        source: '/races/:code/embed',
        headers: [
          { key: 'X-Frame-Options', value: 'ALLOWALL' },
          { key: 'Content-Security-Policy', value: "frame-ancestors *" },
        ],
      },
    ]
  },
}

export default nextConfig
