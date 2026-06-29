import type { NextConfig } from 'next'
import path from 'path'

const nextConfig: NextConfig = {
  turbopack: {
    // Pin the workspace root to this project, avoiding false detection of the parent lockfile
    root: path.resolve(__dirname),
  },
}

export default nextConfig
