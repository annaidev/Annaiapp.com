import type { Request, Response, NextFunction } from "express";

type RateLimitEntry = {
  count: number;
  resetAt: number;
};

type RateLimitOptions = {
  windowMs: number;
  max: number;
  message: string;
  keyGenerator?: (req: Request) => string;
};

const rateLimitBuckets = new Map<string, RateLimitEntry>();

function defaultKeyGenerator(req: Request): string {
  return `${req.path}:${req.ip}`;
}

export function createRateLimit(options: RateLimitOptions) {
  const { windowMs, max, message, keyGenerator = defaultKeyGenerator } = options;

  return (req: Request, res: Response, next: NextFunction) => {
    const now = Date.now();
    const bucketKey = keyGenerator(req);
    const current = rateLimitBuckets.get(bucketKey);

    if (!current || current.resetAt <= now) {
      rateLimitBuckets.set(bucketKey, {
        count: 1,
        resetAt: now + windowMs,
      });
      return next();
    }

    if (current.count >= max) {
      const retryAfterSeconds = Math.max(1, Math.ceil((current.resetAt - now) / 1000));
      res.setHeader("Retry-After", String(retryAfterSeconds));
      return res.status(429).json({ message });
    }

    current.count += 1;
    rateLimitBuckets.set(bucketKey, current);
    return next();
  };
}
