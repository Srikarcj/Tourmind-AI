const buckets = new Map();

const cleanupBuckets = () => {
  const now = Date.now();

  for (const [key, bucket] of buckets.entries()) {
    if (bucket.expiresAt <= now) {
      buckets.delete(key);
    }
  }
};

setInterval(cleanupBuckets, 60_000).unref();

export const createRateLimiter = ({ windowMs = 60_000, max = 120 } = {}) => (req, res, next) => {
  const ip = req.headers["x-forwarded-for"]?.toString().split(",")[0].trim() || req.socket.remoteAddress || "unknown";
  const key = `${ip}:${req.path}`;
  const now = Date.now();

  const current = buckets.get(key);

  if (!current || current.expiresAt <= now) {
    buckets.set(key, {
      count: 1,
      expiresAt: now + windowMs
    });
    return next();
  }

  if (current.count >= max) {
    return res.status(429).json({
      message: "Too many requests. Please try again shortly."
    });
  }

  current.count += 1;
  buckets.set(key, current);
  return next();
};
