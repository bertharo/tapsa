/**
 * The public base URL of the deployed site, used for absolute metadata URLs
 * (og:image, twitter:image, canonical). Resolution order:
 *   1. NEXT_PUBLIC_SITE_URL  (set to https://www.tapsa.ai in Vercel env vars)
 *   2. https://$VERCEL_URL    (the per-deployment URL Vercel injects)
 *   3. https://www.tapsa.ai   (production fallback)
 *
 * Never returns localhost, so shared links resolve correctly in production.
 */
export function getSiteUrl(): string {
  const fromEnv = process.env.NEXT_PUBLIC_SITE_URL;
  if (fromEnv) return fromEnv.replace(/\/+$/, "");
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  return "https://www.tapsa.ai";
}
