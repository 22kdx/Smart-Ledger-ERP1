import type { RequestHandler } from "express";

type RateLimitOptions = {
  windowMs: number;
  maxRequests: number;
};

type Bucket = {
  count: number;
  resetAt: number;
};

const MAX_BUCKETS = 20_000;

export function createRateLimiter({
  windowMs,
  maxRequests,
}: RateLimitOptions): RequestHandler {
  const buckets = new Map<string, Bucket>();

  return (req, res, next) => {
    const now = Date.now();
    const key = req.ip || req.socket.remoteAddress || "unknown";
    let bucket = buckets.get(key);

    if (!bucket || bucket.resetAt <= now) {
      bucket = { count: 0, resetAt: now + windowMs };
      buckets.set(key, bucket);
    }

    if (buckets.size > MAX_BUCKETS) {
      for (const [bucketKey, value] of buckets) {
        if (value.resetAt <= now || buckets.size > MAX_BUCKETS) {
          buckets.delete(bucketKey);
        }
        if (buckets.size <= MAX_BUCKETS) break;
      }
    }

    if (bucket.count >= maxRequests) {
      res.setHeader(
        "Retry-After",
        String(Math.max(1, Math.ceil((bucket.resetAt - now) / 1000))),
      );
      res.status(429).json({ error: "rate_limited" });
      return;
    }

    bucket.count += 1;
    next();
  };
}
