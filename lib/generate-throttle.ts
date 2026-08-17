/**
 * Per-IP rate limiter for the account-minting generate route (app/api/generate).
 *
 * Every request to that route mints a fresh WARP account against Cloudflare's
 * `/reg` (rate-limited per egress IP on their side). This keeps the mint rate
 * bounded per client IP. Modules running `next dev` or a standalone/Docker
 * build hold this state in the one (or a few) Node processes; on serverless
 * (Vercel/Netlify) it is a soft per-function throttle, not a hard global cap.
 * Mirrors the worker's registrationThrottled idiom (worker/index.js) —
 * module-state counters with a test hook.
 */

const GENERATE_WINDOW_MS = 60 * 1000; // 1 minute rolling window
const GENERATE_MAX_PER_WINDOW = 5; // account-minting requests per IP per window

const generateAttempts = new Map<string, { count: number; firstAt: number }>();

/** Test hook (same convention as the worker's __resetRegistrationThrottle). */
export function __resetGenerateThrottle() {
  generateAttempts.clear();
}

/**
 * Throttle one account-minting request. Returns an error message or null.
 * Per-IP windowed cap: every IP may mint at most GENERATE_MAX_PER_WINDOW new
 * accounts per minute. Cloudflare also rate-limits `/reg` per egress IP, so
 * the per-IP cap is the meaningful control and stays deterministic to test.
 */
export function throttleGenerate(ip: string): string | null {
  const now = Date.now();
  const entry = generateAttempts.get(ip);

  if (!entry || now - entry.firstAt >= GENERATE_WINDOW_MS) {
    generateAttempts.set(ip, { count: 1, firstAt: now });
    return null;
  }

  if (entry.count >= GENERATE_MAX_PER_WINDOW) {
    return `Rate limit reached — try again in a minute.`;
  }

  entry.count += 1;
  return null;
}
