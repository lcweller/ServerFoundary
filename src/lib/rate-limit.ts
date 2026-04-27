/**
 * Per-IP fixed-window rate limit (PROJECT.md §3.9).
 *
 * Pure in-memory. This is fine for the MVP because:
 *   - The Next.js process is a single replica behind Cloudflare; both
 *     authentication paths (/api/auth/login, /api/auth/signup) flow
 *     through the same instance.
 *   - The window is short (60s) so a process restart that loses state
 *     just resets the budget on the next call.
 *
 * When we shard the dashboard horizontally we'll move this to Redis (or
 * Postgres advisory locks). Until then this is enough to keep a casual
 * scripted password-stuffing attack from succeeding faster than fail2ban
 * can react.
 */

type Bucket = { count: number; resetAt: number };
const buckets = new Map<string, Bucket>();

export function rateLimit(
  key: string,
  opts: { max: number; windowMs: number },
): { ok: boolean; retryAfter: number } {
  const now = Date.now();
  let bucket = buckets.get(key);
  if (!bucket || bucket.resetAt <= now) {
    bucket = { count: 0, resetAt: now + opts.windowMs };
    buckets.set(key, bucket);
  }
  bucket.count += 1;
  if (bucket.count > opts.max) {
    return { ok: false, retryAfter: Math.ceil((bucket.resetAt - now) / 1000) };
  }
  return { ok: true, retryAfter: 0 };
}

/**
 * Best-effort GC. Called rarely so the map can't grow unbounded if
 * traffic is bursty across many IPs. Bucket entries are tiny (~24 B)
 * so we're not aggressive.
 */
let lastSweep = 0;
export function sweepExpiredBuckets() {
  const now = Date.now();
  if (now - lastSweep < 60_000) return;
  lastSweep = now;
  for (const [k, b] of buckets) {
    if (b.resetAt <= now) buckets.delete(k);
  }
}
