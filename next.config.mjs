/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  webpack(config, { dev }) {
    // macOS has a low default file-descriptor limit; the native file watcher
    // exhausts it (EMFILE) and emits phantom change events, causing a dev
    // restart loop. Polling avoids per-file watchers entirely.
    if (dev) {
      config.watchOptions = {
        poll: 1000,
        aggregateTimeout: 300,
        ignored: ["**/node_modules", "**/.next", "**/.git", "**/.tapsa-cache"],
      };
    }
    return config;
  },
};

export default nextConfig;
