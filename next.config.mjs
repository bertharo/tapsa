/** @type {import('next').NextConfig} */
// Note: the dev script sets WATCHPACK_POLLING=true. macOS's FSEvents-based file
// watcher exhausts per-process stream limits (EMFILE) on large trees like
// node_modules, which made Next's config watcher emit phantom change events and
// restart in a loop. Global watchpack polling avoids native watchers entirely.
const nextConfig = {
  reactStrictMode: true,
};

export default nextConfig;
